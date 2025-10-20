const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const ApkManagement = require('../models/ApkManagement');
const { uploadFileInChunks } = require('./chunkedUpload');

/**
 * Get all APK versions (Admin)
 * GET /api/apk-management/versions
 */
router.get('/versions', async (req, res) => {
  try {
    const versions = await ApkManagement.find()
      .sort({ versionCode: -1 })
      .select('-__v');
    
    res.json({
      success: true,
      data: versions
    });
  } catch (error) {
    console.error('Error fetching APK versions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch versions',
      error: error.message
    });
  }
});

/**
 * Get latest active version (Public)
 * GET /api/apk-management/latest
 */
router.get('/latest', async (req, res) => {
  try {
    const latestVersion = await ApkManagement.findOne({ isActive: true })
      .sort({ versionCode: -1 })
      .select('-__v');
    
    if (!latestVersion) {
      return res.status(404).json({
        success: false,
        message: 'No active version found'
      });
    }
    
    res.json({
      success: true,
      data: latestVersion
    });
  } catch (error) {
    console.error('Error fetching latest version:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch latest version',
      error: error.message
    });
  }
});

/**
 * Create new APK version (Admin)
 * POST /api/apk-management/version
 */
router.post('/version', async (req, res) => {
  try {
    const {
      version,
      versionCode,
      fileId,
      filename,
      fileSize,
      downloadUrl,
      releaseNotes,
      features,
      bugFixes,
      isActive,
      platform,
      minOsVersion
    } = req.body;

    // Validate required fields
    if (!version || !versionCode || !fileId || !filename || !downloadUrl) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // If this version is set as active, deactivate all others
    if (isActive) {
      await ApkManagement.updateMany({}, { isActive: false });
    }

    // Create new APK version
    const newVersion = new ApkManagement({
      version,
      versionCode,
      fileId,
      filename,
      fileSize,
      downloadUrl,
      releaseNotes: releaseNotes || '',
      features: features || [],
      bugFixes: bugFixes || [],
      isActive: isActive || false,
      platform: platform || 'android',
      minOsVersion: minOsVersion || '5.0',
      uploadedBy: 'admin'
    });

    await newVersion.save();

    res.json({
      success: true,
      message: 'APK version created successfully',
      version: newVersion
    });
  } catch (error) {
    console.error('Error creating APK version:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Version or version code already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create version',
      error: error.message
    });
  }
});

/**
 * Update APK version (Admin)
 * PUT /api/apk-management/version/:id
 */
router.put('/version/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // If this version is set as active, deactivate all others
    if (updateData.isActive) {
      await ApkManagement.updateMany({ _id: { $ne: id } }, { isActive: false });
    }

    const updatedVersion = await ApkManagement.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedVersion) {
      return res.status(404).json({
        success: false,
        message: 'Version not found'
      });
    }

    res.json({
      success: true,
      message: 'Version updated successfully',
      version: updatedVersion
    });
  } catch (error) {
    console.error('Error updating version:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update version',
      error: error.message
    });
  }
});

/**
 * Delete APK version (Admin)
 * DELETE /api/apk-management/version/:id
 */
router.delete('/version/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const version = await ApkManagement.findById(id);
    
    if (!version) {
      return res.status(404).json({
        success: false,
        message: 'Version not found'
      });
    }

    // Delete the file from GridFS
    try {
      const bucket = new GridFSBucket(mongoose.connection.db, {
        bucketName: 'apk_files'
      });
      
      await bucket.delete(new mongoose.Types.ObjectId(version.fileId));
    } catch (err) {
      console.error('Error deleting file from GridFS:', err);
      // Continue with metadata deletion even if file deletion fails
    }

    await ApkManagement.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Version deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting version:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete version',
      error: error.message
    });
  }
});

/**
 * Download APK file (Public)
 * GET /api/apk-management/download/:fileId
 */
router.get('/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Find version and increment download count
    const version = await ApkManagement.findOne({ fileId });
    if (version) {
      version.downloadCount += 1;
      await version.save();
    }

    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'apk_files'
    });

    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));

    // Handle errors
    downloadStream.on('error', (error) => {
      console.error('Download stream error:', error);
      if (!res.headersSent) {
        res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }
    });

    // Get file metadata
    const files = await bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
    
    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const file = files[0];

    // Set headers for download
    res.set({
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': file.length
    });

    // Pipe the file to response
    downloadStream.pipe(res);
  } catch (error) {
    console.error('Error downloading APK:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to download file',
        error: error.message
      });
    }
  }
});

/**
 * Set version as active (Admin)
 * PATCH /api/apk-management/version/:id/activate
 */
router.patch('/version/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Deactivate all versions
    await ApkManagement.updateMany({}, { isActive: false });
    
    // Activate the selected version
    const activatedVersion = await ApkManagement.findByIdAndUpdate(
      id,
      { isActive: true },
      { new: true }
    );

    if (!activatedVersion) {
      return res.status(404).json({
        success: false,
        message: 'Version not found'
      });
    }

    res.json({
      success: true,
      message: 'Version activated successfully',
      version: activatedVersion
    });
  } catch (error) {
    console.error('Error activating version:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to activate version',
      error: error.message
    });
  }
});

module.exports = router;
