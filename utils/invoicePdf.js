/**
 * Professional GST-compliant invoice PDF generation using pdfkit.
 * Fetches company settings and generates a branded invoice with modern design.
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const logger = require('./logger');
const Settings = require('../models/Settings');
const https = require('https');
const http = require('http');

const invoicesDir = path.join(__dirname, '../uploads/invoices');
if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true });

// Download image from URL and convert to buffer
const fetchImageBuffer = (url) => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
};

const money = (n, currency = 'INR') =>
  `${currency} ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [26, 54, 93];
};

const hexToRgbStr = (hex) => hexToRgb(hex).join(',');

/**
 * @returns {Promise<string>} the relative URL of the generated PDF
 */
const generateInvoicePdf = async (payment, client, caseDoc) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Fetch company settings
      let settings = await Settings.findOne().lean();
      if (!settings) {
        settings = {
          companyName: 'EuProximaX',
          companyAddress: '',
          companyPhone: '',
          companyEmail: '',
          companyWebsite: '',
          companyGST: '',
          companyLogo: '',
          bankName: '',
          accountHolder: '',
          accountNumber: '',
          ifscCode: '',
          upiId: '',
          enableRazorpay: true,
          paymentTerms: 'Payment due within 30 days of invoice date',
          additionalTerms: '',
          primaryColor: '#1a365d',
          secondaryColor: '#2d5a8c',
          accentColor: '#3b82f6'
        };
      }

      const fileName = `${payment.invoiceNumber}.pdf`;
      const filePath = path.join(invoicesDir, fileName);
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const primaryColor = settings.primaryColor || '#1a365d';
      const secondaryColor = settings.secondaryColor || '#2d5a8c';
      const accentColor = settings.accentColor || '#3b82f6';

      // ===== HEADER SECTION =====
      // Top colored bar
      doc.rect(0, 0, 595, 80).fill(primaryColor);

      // Logo and company name
      let currentX = 40;
      let currentY = 20;

      if (settings.companyLogo) {
        try {
          const logoBuffer = await fetchImageBuffer(settings.companyLogo);
          doc.image(logoBuffer, currentX, currentY, { height: 50, fit: [50, 50] });
          currentX += 65;
        } catch (err) {
          logger.warn('Failed to load company logo', { error: err.message });
        }
      }

      // Company info in header
      doc.fontSize(22).font('Helvetica-Bold').fillColor('#ffffff');
      doc.text(settings.companyName, currentX, currentY, { width: 300 });

      doc.fontSize(8).font('Helvetica').fillColor('rgba(255,255,255,0.8)');
      currentY += 28;
      if (settings.companyAddress) {
        const addressLines = settings.companyAddress.split('\n');
        doc.text(addressLines[0], currentX, currentY, { width: 250 });
      }

      // Invoice title and meta on right
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#ffffff');
      doc.text('INVOICE', 420, 25, { width: 135, align: 'right' });

      // ===== INVOICE META INFO =====
      doc.fontSize(9).font('Helvetica').fillColor('rgba(255,255,255,0.9)');
      doc.text(`Invoice #: ${payment.invoiceNumber}`, 350, 52, { width: 225, align: 'right' });

      const invoiceDate = new Date(payment.invoicedAt || Date.now()).toLocaleDateString('en-IN', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
      doc.text(`Date: ${invoiceDate}`, 350, 63, { width: 225, align: 'right' });

      if (payment.dueDate) {
        const dueDate = new Date(payment.dueDate).toLocaleDateString('en-IN', {
          year: 'numeric', month: 'long', day: 'numeric'
        });
        doc.text(`Due: ${dueDate}`, 350, 74, { width: 225, align: 'right' });
      }

      // ===== MAIN CONTENT AREA =====
      let y = 110;

      // Bill To and From sections side by side
      // Left: Bill To
      doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor);
      doc.text('BILL TO', 40, y);

      doc.fontSize(9).font('Helvetica').fillColor('#1f2937');
      y += 18;
      doc.fontSize(11).font('Helvetica-Bold').text(client?.name || 'Client', 40, y);
      y += 16;
      doc.fontSize(9).font('Helvetica').fillColor('#4b5563');

      if (client?.email) {
        doc.text(client.email, 40, y);
        y += 12;
      }
      if (client?.address) {
        const clientAddressLines = (client.address || '').split('\n');
        for (const line of clientAddressLines) {
          if (line.trim()) {
            doc.text(line.trim(), 40, y, { width: 150 });
            y += 12;
          }
        }
      }
      if (client?.gstNumber) {
        doc.text(`GSTIN: ${client.gstNumber}`, 40, y);
      }

      // Right: From
      y = 110;
      doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor);
      doc.text('FROM', 350, y, { width: 205, align: 'right' });

      y += 18;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1f2937');
      doc.text(settings.companyName, 350, y, { width: 205, align: 'right' });

      y += 16;
      doc.fontSize(9).font('Helvetica').fillColor('#4b5563');
      if (settings.companyAddress) {
        const companyAddressLines = settings.companyAddress.split('\n');
        for (let i = 0; i < companyAddressLines.length && i < 2; i++) {
          doc.text(companyAddressLines[i].trim(), 350, y, { width: 205, align: 'right' });
          y += 12;
        }
      }
      if (settings.companyGST) {
        doc.text(`GSTIN: ${settings.companyGST}`, 350, y, { width: 205, align: 'right' });
      }

      // ===== LINE ITEMS TABLE =====
      y = 230;

      // Table header background
      doc.rect(40, y, 515, 25).fill(secondaryColor);

      // Table headers
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff');
      doc.text('Description', 55, y + 7);
      doc.text('Amount', 450, y + 7, { width: 95, align: 'right' });

      // Table row
      y += 35;
      doc.fontSize(10).font('Helvetica').fillColor('#1f2937');

      const description = payment.milestoneLabel || payment.type;
      doc.text(description, 55, y, { width: 380 });
      doc.text(money(payment.amount, payment.currency), 450, y, { width: 95, align: 'right' });

      // Separator line
      y += 35;
      doc.moveTo(40, y).lineTo(555, y).stroke('#e5e7eb');

      // ===== AMOUNT SUMMARY SECTION =====
      y += 25;
      const summaryX = 350;
      const amountX = 500;

      // Subtotal
      doc.fontSize(10).font('Helvetica').fillColor('#4b5563');
      doc.text('Subtotal', summaryX, y);
      doc.text(money(payment.amount, payment.currency), amountX, y, { width: 95, align: 'right' });

      // GST
      y += 20;
      doc.text(`GST @ ${payment.gstPercent || 0}%`, summaryX, y);
      doc.text(money(payment.gstAmount, payment.currency), amountX, y, { width: 95, align: 'right' });

      // Total box
      y += 25;
      doc.rect(summaryX - 5, y - 8, 155, 35).fill(`rgba(${hexToRgbStr(accentColor)},0.1)`);
      doc.rect(summaryX - 5, y - 8, 155, 35).stroke(accentColor);

      doc.fontSize(12).font('Helvetica-Bold').fillColor(primaryColor);
      doc.text('TOTAL', summaryX, y);
      doc.fontSize(13).text(money(payment.totalAmount, payment.currency), amountX, y - 1, { width: 95, align: 'right' });

      // ===== PAYMENT INFORMATION SECTION =====
      y += 60;

      // Create a colored box for payment details
      doc.rect(40, y - 5, 515, 120).stroke(secondaryColor);
      doc.rect(40, y - 5, 515, 25).fill(secondaryColor);

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#ffffff');
      doc.text('PAYMENT INFORMATION', 55, y + 5);

      // Payment details in two columns
      y += 35;
      let detailsY = y;
      const leftColX = 55;
      const rightColX = 300;

      doc.fontSize(9).font('Helvetica').fillColor('#4b5563');

      if (settings.bankName) {
        doc.fontSize(8).fillColor('#6b7280').text('Bank Name', leftColX, detailsY);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#1f2937').text(settings.bankName, leftColX, detailsY + 12);
        detailsY += 30;
      }

      if (settings.accountHolder) {
        doc.fontSize(8).fillColor('#6b7280').text('Account Holder', leftColX, detailsY);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#1f2937').text(settings.accountHolder, leftColX, detailsY + 12);
        detailsY += 30;
      }

      detailsY = y;
      if (settings.ifscCode) {
        doc.fontSize(8).fillColor('#6b7280').text('IFSC Code', rightColX, detailsY);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#1f2937').text(settings.ifscCode, rightColX, detailsY + 12);
        detailsY += 30;
      }

      if (settings.upiId) {
        doc.fontSize(8).fillColor('#6b7280').text('UPI ID', rightColX, detailsY);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#1f2937').text(settings.upiId, rightColX, detailsY + 12);
        detailsY += 30;
      }

      // ===== TERMS SECTION =====
      y += 135;

      if (settings.paymentTerms || settings.additionalTerms) {
        doc.rect(40, y, 515, 1).stroke('#e5e7eb');
        y += 15;

        if (settings.paymentTerms) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor);
          doc.text('Payment Terms:', 40, y);
          y += 12;
          doc.fontSize(8).font('Helvetica').fillColor('#4b5563');
          doc.text(settings.paymentTerms, 50, y, { width: 495 });
          y += 20;
        }

        if (settings.additionalTerms) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor);
          doc.text('Additional Terms:', 40, y);
          y += 12;
          doc.fontSize(8).font('Helvetica').fillColor('#4b5563');
          doc.text(settings.additionalTerms, 50, y, { width: 495 });
          y += 20;
        }
      }

      // ===== FOOTER SECTION =====
      // Decorative line
      doc.moveTo(40, 750).lineTo(555, 750).stroke(secondaryColor);

      // Thank you message
      doc.fontSize(11).font('Helvetica-Bold').fillColor(primaryColor);
      doc.text('Thank You!', 40, 760, { width: 515, align: 'center' });

      // Footer text
      doc.fontSize(8).font('Helvetica').fillColor('#6b7280');
      doc.text('For any queries, please contact us', 40, 775, { width: 515, align: 'center' });

      // Contact info in footer
      if (settings.companyEmail) {
        doc.text(`Email: ${settings.companyEmail}`, 40, 785, { width: 515, align: 'center' });
      }

      if (settings.companyPhone) {
        doc.text(`Phone: ${settings.companyPhone}`, 40, 795, { width: 515, align: 'center' });
      }

      // Computer generated note
      doc.fontSize(7).fillColor('#9ca3af');
      doc.text('This is a computer-generated invoice. No signature is required.', 40, 810, { width: 515, align: 'center' });

      doc.end();

      stream.on('finish', () => resolve(`/uploads/invoices/${fileName}`));
      stream.on('error', reject);
    } catch (err) {
      logger.error('Invoice PDF generation failed', { error: err.message });
      reject(err);
    }
  });
};

module.exports = { generateInvoicePdf };
