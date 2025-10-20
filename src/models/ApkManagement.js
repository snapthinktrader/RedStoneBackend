const mongoose = require('mongoose');

const apkManagementSchema = new mongoose.Schema({
  version: {
    type: String,
    required: true,
    unique: true
  },
  versionCode: {
    type: Number,
    required: true,
    unique: true
  },
  fileId: {
    type: String,
    required: true,
    index: true
  },
  filename: {
    type: String,
    required: true
  },
  fileSize: {
    type: String,
    required: true
  },
  downloadUrl: {
    type: String,
    required: true
  },
  releaseNotes: {
    type: String,
    default: ''
  },
  features: [{
    type: String
  }],
  bugFixes: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: false
  },
  platform: {
    type: String,
    enum: ['android', 'ios', 'both'],
    default: 'android'
  },
  minOsVersion: {
    type: String,
    default: '5.0'
  },
  uploadedBy: {
    type: String,
    default: 'admin'
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  downloadCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for quick queries
apkManagementSchema.index({ isActive: -1, version: -1 });
apkManagementSchema.index({ versionCode: -1 });

const ApkManagement = mongoose.model('ApkManagement', apkManagementSchema, 'apkmanagement');

module.exports = ApkManagement;
