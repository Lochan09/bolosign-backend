// backend/routes/pdf.js
const express = require('express');
const router = express.Router();
const Document = require('../models/Document');
const { calculateHash, signPDF } = require('../utils/pdfProcessor');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');

const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/pdf/sign
 * Sign a PDF with the provided signature
 * Body: { pdfId, signatureImage (base64), coordinates, pages }
 */
router.post('/sign', async (req, res) => {
  try {
    const { pdfId, signatureImage, coordinates, pages } = req.body;
    
    // Validate coordinates
    if (!coordinates || ['x','y','width','height'].some(k => typeof coordinates[k] !== 'number')) {
      return res.status(400).json({ error: 'Missing or invalid coordinates' });
    }
    
    // Enforce normalized range [0,1]
    function inRange01(v) { 
      return typeof v === 'number' && v >= 0 && v <= 1; 
    }
    
    const norm = { ...coordinates };
    if (!inRange01(norm.x) || !inRange01(norm.y) || !inRange01(norm.width) || !inRange01(norm.height)) {
      return res.status(400).json({ error: 'Coordinates must be normalized (0..1)' });
    }
    
    // Fetch original PDF from DB
    const doc = await Document.findById(pdfId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Load original PDF
    if (!doc.originalPdfUrl) {
      return res.status(500).json({ error: 'Original PDF not available' });
    }
    
    const originalPdfBuffer = await fs.readFile(doc.originalPdfUrl);
    
    // Sign the PDF
    const debug = req.query.debug === '1' || req.query.debug === 'true';
    const signedPdfBuffer = await signPDF(originalPdfBuffer, signatureImage, norm, pages || [1], { debug });
    
    // Calculate hash of signed PDF
    const signedHash = calculateHash(signedPdfBuffer);
    
    // Save signed PDF
    const uploadDir = path.join(__dirname, '../../uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    const signedFilename = `signed-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
    const signedPath = path.join(uploadDir, signedFilename);
    await fs.writeFile(signedPath, signedPdfBuffer);
    
    // Update document record
    doc.signedHash = signedHash;
    doc.signedPdfUrl = signedPath;
    await doc.save();
    
    res.json({
      success: true,
      signedPdfUrl: signedPath,
      hashes: {
        original: doc.originalHash,
        signed: signedHash
      }
    });
    
  } catch (error) {
    console.error('Sign PDF error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pdf/upload
 * Upload a PDF document
 */
router.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    const pdfBuffer = req.file.buffer;
    
    // Calculate hash
    const hash = calculateHash(pdfBuffer);

    // Save PDF to uploads directory
    const uploadDir = path.join(__dirname, '../../uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    const filename = `upload-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, pdfBuffer);
    const pdfUrl = filePath;
    
    // Create document record
    const doc = new Document({
      originalHash: hash,
      originalPdfUrl: pdfUrl
    });
    await doc.save();
    
    res.json({
      pdfId: doc._id,
      hash,
      pdfUrl
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pdf/download/:id
 * Download signed PDF by document ID
 */
router.get('/download/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Use signed PDF if available, otherwise original
    const filePath = doc.signedPdfUrl || doc.originalPdfUrl;
    
    if (!filePath) {
      return res.status(404).json({ error: 'PDF file not available' });
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (err) {
      return res.status(404).json({ error: 'PDF file not found on disk' });
    }

    // Stream file for inline viewing to ensure react-pdf can render it
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/pdf');
    // Use sendFile to allow inline view instead of forced attachment
    res.sendFile(path.resolve(filePath), (err) => {
      if (err) {
        console.error('Send file error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to send file' });
        }
      }
    });
    
  } catch (error) {
    console.error('Download endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;