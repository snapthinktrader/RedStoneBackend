const mongoose = require('mongoose');

const UploadChunkSchema = new mongoose.Schema({
  uploadId: { type: String, required: true, index: true },
  chunkIndex: { type: Number, required: true },
  data: { type: Buffer, required: true },
  createdAt: { type: Date, default: Date.now }
});

UploadChunkSchema.index({ uploadId: 1, chunkIndex: 1 }, { unique: true });

module.exports = mongoose.model('UploadChunk', UploadChunkSchema);
