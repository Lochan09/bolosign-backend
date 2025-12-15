// backend/models/Document.js
const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  originalHash: { type: String, required: true },
  signedHash: String,
  originalPdfUrl: String,
  signedPdfUrl: String,
  fields: [{
    fieldType: {
      type: String,
      enum: ['text', 'signature', 'image', 'date', 'radio'],
      required: true
    },
    coordinates: {
      x: { type: Number },
      y: { type: Number },
      width: { type: Number },
      height: { type: Number }
    }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Document', documentSchema);