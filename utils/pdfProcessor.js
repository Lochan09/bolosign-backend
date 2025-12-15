// backend/utils/pdfProcessor.js
const { PDFDocument } = require('pdf-lib');
const crypto = require('crypto');

/**
 * Calculate SHA-256 hash of PDF buffer
 */
function calculateHash(pdfBuffer) {
  return crypto.createHash('sha256').update(pdfBuffer).digest('hex');
}

/**
 * Overlay signature image onto PDF
 * @param {Buffer} pdfBuffer - Original PDF
 * @param {String} signatureBase64 - Signature image in base64
 * @param {Object} coordinates - { x, y, width, height } as normalized fractions (0..1) of page size
 * @param {Array} pageNumbers - Array of page numbers to sign (1-indexed)
 * @param {Object} options - { debug: boolean, debugThick: boolean }
 */
async function signPDF(pdfBuffer, signatureBase64, coordinates, pageNumbers = [1], options = {}) {
  // Load PDF
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();

  // Parse base64 signature and detect image type (PNG/JPG)
  const parts = (signatureBase64 || '').split(',');
  const header = parts[0] || '';
  const imageBytes = Buffer.from(parts[1] || '', 'base64');
  
  let image;
  try {
    const isPng = header.includes('image/png');
    image = isPng ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
  } catch (e) {
    throw new Error('Invalid signature image');
  }
  
  // Get image dimensions and aspect ratio
  const imageDims = image.scale(1);
  const imgAspect = imageDims.width / imageDims.height;
  
  // Validate & clamp normalized coordinates to [0,1]
  function clamp01(v) { 
    return Math.max(0, Math.min(1, Number(v))); 
  }
  
  let { x, y, width, height } = coordinates || {};
  x = clamp01(x);
  y = clamp01(y);
  width = clamp01(width);
  height = clamp01(height);
  
  if ([x, y, width, height].some(v => Number.isNaN(v))) {
    throw new Error('Coordinates must be normalized numbers in [0,1]');
  }
  if (width <= 0 || height <= 0) {
    throw new Error('Coordinates must have positive width and height');
  }

  const debug = options.debug === true;

  // Apply signature to each specified page
  pageNumbers.forEach(pageNum => {
    const page = pages[pageNum - 1]; // Convert to 0-indexed
    if (!page) return;
    
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();

    // Convert normalized fractions to absolute PDF points
    const absWidth = width * pageWidth;
    const absHeight = height * pageHeight;
    const absX = x * pageWidth;
    
    // Invert Y axis: normalized y is from top, PDF uses bottom origin
    const absYTop = y * pageHeight;
    const absY = pageHeight - absYTop - absHeight;

    // Preserve aspect ratio within the signature box
    const boxAspect = absWidth / absHeight;
    let drawW, drawH, offsetX, offsetY;
    
    if (imgAspect > boxAspect) {
      // Image is wider than box - fit to width
      drawW = absWidth;
      drawH = absWidth / imgAspect;
      offsetX = 0;
      offsetY = (absHeight - drawH) / 2;
    } else {
      // Image is taller than box - fit to height
      drawH = absHeight;
      drawW = absHeight * imgAspect;
      offsetX = (absWidth - drawW) / 2;
      offsetY = 0;
    }

    // Draw the signature image
    page.drawImage(image, {
      x: absX + offsetX,
      y: absY + offsetY,
      width: drawW,
      height: drawH
    });

    // Debug mode: draw a border around the signature box
    if (debug) {
      try {
        page.drawRectangle({
          x: absX,
          y: absY,
          width: absWidth,
          height: absHeight,
          borderColor: { r: 1, g: 0, b: 0 },
          borderWidth: 1,
          opacity: 0.8
        });
      } catch (e) {
        // Debug rectangle failed, ignore
      }
    }
  });
  
  // Save and return signed PDF
  const signedPdfBytes = await pdfDoc.save();
  return Buffer.from(signedPdfBytes);
}

module.exports = { calculateHash, signPDF };