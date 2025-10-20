const mongoose = require('mongoose');

const UploadSessionSchema = new mongoose.Schema({
  uploadId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  filename: {
    type: String,
    required: true
  },
  totalChunks: {
    type: Number,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  uploadedChunks: [{
    chunkIndex: Number,
    data: Buffer
  }],
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled', 'expired'],
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600 // TTL index: expire after 3600 seconds (1 hour)
  }
});

// No need for expiresAt field - MongoDB TTL uses createdAt + expires

module.exports = mongoose.model('UploadSession', UploadSessionSchema);
