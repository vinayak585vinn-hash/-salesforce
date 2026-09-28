import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';

import ACCOUNT_FIELD from '@salesforce/schema/Opportunity.AccountId';
import ACCOUNT_NAME_FIELD from '@salesforce/schema/Opportunity.Account.Name';
import OPPORTUNITY_NAME_FIELD from '@salesforce/schema/Opportunity.Name';

import getProducts from '@salesforce/apex/InvoiceController.getProducts';
import saveInvoice from '@salesforce/apex/InvoiceController.saveInvoice';

const FIELDS = [
    ACCOUNT_FIELD,
    ACCOUNT_NAME_FIELD,
    OPPORTUNITY_NAME_FIELD
];

export default class InvoiceCreator extends LightningElement {

    @api recordId;

    // ============================================================
    // STEP 1 - INVOICE INFORMATION
    // ============================================================

    selectedAccountId;
    selectedOpportunityId;

    customerName = '';
    opportunityName = '';
    invoiceDate;


    // ============================================================
    // STEP 2 - LINE ITEMS
    // ============================================================

    products = [];
    lineItems = [];

    lineItemCounter = 0;


    // ============================================================
    // UI STATE
    // ============================================================

    isLoading = false;
    errorMessage = '';
    currentStep = 1;


    // ============================================================
    // GET OPPORTUNITY INFORMATION
    // ============================================================

    @wire(getRecord, {
        recordId: '$recordId',
        fields: FIELDS
    })
    wiredOpportunity({ error, data }) {

        if (data) {

            // Current record is the Opportunity
            this.selectedOpportunityId = this.recordId;

            // Get Account
            this.selectedAccountId =
                getFieldValue(data, ACCOUNT_FIELD);

            // Get Account Name
            this.customerName =
                getFieldValue(data, ACCOUNT_NAME_FIELD);

            // Get Opportunity Name
            this.opportunityName =
                getFieldValue(data, OPPORTUNITY_NAME_FIELD);

            this.errorMessage = '';

        } else if (error) {

            this.errorMessage =
                this.getErrorMessage(error);
        }
    }


    // ============================================================
    // COMPONENT INITIALIZATION
    // ============================================================

    connectedCallback() {

        const today = new Date();

        const year = today.getFullYear();

        const month =
            String(today.getMonth() + 1).padStart(2, '0');

        const day =
            String(today.getDate()).padStart(2, '0');

        this.invoiceDate =
            `${year}-${month}-${day}`;
    }


    // ============================================================
    // INVOICE DATE CHANGE
    // ============================================================

    handleInvoiceDateChange(event) {

        this.invoiceDate =
            event.target.value;

        this.errorMessage = '';
    }


    // ============================================================
    // STEP 1 -> STEP 2
    // ============================================================

    handleNext() {

        this.errorMessage = '';

        // Validate Customer
        if (!this.selectedAccountId) {

            this.errorMessage =
                'Customer is required.';

            return;
        }

        // Validate Opportunity
        if (!this.selectedOpportunityId) {

            this.errorMessage =
                'Opportunity is required.';

            return;
        }

        // Validate Invoice Date
        if (!this.invoiceDate) {

            this.errorMessage =
                'Invoice Date is required.';

            return;
        }

        // Load products
        this.loadProducts();
    }


    // ============================================================
    // LOAD PRODUCTS
    // ============================================================

    loadProducts() {

        this.isLoading = true;
        this.errorMessage = '';

        getProducts()
            .then(result => {

                this.products = (result || []).map(product => ({
                    id: product.Product2Id,
                    name: product.Product2
                        ? product.Product2.Name
                        : '',
                    price: product.UnitPrice
                }));

                if (this.lineItems.length === 0) {
                    this.addLineItem();
                }

                this.currentStep = 2;
            })
            .catch(error => {

                this.errorMessage =
                    this.getErrorMessage(error);
            })
            .finally(() => {

                this.isLoading = false;
            });
    }


    // ============================================================
    // PRODUCT DROPDOWN OPTIONS
    // ============================================================

    get productOptions() {

        return this.products.map(product => {

            return {
                label:
                    `${product.name} - ₹${this.formatNumber(product.price)}`,

                value:
                    product.id
            };

        });
    }


    // ============================================================
    // ADD LINE ITEM
    // ============================================================

    addLineItem() {

        this.lineItemCounter++;

        this.lineItems = [
            ...this.lineItems,

            {
                id: this.lineItemCounter,
                productId: '',
                quantity: 1,
                unitPrice: 0,
                lineTotal: 0
            }
        ];
    }


    // ============================================================
    // PRODUCT CHANGE
    // ============================================================

    handleProductChange(event) {

        const lineItemId =
            Number(event.target.dataset.id);

        const productId =
            event.detail.value;

        const selectedProduct =
            this.products.find(
                product =>
                    product.id === productId
            );

        this.lineItems =
            this.lineItems.map(item => {

                if (item.id === lineItemId) {

                    const unitPrice =
                        selectedProduct
                            ? Number(selectedProduct.price)
                            : 0;

                    const quantity =
                        Number(item.quantity) || 0;

                    return {
                        ...item,

                        productId:
                            productId,

                        unitPrice:
                            unitPrice,

                        lineTotal:
                            quantity * unitPrice
                    };
                }

                return item;
            });

        this.errorMessage = '';
    }


