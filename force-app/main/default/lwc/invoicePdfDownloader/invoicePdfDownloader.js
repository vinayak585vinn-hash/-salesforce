import { LightningElement, api } from 'lwc';

export default class InvoicePdfDownloader extends LightningElement {
    @api recordId;

    handleDownloadPdf() {
        const pdfUrl = `/apex/InvoicePDF?id=${encodeURIComponent(this.recordId)}`;
        window.open(pdfUrl, '_blank');
    }
}