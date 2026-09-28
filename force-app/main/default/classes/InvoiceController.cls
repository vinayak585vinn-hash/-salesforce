public with sharing class InvoiceController {

    // ========================================
    // 1. Retrieve Accounts
    // ========================================

    @AuraEnabled(cacheable=true)
    public static List<Account> getAccounts() {

        return [
            SELECT Id, Name
            FROM Account
            ORDER BY Name
            LIMIT 100
        ];
    }


    // ========================================
    // 2. Retrieve Opportunities
    // ========================================

    @AuraEnabled(cacheable=true)
    public static List<Opportunity> getOpportunities(
        Id accountId
    ) {

        if (accountId == null) {
            return new List<Opportunity>();
        }

        return [
            SELECT Id, Name, Amount, AccountId
            FROM Opportunity
            WHERE AccountId = :accountId
            ORDER BY CreatedDate DESC
            LIMIT 100
        ];
    }


    // ========================================
    // 3. Retrieve Products and Prices
    // ========================================

    @AuraEnabled(cacheable=true)
    public static List<PricebookEntry> getProducts() {

        Id standardPricebookId = Test.isRunningTest()
            ? Test.getStandardPricebookId()
            : [
                SELECT Id
                FROM Pricebook2
                WHERE IsStandard = true
                LIMIT 1
            ].Id;

        return [
            SELECT
                Id,
                Product2Id,
                Product2.Name,
                UnitPrice,
                Product2.IsActive
            FROM PricebookEntry
            WHERE Pricebook2Id = :standardPricebookId
            AND IsActive = true
            AND Product2.IsActive = true
            ORDER BY Product2.Name
        ];
    }


    // ========================================
    // 4. Wrapper Class for Line Items
    // ========================================

    public class LineItemInput {

        @AuraEnabled
        public Id productId;

        @AuraEnabled
        public Decimal quantity;
    }


    // ========================================
    // 5. Save Invoice and Line Items
    // ========================================

    @AuraEnabled
    public static Id saveInvoice(
        Id accountId,
        Id opportunityId,
        Date invoiceDate,
        String lineItemsJson
    ) {

        // Validate required fields

        if (accountId == null ||
            opportunityId == null ||
            invoiceDate == null ||
            String.isBlank(lineItemsJson)) {

            throw new AuraHandledException(
                'Please provide all required invoice details.'
            );
        }


        // Deserialize line items

        List<LineItemInput> lineItems =
            (List<LineItemInput>) JSON.deserialize(
                lineItemsJson,
                List<LineItemInput>.class
            );


        if (lineItems.isEmpty()) {

            throw new AuraHandledException(
                'At least one line item is required.'
            );
        }


        // Validate Opportunity and Account relationship

        Opportunity opp = [
            SELECT Id, AccountId
            FROM Opportunity
            WHERE Id = :opportunityId
            LIMIT 1
        ];

        if (opp.AccountId != accountId) {

            throw new AuraHandledException(
                'The selected Opportunity does not belong to the selected Customer.'
            );
        }


        // Retrieve Standard Price Book

        Id standardPricebookId = Test.isRunningTest()
            ? Test.getStandardPricebookId()
            : [
                SELECT Id
                FROM Pricebook2
                WHERE IsStandard = true
                LIMIT 1
            ].Id;


        // Collect Product IDs

        Set<Id> productIds = new Set<Id>();

        for (LineItemInput item : lineItems) {

            if (item.productId == null ||
                item.quantity == null ||
                item.quantity <= 0) {

                throw new AuraHandledException(
                    'Each line item must have a valid product and quantity.'
                );
            }

            productIds.add(item.productId);
        }


        // Query Product Prices

        Map<Id, PricebookEntry> pricebookEntriesByProduct =
            new Map<Id, PricebookEntry>();

        for (PricebookEntry pbe : [

            SELECT
                Id,
                Product2Id,
                UnitPrice
            FROM PricebookEntry
            WHERE Pricebook2Id = :standardPricebookId
            AND Product2Id IN :productIds
            AND IsActive = true

        ]) {

            pricebookEntriesByProduct.put(
                pbe.Product2Id,
                pbe
            );
        }


        // Create Invoice Header

        Invoice__c invoice = new Invoice__c();

        invoice.Name = 'Invoice - ' +
            DateTime.now().format('yyyyMMddHHmmss');

        invoice.Customer__c = accountId;
        invoice.Opportunity__c = opportunityId;
        invoice.Invoice_Date__c = invoiceDate;
        invoice.Status__c = 'Draft';

        insert invoice;


        // Create Invoice Line Items

        List<Invoice_Line_Item__c> invoiceLineItems =
            new List<Invoice_Line_Item__c>();

        for (LineItemInput item : lineItems) {

            if (!pricebookEntriesByProduct.containsKey(
                item.productId
            )) {

                throw new AuraHandledException(
                    'No active price found for one of the selected products.'
                );
            }

            Decimal unitPrice =
                pricebookEntriesByProduct.get(
                    item.productId
                ).UnitPrice;


            Invoice_Line_Item__c lineItem =
                new Invoice_Line_Item__c();

            lineItem.Invoice__c = invoice.Id;
            lineItem.Product__c = item.productId;
            lineItem.Quantity__c = item.quantity;
            lineItem.Unit_Price__c = unitPrice;

            invoiceLineItems.add(lineItem);
        }


        // Insert Line Items

        insert invoiceLineItems;


        // Return Invoice ID

        return invoice.Id;
    }
}