    // ============================================================
    // QUANTITY CHANGE
    // ============================================================

    handleQuantityChange(event) {

        const lineItemId =
            Number(event.target.dataset.id);

        let quantity =
            Number(event.target.value);

        /*
         * Keep invalid/blank quantities as 0.
         * Save validation will prevent the invoice
         * from being submitted until a valid quantity
         * greater than 0 is entered.
         */

        if (Number.isNaN(quantity) || quantity < 0) {

            quantity = 0;
        }

        this.lineItems =
            this.lineItems.map(item => {

                if (item.id === lineItemId) {

                    return {
                        ...item,

                        quantity:
                            quantity,

                        lineTotal:
                            quantity *
                            Number(item.unitPrice || 0)
                    };
                }

                return item;
            });

        this.errorMessage = '';
    }


    // ============================================================
    // REMOVE LINE ITEM
    // ============================================================

    removeLineItem(event) {

        const lineItemId =
            Number(event.target.dataset.id);

        this.lineItems =
            this.lineItems.filter(
                item =>
                    item.id !== lineItemId
            );

        this.errorMessage = '';
    }


    // ============================================================
    // GRAND TOTAL
    // ============================================================

    get grandTotal() {

        return this.lineItems.reduce(
            (total, item) => {

                return total +
                    Number(item.lineTotal || 0);

            },
            0
        );
    }


    // ============================================================
    // FORMATTED GRAND TOTAL
    // ============================================================

    get formattedGrandTotal() {

        return new Intl.NumberFormat(
            'en-IN',
            {
                style: 'currency',
                currency: 'INR',
                minimumFractionDigits: 2
            }
        ).format(this.grandTotal);
    }


    // ============================================================
    // BACK TO STEP 1
    // ============================================================

    handleBack() {

        this.currentStep = 1;

        this.errorMessage = '';
    }


    // ============================================================
    // SAVE INVOICE
    // ============================================================

    async handleSave() {

        this.errorMessage = '';

        // ========================================================
        // VALIDATE HEADER
        // ========================================================

        if (!this.selectedAccountId) {

            this.errorMessage =
                'Customer is required.';

            return;
        }

        if (!this.selectedOpportunityId) {

            this.errorMessage =
                'Opportunity is required.';

            return;
        }

        if (!this.invoiceDate) {

            this.errorMessage =
                'Invoice Date is required.';

            return;
        }


        // ========================================================
        // VALIDATE LINE ITEMS
        // ========================================================

        if (!this.lineItems.length) {

            this.errorMessage =
                'Please add at least one line item.';

            return;
        }

        const invalidLineItem =
            this.lineItems.find(item => {

                return (
                    !item.productId ||
                    !item.quantity ||
                    Number(item.quantity) <= 0
                );

            });

        if (invalidLineItem) {

            this.errorMessage =
                'Please select a product and enter a valid quantity for all line items.';

            return;
        }


        // ========================================================
        // PREPARE DATA FOR APEX
        // ========================================================

        const lineItemsForApex =
            this.lineItems.map(item => {

                return {
                    productId:
                        item.productId,

                    quantity:
                        Number(item.quantity)
                };

            });


        // ========================================================
        // START LOADING
        // ========================================================

        this.isLoading = true;


        try {

            // ====================================================
            // SAVE INVOICE + LINE ITEMS
            // ====================================================

            const invoiceId =
                await saveInvoice({

                    accountId:
                        this.selectedAccountId,

                    opportunityId:
                        this.selectedOpportunityId,

                    invoiceDate:
                        this.invoiceDate,

                    lineItemsJson:
                        JSON.stringify(
                            lineItemsForApex
                        )
                });


            // ====================================================
            // VALIDATE RETURNED INVOICE ID
            // ====================================================

            if (!invoiceId) {

                throw new Error(
                    'Invoice was not created. No Invoice Id was returned.'
                );
            }


            // ====================================================
            // NAVIGATE TO CREATED INVOICE
            // ====================================================

            window.location.href =
                `/lightning/r/Invoice__c/${invoiceId}/view`;


        } catch (error) {

            // ====================================================
            // DISPLAY ERROR
            // ====================================================

            this.errorMessage =
                this.getErrorMessage(error);

        } finally {

            // ====================================================
            // STOP LOADING
            // ====================================================

            this.isLoading = false;
        }
    }


    // ============================================================
    // ERROR MESSAGE HANDLER
    // ============================================================

    getErrorMessage(error) {

        if (!error) {

            return 'An unknown error occurred.';
        }


        // Apex error array
        if (error.body) {

            if (Array.isArray(error.body)) {

                return error.body
                    .map(item => item.message)
                    .join(', ');
            }


            // Standard Apex error
            if (error.body.message) {

                return error.body.message;
            }
        }


        // JavaScript error
        if (error.message) {

            return error.message;
        }


        return 'An unexpected error occurred.';
    }


    // ============================================================
    // NUMBER FORMATTING
    // ============================================================

    formatNumber(value) {

        return new Intl.NumberFormat(
            'en-IN',
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        ).format(
            Number(value || 0)
        );
    }


    // ============================================================
    // STEP GETTERS
    // ============================================================

    get isStepOne() {

        return this.currentStep === 1;
    }


    get isStepTwo() {

        return this.currentStep === 2;
    }
}