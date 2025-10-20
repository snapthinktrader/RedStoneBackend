const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

// Use memory storage for multer (no disk writes)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /apk|ipa/;
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (allowedTypes.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only APK and IPA files are allowed'));
    }
  }
});

// Handle CORS preflight for upload
router.options('/apk', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(200).end();
});

// Upload APK file to GridFS
router.post('/apk', upload.single('apk'), async (req, res) => {
  try {
    // Set CORS headers explicitly
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Create GridFS bucket
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'apk_files'
    });

    // Create upload stream
    const uploadStream = bucket.openUploadStream(req.file.originalname, {
      metadata: {
        contentType: req.file.mimetype,
        size: req.file.size,
        uploadedAt: new Date()
      }
    });

    // Write file buffer to GridFS
    uploadStream.end(req.file.buffer);

    uploadStream.on('finish', () => {
      const fileId = uploadStream.id;
      const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);
      
      res.json({
        success: true,
        fileId: fileId.toString(),
        downloadUrl: `/api/download/apk/${fileId.toString()}`,
        fileSize: `${fileSizeMB} MB`,
        filename: req.file.originalname
      });
    });

    uploadStream.on('error', (error) => {
      console.error('GridFS upload error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload file',
        error: error.message
      });
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during upload',
      error: error.message
    });
  }
});

// Download APK file from GridFS
router.get('/apk/:fileId', async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'apk_files'
    });

    // Get file metadata
    const files = await bucket.find({ _id: fileId }).toArray();
    
    if (!files || files.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const file = files[0];

    // Set response headers
    res.set({
      'Content-Type': file.metadata.contentType || 'application/vnd.android.package-archive',
      'Content-Length': file.length,
      'Content-Disposition': `attachment; filename="${file.filename}"`
    });

    // Stream file to response
    const downloadStream = bucket.openDownloadStream(fileId);
    
    downloadStream.on('error', (error) => {
      console.error('GridFS download error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Failed to download file',
          error: error.message
        });
      }
    });

    downloadStream.pipe(res);

  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Server error during download',
        error: error.message
      });
    }
  }
});

// Delete APK file from GridFS
router.delete('/apk/:fileId', async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'apk_files'
    });

    await bucket.delete(fileId);

    res.json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete file',
      error: error.message
    });
  }
});

// List all APK files in GridFS
router.get('/apk', async (req, res) => {
  try {
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'apk_files'
    });

    const files = await bucket.find().toArray();

    const fileList = files.map(file => ({
      id: file._id.toString(),
      filename: file.filename,
      size: file.length,
      uploadedAt: file.uploadDate,
      contentType: file.metadata?.contentType
    }));

    res.json({
      success: true,
      files: fileList
    });

  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list files',
      error: error.message
    });
  }
});

module.exports = router;
