const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { PDFDocument } = require('pdf-lib');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// Document Schema
const documentSchema = new mongoose.Schema({
  originalHash: String,
  signedHash: String,
  originalPdfData: String,
  signedPdfData: String,
  filename: String,
  createdAt: { type: Date, default: Date.now }
});
const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);

function calculateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'BoloSign API is running' });
});

// Upload PDF
app.post('/api/pdf/upload', async (req, res) => {
  try {
    const { pdfData, filename } = req.body;
    if (!pdfData) return res.status(400).json({ error: 'No PDF data' });

    const buffer = Buffer.from(pdfData, 'base64');
    const hash = calculateHash(buffer);

    const doc = new Document({
      originalHash: hash,
      originalPdfData: pdfData,
      filename: filename || 'document.pdf'
    });
    await doc.save();

    res.json({ pdfId: doc._id, hash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sign PDF
app.post('/api/pdf/sign', async (req, res) => {
  try {
    const { pdfId, signatureImage, coordinates, pages } = req.body;

    const doc = await Document.findById(pdfId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const pdfBuffer = Buffer.from(doc.originalPdfData, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pdfPages = pdfDoc.getPages();

    const parts = (signatureImage || '').split(',');
    const imageBytes = Buffer.from(parts[1] || '', 'base64');
    const isPng = (parts[0] || '').includes('image/png');
    const image = isPng ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);

    const imgAspect = image.width / image.height;
    const { x, y, width, height } = coordinates;

    (pages || [1]).forEach(pageNum => {
      const page = pdfPages[pageNum - 1];
      if (!page) return;

      const pw = page.getWidth(), ph = page.getHeight();
      const absW = width * pw, absH = height * ph;
      const absX = x * pw, absY = ph - (y * ph) - absH;

      const boxAspect = absW / absH;
      let dw, dh, ox = 0, oy = 0;
      if (imgAspect > boxAspect) { dw = absW; dh = absW / imgAspect; oy = (absH - dh) / 2; }
      else { dh = absH; dw = absH * imgAspect; ox = (absW - dw) / 2; }

      page.drawImage(image, { x: absX + ox, y: absY + oy, width: dw, height: dh });
    });

    const signedBytes = await pdfDoc.save();
    const signedBuffer = Buffer.from(signedBytes);

    doc.signedPdfData = signedBuffer.toString('base64');
    doc.signedHash = calculateHash(signedBuffer);
    await doc.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download PDF
app.get('/api/pdf/download/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const pdfData = doc.signedPdfData || doc.originalPdfData;
    const buffer = Buffer.from(pdfData, 'base64');

    res.setHeader('Content-Type', 'application/pdf');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
