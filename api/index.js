const mongoose = require('mongoose');
const { PDFDocument } = require('pdf-lib');
const crypto = require('crypto');

// MongoDB connection
let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

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

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url, method } = req;

  // GET /api - Health check
  if (url === '/api' && method === 'GET') {
    return res.json({ message: 'BoloSign API is running' });
  }

  // POST /api/pdf/upload
  if (url === '/api/pdf/upload' && method === 'POST') {
    try {
      await connectDB();
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

      return res.json({ pdfId: doc._id, hash });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // POST /api/pdf/sign
  if (url === '/api/pdf/sign' && method === 'POST') {
    try {
      await connectDB();
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

      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // GET /api/pdf/download/:id
  if (url.startsWith('/api/pdf/download/') && method === 'GET') {
    try {
      await connectDB();
      const id = url.split('/api/pdf/download/')[1];
      const doc = await Document.findById(id);
      if (!doc) return res.status(404).json({ error: 'Not found' });

      const pdfData = doc.signedPdfData || doc.originalPdfData;
      const buffer = Buffer.from(pdfData, 'base64');

      res.setHeader('Content-Type', 'application/pdf');
      return res.send(buffer);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(404).json({ error: 'Not found' });
};
