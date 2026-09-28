public with sharing class InvoicePDFController {

    public Invoice__c invoice { get; set; }
    public List<InvoiceLineItemWrapper> lineItems { get; set; }

    public InvoicePDFController() {

        String invoiceId = ApexPages.currentPage().getParameters().get('id');

        lineItems = new List<InvoiceLineItemWrapper>();

        if (String.isBlank(invoiceId)) {
            return;
        }

        invoice = [
            SELECT
                Id,
                Name,
                Customer__c,
                Customer__r.Name,
                Opportunity__c,
                Opportunity__r.Name,
                Invoice_Date__c,
                Status__c,
                Total_Amount__c
            FROM Invoice__c
            WHERE Id = :invoiceId
            LIMIT 1
        ];

        List<Invoice_Line_Item__c> records = [
            SELECT
                Id,
                Name,
                Product__c,
                Product__r.Name,
                Quantity__c,
                Unit_Price__c
            FROM Invoice_Line_Item__c
            WHERE Invoice__c = :invoiceId
            ORDER BY CreatedDate ASC
        ];

        for (Invoice_Line_Item__c item : records) {
            lineItems.add(new InvoiceLineItemWrapper(item));
        }
    }

    public Decimal getGrandTotal() {

        Decimal total = 0;

        for (InvoiceLineItemWrapper item : lineItems) {
            total += item.lineTotal;
        }

        return total;
    }

    public class InvoiceLineItemWrapper {

        public Invoice_Line_Item__c item { get; set; }
        public Decimal lineTotal { get; set; }

        public InvoiceLineItemWrapper(Invoice_Line_Item__c item) {

            this.item = item;

            Decimal quantity = item.Quantity__c == null
                ? 0
                : item.Quantity__c;

            Decimal unitPrice = item.Unit_Price__c == null
                ? 0
                : item.Unit_Price__c;

            this.lineTotal = quantity * unitPrice;
        }
    }
}