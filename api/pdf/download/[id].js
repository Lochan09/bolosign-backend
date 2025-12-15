const connectDB = require('../../../lib/mongodb');
const Document = require('../../../models/Document');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await connectDB();
    
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing document ID' });

    const doc = await Document.findById(id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const pdfData = doc.signedPdfData || doc.originalPdfData;
    if (!pdfData) return res.status(404).json({ error: 'PDF data not found' });

    const pdfBuffer = Buffer.from(pdfData, 'base64');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="signed-document.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
};
