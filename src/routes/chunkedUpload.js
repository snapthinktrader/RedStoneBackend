const express = require('express');
const router = express.Router();

console.log('🔵 chunkedUpload.js routes file is being loaded!');

// Router-level CORS middleware (ensure all chunk endpoints return CORS headers)
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  // For preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});
const multer = require('multer');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const UploadSession = require('../models/UploadSession');
const UploadChunk = require('../models/UploadChunk');

// Use memory storage for chunks
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB per chunk
});

/**
 * Initialize chunked upload session
 * POST /api/chunked-upload/init
 */
router.post('/init', async (req, res) => {
  try {
    const { filename, totalChunks, fileSize } = req.body;
    
    if (!filename || !totalChunks || !fileSize) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: filename, totalChunks, fileSize'
      });
    }
    
    // Generate upload session ID
    const uploadId = new mongoose.Types.ObjectId().toString();
    
    // Store session in MongoDB
    const session = new UploadSession({
      uploadId,
      filename,
      totalChunks,
      fileSize,
      uploadedChunks: [],
      status: 'active'
    });
    
    await session.save();
    
    res.json({
      success: true,
      uploadId,
      message: 'Upload session initialized'
    });
    
  } catch (error) {
    console.error('Init upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize upload',
      error: error.message
    });
  }
});

/**
 * Finalize chunked upload - combine chunks and save to GridFS
 * IMPORTANT: This route MUST come BEFORE /:uploadId/:chunkIndex to avoid route collision
 * POST /api/chunked-upload/finalize/:uploadId
 */
router.post('/finalize/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    console.log('=== FINALIZE DEBUG START ===');
    console.log(`Received uploadId: "${uploadId}"`);
    
    const session = await UploadSession.findOne({ uploadId });
    
    if (!session) {
      console.log(`No session found in DB for uploadId: ${uploadId}`);
      return res.status(404).json({
        success: false,
        message: 'Upload session not found'
      });
    }

    console.log(`Session found with status: ${session.status}`);

    // If session is already completed, return existing info if available
    if (session.status === 'completed') {
      console.log(`Session already completed for uploadId: ${uploadId}`);
      return res.status(200).json({
        success: true,
        message: 'Upload already completed',
        filename: session.filename
      });
    }
    
    // Verify all chunks received by counting chunk documents
    const receivedCount = await UploadChunk.countDocuments({ uploadId });
    const missingChunks = [];
    if (receivedCount < session.totalChunks) {
      // Determine which indexes are missing
      const receivedDocs = await UploadChunk.find({ uploadId }).select('chunkIndex -_id').lean();
      const receivedIndexes = new Set(receivedDocs.map(d => d.chunkIndex));
      for (let i = 0; i < session.totalChunks; i++) {
        if (!receivedIndexes.has(i)) missingChunks.push(i);
      }
    }
    
    if (missingChunks.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing chunks: ${missingChunks.join(', ')}`
      });
    }
    
    // Read chunk docs sorted by index and combine buffers
    const chunkDocs = await UploadChunk.find({ uploadId }).sort({ chunkIndex: 1 }).lean();
    const buffers = chunkDocs.map(c => c.data.buffer ? Buffer.from(c.data.buffer) : Buffer.from(c.data));
    const completeFile = Buffer.concat(buffers);
    
    // Upload to GridFS
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'apk_files'
    });
    
    const uploadStream = bucket.openUploadStream(session.filename, {
      metadata: {
        contentType: 'application/vnd.android.package-archive',
        size: session.fileSize,
        uploadedAt: new Date()
      }
    });
    
    uploadStream.end(completeFile);
    
    await new Promise((resolve, reject) => {
      uploadStream.on('finish', resolve);
      uploadStream.on('error', reject);
    });
    
    const fileId = uploadStream.id;
    const fileSizeMB = (session.fileSize / (1024 * 1024)).toFixed(2);
    
    // Mark session as completed and remove chunk documents
    session.status = 'completed';
    await session.save();
    await UploadChunk.deleteMany({ uploadId });
    
    console.log(`✅ Upload finalized successfully: ${fileId}`);
    console.log('=== FINALIZE DEBUG END ===');
    
    res.json({
      success: true,
      fileId: fileId.toString(),
      downloadUrl: `/api/download/apk/${fileId.toString()}`,
      fileSize: `${fileSizeMB} MB`,
      filename: session.filename,
      message: 'File uploaded successfully to GridFS'
    });
    
  } catch (error) {
    console.error('Finalize upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to finalize upload',
      error: error.message
    });
  }
});

/**
 * Upload single chunk
 * POST /api/chunked-upload/:uploadId/:chunkIndex
 */
router.post('/:uploadId/:chunkIndex', upload.single('chunk'), async (req, res) => {
  try {
    const { uploadId, chunkIndex } = req.params;
    
    const session = await UploadSession.findOne({ uploadId, status: 'active' });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Upload session not found'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No chunk data received'
      });
    }
    
    // Store chunk as separate document to avoid document size limit
    const chunkDoc = new UploadChunk({
      uploadId,
      chunkIndex: parseInt(chunkIndex),
      data: req.file.buffer
    });

    await chunkDoc.save();

    const uploadedCount = await UploadChunk.countDocuments({ uploadId });
    const progress = Math.round((uploadedCount / session.totalChunks) * 100);
    
    // Ensure CORS headers on JSON response as well
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    res.json({
      success: true,
      chunkIndex: parseInt(chunkIndex),
      uploadedChunks: uploadedCount,
      totalChunks: session.totalChunks,
      progress
    });
    
  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload chunk',
      error: error.message
    });
  }
});

/**
 * Cancel upload session
 * DELETE /api/upload/chunk/:uploadId
 */
router.delete('/chunk/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    const session = await UploadSession.findOne({ uploadId });
    
    if (session) {
      session.status = 'cancelled';
      await session.save();
      
      res.json({
        success: true,
        message: 'Upload session cancelled'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Upload session not found'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error cancelling upload',
      error: error.message
    });
  }
});

/**
 * Debug endpoint - check session status
 * GET /api/chunked-upload/status/:uploadId
 */
router.get('/status/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const session = await UploadSession.findOne({ uploadId });
    const chunkCount = await UploadChunk.countDocuments({ uploadId });
    
    res.json({
      success: true,
      session: session ? {
        uploadId: session.uploadId,
        filename: session.filename,
        status: session.status,
        totalChunks: session.totalChunks,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt
      } : null,
      chunkCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
