/** PDF receipt generation with pdfkit (pure JS, uses built-in Helvetica). */
const PDFDocument = require('pdfkit');

const BRAND = '#27ae60';
const DARK = '#1a2129';
const MUTED = '#667';

// Streams a PDF receipt for an order to the given writable (res).
function streamReceipt(res, { order, product, buyer, seller }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  // Header
  doc.fillColor(BRAND).fontSize(26).font('Helvetica-Bold').text('ReWear', 50, 50);
  doc.fillColor(MUTED).fontSize(10).font('Helvetica').text('Sustainable resell marketplace', 50, 80);
  doc.fillColor(DARK).fontSize(20).font('Helvetica-Bold').text('RECEIPT', 0, 50, { align: 'right' });
  doc.fillColor(MUTED).fontSize(10).font('Helvetica')
    .text(`Order #${order.id}`, 0, 78, { align: 'right' })
    .text(`Date: ${new Date(order.payment?.paidAt || order.createdAt).toLocaleString()}`, { align: 'right' })
    .text(`Status: ${order.status.toUpperCase()}`, { align: 'right' });

  doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#ccc').stroke();

  // Parties
  let y = 130;
  doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold').text('SOLD BY', 50, y);
  doc.fillColor(DARK).fontSize(11).font('Helvetica').text(seller?.name || 'Seller', 50, y + 14);
  doc.fillColor(MUTED).fontSize(9).text(seller?.email || '', 50, y + 30);

  doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold').text('SHIP TO', 320, y);
  const s = order.shipping || {};
  doc.fillColor(DARK).fontSize(11).font('Helvetica')
    .text(s.name || buyer?.name || 'Buyer', 320, y + 14)
    .fontSize(9).fillColor(MUTED)
    .text([s.line1, [s.city, s.zip].filter(Boolean).join(' '), s.country].filter(Boolean).join('\n') || '—', 320, y + 30);

  // Line items table
  y = 230;
  doc.fillColor(DARK).rect(50, y, 495, 24).fill(BRAND);
  doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold')
    .text('ITEM', 60, y + 7).text('CONDITION', 320, y + 7).text('AMOUNT', 0, y + 7, { align: 'right', width: 535 });
  y += 30;
  doc.fillColor(DARK).fontSize(11).font('Helvetica')
    .text(product?.title || 'Item', 60, y, { width: 250 })
    .text(product?.condition || '—', 320, y)
    .text(`$${order.amount.toFixed(2)}`, 0, y, { align: 'right', width: 535 });

  y += 40;
  doc.moveTo(320, y).lineTo(545, y).strokeColor('#ccc').stroke();
  y += 10;
  doc.fillColor(MUTED).fontSize(10).text('Subtotal', 320, y).fillColor(DARK).text(`$${order.amount.toFixed(2)}`, 0, y, { align: 'right', width: 535 });
  y += 18;
  doc.fillColor(MUTED).fontSize(10).text('Shipping', 320, y).fillColor(DARK).text('$0.00', 0, y, { align: 'right', width: 535 });
  y += 22;
  doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold').text('Total', 320, y).fillColor(BRAND).text(`$${order.amount.toFixed(2)}`, 0, y, { align: 'right', width: 535 });

  if (order.payment) {
    y += 34;
    doc.fillColor(MUTED).fontSize(10).font('Helvetica').text(`Paid with ${order.payment.brand} ending ${order.payment.last4}`, 50, y);
  }
  if (order.status === 'refunded') {
    y += 16;
    doc.fillColor('#e5484d').fontSize(11).font('Helvetica-Bold').text('REFUNDED', 50, y);
  }

  // Footer
  doc.fillColor(MUTED).fontSize(9).font('Helvetica')
    .text('Thank you for buying second-hand and reducing waste. 🌱', 50, 760, { align: 'center', width: 495 })
    .text('This is a demo receipt — no real payment was processed unless Stripe live keys are configured.', 50, 775, { align: 'center', width: 495 });

  doc.end();
}

module.exports = { streamReceipt };
