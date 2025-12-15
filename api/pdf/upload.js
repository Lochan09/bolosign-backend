const connectDB = require('../../lib/mongodb');
const Document = require('../../models/Document');
const crypto = require('crypto');

function calculateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();

    // Get the raw body as buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Parse multipart form data manually (simple parser)
    const boundary = req.headers['content-type'].split('boundary=')[1];
    const parts = buffer.toString('binary').split('--' + boundary);
    
    let pdfBuffer = null;
    let filename = 'document.pdf';

    for (const part of parts) {
      if (part.includes('filename=')) {
        const filenameMatch = part.match(/filename=\"([^\"]+)\"/);
        if (filenameMatch) filename = filenameMatch[1];
        
        const headerEnd = part.indexOf('\r\n\r\n') + 4;
        const dataEnd = part.lastIndexOf('\r\n');
        const binaryData = part.substring(headerEnd, dataEnd);
        pdfBuffer = Buffer.from(binaryData, 'binary');
      }
    }

    if (!pdfBuffer) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const hash = calculateHash(pdfBuffer);
    const pdfBase64 = pdfBuffer.toString('base64');

    const doc = new Document({
      originalHash: hash,
      originalPdfData: pdfBase64,
      filename: filename
    });
    await doc.save();

    res.status(200).json({
      pdfId: doc._id,
      hash: hash,
      filename: filename
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
};
