const connectDB = require('../../lib/mongodb');
const Document = require('../../models/Document');
const { PDFDocument } = require('pdf-lib');
const crypto = require('crypto');

function calculateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await connectDB();
    const { pdfId, signatureImage, coordinates, pages } = req.body;

    if (!coordinates || !pdfId || !signatureImage) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const doc = await Document.findById(pdfId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const pdfBuffer = Buffer.from(doc.originalPdfData, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pdfPages = pdfDoc.getPages();

    // Parse signature image
    const parts = (signatureImage || '').split(',');
    const header = parts[0] || '';
    const imageBytes = Buffer.from(parts[1] || '', 'base64');
    
    const isPng = header.includes('image/png');
    const image = isPng ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
    const imageDims = image.scale(1);
    const imgAspect = imageDims.width / imageDims.height;

    // Clamp coordinates
    const clamp01 = (v) => Math.max(0, Math.min(1, Number(v)));
    const x = clamp01(coordinates.x);
    const y = clamp01(coordinates.y);
    const width = clamp01(coordinates.width);
    const height = clamp01(coordinates.height);

    const pageNumbers = pages || [1];

    pageNumbers.forEach(pageNum => {
      const page = pdfPages[pageNum - 1];
      if (!page) return;

      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();

      const absWidth = width * pageWidth;
      const absHeight = height * pageHeight;
      const absX = x * pageWidth;
      const absYTop = y * pageHeight;
      const absY = pageHeight - absYTop - absHeight;

      const boxAspect = absWidth / absHeight;
      let drawW, drawH, offsetX, offsetY;

      if (imgAspect > boxAspect) {
        drawW = absWidth;
        drawH = absWidth / imgAspect;
        offsetX = 0;
        offsetY = (absHeight - drawH) / 2;
      } else {
        drawH = absHeight;
        drawW = absHeight * imgAspect;
        offsetX = (absWidth - drawW) / 2;
        offsetY = 0;
      }

      page.drawImage(image, {
        x: absX + offsetX,
        y: absY + offsetY,
        width: drawW,
        height: drawH
      });
    });

    const signedPdfBytes = await pdfDoc.save();
    const signedBuffer = Buffer.from(signedPdfBytes);
    const signedHash = calculateHash(signedBuffer);

    doc.signedPdfData = signedBuffer.toString('base64');
    doc.signedHash = signedHash;
    await doc.save();

    res.status(200).json({
      success: true,
      hashes: { original: doc.originalHash, signed: signedHash }
    });

  } catch (error) {
    console.error('Sign error:', error);
    res.status(500).json({ error: error.message });
  }
};
