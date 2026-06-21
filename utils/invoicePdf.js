/**
 * GST-compliant invoice PDF generation (spec §9) using pdfkit. Writes to
 * uploads/invoices/{invoiceNumber}.pdf and returns the served URL.
 * Firm details come from env (FIRM_NAME / FIRM_ADDRESS / FIRM_GST).
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const logger = require('./logger');

const invoicesDir = path.join(__dirname, '../uploads/invoices');
if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true });

const FIRM = {
  name: process.env.FIRM_NAME || 'EuProximaX',
  address: process.env.FIRM_ADDRESS || '',
  gst: process.env.FIRM_GST || ''
};

const money = (n, currency = 'INR') =>
  `${currency} ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

/**
 * @returns {Promise<string>} the relative URL of the generated PDF
 */
const generateInvoicePdf = (payment, client, caseDoc) =>
  new Promise((resolve, reject) => {
    try {
      const fileName = `${payment.invoiceNumber}.pdf`;
      const filePath = path.join(invoicesDir, fileName);
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).fillColor('#111827').text(FIRM.name, { align: 'left' });
      if (FIRM.address) doc.fontSize(9).fillColor('#6b7280').text(FIRM.address);
      if (FIRM.gst) doc.fontSize(9).fillColor('#6b7280').text(`GSTIN: ${FIRM.gst}`);
      doc.moveDown(0.5);
      doc.fontSize(16).fillColor('#111827').text('TAX INVOICE', { align: 'right' });
      doc.fontSize(10).fillColor('#374151')
        .text(`Invoice: ${payment.invoiceNumber}`, { align: 'right' })
        .text(`Date: ${new Date(payment.invoicedAt || Date.now()).toLocaleDateString()}`, { align: 'right' });
      if (payment.dueDate) doc.text(`Due: ${new Date(payment.dueDate).toLocaleDateString()}`, { align: 'right' });

      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
      doc.moveDown(1);

      // Bill to
      doc.fontSize(11).fillColor('#111827').text('Bill To:', { continued: false });
      doc.fontSize(10).fillColor('#374151').text(client?.name || '');
      if (client?.email) doc.text(client.email);
      if (client?.address) doc.text(client.address);
      if (client?.gstNumber) doc.text(`GSTIN: ${client.gstNumber}`);
      doc.fontSize(9).fillColor('#6b7280').text(`Case: ${caseDoc?.caseNumber || ''}`);

      doc.moveDown(1.5);

      // Line item table
      const top = doc.y;
      doc.fontSize(10).fillColor('#6b7280');
      doc.text('Description', 50, top);
      doc.text('Amount', 400, top, { width: 95, align: 'right' });
      doc.moveTo(50, top + 16).lineTo(545, top + 16).strokeColor('#e5e7eb').stroke();

      let y = top + 26;
      doc.fillColor('#111827').fontSize(10);
      doc.text(payment.milestoneLabel || payment.type, 50, y, { width: 340 });
      doc.text(money(payment.amount, payment.currency), 400, y, { width: 95, align: 'right' });

      y += 30;
      const line = (label, value, bold) => {
        doc.fontSize(10).fillColor(bold ? '#111827' : '#374151');
        if (bold) doc.font('Helvetica-Bold'); else doc.font('Helvetica');
        doc.text(label, 300, y, { width: 90, align: 'right' });
        doc.text(value, 400, y, { width: 95, align: 'right' });
        doc.font('Helvetica');
        y += 18;
      };
      line('Subtotal', money(payment.amount, payment.currency));
      line(`GST (${payment.gstPercent || 0}%)`, money(payment.gstAmount, payment.currency));
      line('Total', money(payment.totalAmount, payment.currency), true);

      doc.moveDown(4);
      doc.fontSize(8).fillColor('#9ca3af').text('This is a computer-generated invoice.', 50, 760, { align: 'center', width: 495 });

      doc.end();

      stream.on('finish', () => resolve(`/uploads/invoices/${fileName}`));
      stream.on('error', reject);
    } catch (err) {
      logger.error('Invoice PDF generation failed', { error: err.message });
      reject(err);
    }
  });

module.exports = { generateInvoicePdf };
