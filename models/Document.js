const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  originalHash: { type: String, required: true },
  signedHash: { type: String },
  originalPdfData: { type: String, required: true },
  signedPdfData: { type: String },
  filename: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Document || mongoose.model('Document', documentSchema);
