const express = require('express');
const router = express.Router();
const AppVersion = require('../models/AppVersion');
const adminAuth = require('../middleware/adminAuth');

// @route   GET /api/app/version/latest
// @desc    Get latest app version (public)
// @access  Public
router.get('/version/latest', async (req, res) => {
  try {
    const { platform } = req.query;
    
    if (!platform || !['android', 'ios'].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: 'Valid platform (android/ios) is required',
      });
    }

    const latestVersion = await AppVersion.getLatestVersion(platform);

    if (!latestVersion) {
      return res.status(404).json({
        success: false,
        message: 'No active version found for this platform',
      });
    }

    res.json({
      success: true,
      data: {
        version: latestVersion.version,
        versionCode: latestVersion.versionCode,
        platform: latestVersion.platform,
        downloadUrl: latestVersion.downloadUrl,
        fileSize: latestVersion.fileSize,
        releaseNotes: latestVersion.releaseNotes,
        features: latestVersion.features,
        bugFixes: latestVersion.bugFixes,
        isMandatory: latestVersion.isMandatory,
        minSupportedVersion: latestVersion.minSupportedVersion,
        uploadedAt: latestVersion.uploadedAt,
        downloadCount: latestVersion.downloadCount,
      },
    });
  } catch (error) {
    console.error('Error fetching latest version:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// @route   POST /api/app/version/download
// @desc    Track download (increment count)
// @access  Public
router.post('/version/download', async (req, res) => {
  try {
    const { versionId, platform } = req.body;

    let version;
    if (versionId) {
      version = await AppVersion.findById(versionId);
    } else if (platform) {
      version = await AppVersion.getLatestVersion(platform);
    }

    if (!version) {
      return res.status(404).json({
        success: false,
        message: 'Version not found',
      });
    }

    await version.incrementDownloadCount();

    res.json({
      success: true,
      message: 'Download tracked successfully',
      downloadCount: version.downloadCount,
    });
  } catch (error) {
    console.error('Error tracking download:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// @route   GET /api/app/versions
// @desc    Get all app versions (admin)
// @access  Admin
router.get('/versions', adminAuth, async (req, res) => {
  try {
    const { platform, isActive } = req.query;
    
    const filter = {};
    if (platform) filter.platform = platform;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const versions = await AppVersion.find(filter)
      .sort({ versionCode: -1 })
      .exec();

    res.json({
      success: true,
      data: {
        versions,
        total: versions.length,
      },
    });
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// @route   POST /api/app/version
// @desc    Create new app version (admin)
// @access  Admin
router.post('/version', adminAuth, async (req, res) => {
  try {
    const {
      version,
      versionCode,
      platform,
      downloadUrl,
      fileSize,
      releaseNotes,
      features,
      bugFixes,
      isMandatory,
      minSupportedVersion,
    } = req.body;

    // Validation
    if (!version || !versionCode || !platform || !downloadUrl || !fileSize || !releaseNotes) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Check if version already exists
    const existingVersion = await AppVersion.findOne({ version, platform });
    if (existingVersion) {
      return res.status(400).json({
        success: false,
        message: 'This version already exists for the platform',
      });
    }

    // Create new version
    const newVersion = new AppVersion({
      version,
      versionCode,
      platform,
      downloadUrl,
      fileSize,
      releaseNotes,
      features: features || [],
      bugFixes: bugFixes || [],
      isMandatory: isMandatory || false,
      minSupportedVersion,
      uploadedBy: req.user?.username || 'admin',
    });

    await newVersion.save();

    res.status(201).json({
      success: true,
      message: 'App version created successfully',
      data: newVersion,
    });
  } catch (error) {
    console.error('Error creating version:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// @route   PUT /api/app/version/:id
// @desc    Update app version (admin)
// @access  Admin
router.put('/version/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const version = await AppVersion.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!version) {
      return res.status(404).json({
        success: false,
        message: 'Version not found',
      });
    }

    res.json({
      success: true,
      message: 'Version updated successfully',
      data: version,
    });
  } catch (error) {
    console.error('Error updating version:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// @route   DELETE /api/app/version/:id
// @desc    Delete app version (admin)
// @access  Admin
router.delete('/version/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const version = await AppVersion.findByIdAndDelete(id);

    if (!version) {
      return res.status(404).json({
        success: false,
        message: 'Version not found',
      });
    }

    res.json({
      success: true,
      message: 'Version deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting version:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

module.exports = router;
