# BoloSign Backend

Express.js backend API for the BoloSign document signing application.

## Features

- 📤 PDF upload with hash verification
- ✍️ Digital signature embedding using pdf-lib
- 📥 Signed PDF download
- 🔒 SHA-256 document integrity verification
- 🗄️ MongoDB document storage

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Update .env with your MongoDB URI
# MONGODB_URI=mongodb://localhost:27017/bolosign

# Start server
npm start
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | Required |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/pdf/upload` | Upload a PDF document |
| `POST` | `/api/pdf/sign` | Sign a PDF with signature |
| `GET` | `/api/pdf/download/:id` | Download signed PDF |

## Tech Stack

- **Express.js** - Web framework
- **MongoDB/Mongoose** - Database
- **pdf-lib** - PDF manipulation
- **multer** - File uploads
- **crypto** - Hash generation

## Related

- [BoloSign Frontend](https://github.com/Lochan09/bolosign-frontend)
