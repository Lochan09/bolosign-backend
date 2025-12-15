module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ 
    message: 'BoloSign API is running',
    endpoints: [
      'POST /api/pdf/upload',
      'POST /api/pdf/sign', 
      'GET /api/pdf/download/:id'
    ]
  });
};
