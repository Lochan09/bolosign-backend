// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' })); // For base64 images

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/signature-engine')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// Routes
const pdfRoutes = require('./routes/pdf');
app.use('/api/pdf', pdfRoutes);

// Debug: List all registered routes
app._router.stack.forEach(function(r){
  if (r.route && r.route.path){
    console.log('Route:', r.route.path)
  } else if (r.name === 'router') {
    r.handle.stack.forEach(function(route){
      if (route.route) {
        console.log('Route:', route.route.path)
      }
    })
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));