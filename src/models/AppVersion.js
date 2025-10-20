const mongoose = require('mongoose');

const appVersionSchema = new mongoose.Schema({
  version: {
    type: String,
    required: true,
    unique: true,
  },
  versionCode: {
    type: Number,
    required: true,
  },
  platform: {
    type: String,
    enum: ['android', 'ios'],
    required: true,
  },
  downloadUrl: {
    type: String,
    required: true,
  },
  fileSize: {
    type: String, // e.g., "45.2 MB"
    required: true,
  },
  releaseNotes: {
    type: String,
    required: true,
  },
  features: [{
    type: String,
  }],
  bugFixes: [{
    type: String,
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
  isMandatory: {
    type: Boolean,
    default: false,
  },
  minSupportedVersion: {
    type: String,
  },
  downloadCount: {
    type: Number,
    default: 0,
  },
  uploadedBy: {
    type: String,
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Index for faster queries
appVersionSchema.index({ platform: 1, isActive: 1, versionCode: -1 });

// Static method to get latest version
appVersionSchema.statics.getLatestVersion = async function(platform) {
  return this.findOne({ platform, isActive: true })
    .sort({ versionCode: -1 })
    .exec();
};

// Instance method to increment download count
appVersionSchema.methods.incrementDownloadCount = async function() {
  this.downloadCount += 1;
  return this.save();
};

const AppVersion = mongoose.model('AppVersion', appVersionSchema);

module.exports = AppVersion;
