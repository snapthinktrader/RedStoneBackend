const mongoose = require('mongoose');

const fingerprintSessionSchema = new mongoose.Schema({
  // Referral information
  referral_code: {
    type: String,
    required: true,
    index: true
  },
  referrer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  referrer_name: {
    type: String,
    required: true
  },
  
  // Fingerprint data from web browser
  ip_address: {
    type: String,
    required: true
  },
  // Device identifiers (optional - may be populated from web or mobile)
  device_id: {
    type: String,
    default: null,
    index: true
  },
  device_name: {
    type: String,
    default: null
  },
  device_model: {
    type: String,
    default: null
  },
  device_manufacturer: {
    type: String,
    default: null
  },
  gpu_renderer: {
    type: String,
    default: 'unknown'
  },
  screen_resolution: {
    type: String,
    default: 'unknown'
  },
  user_agent: {
    type: String,
    required: true
  },
  timezone: {
    type: String,
    default: 'unknown'
  },
  language: {
    type: String,
    default: 'unknown'
  },
  
  // Session status
  status: {
    type: String,
    enum: ['pending', 'downloaded', 'confirmed', 'rejected', 'expired'],
    default: 'pending',
    index: true
  },
  
  // Download tracking
  download_timestamp: {
    type: Date
  },
  download_fingerprint: {
    type: Object
  },
  
  // Matching confidence score (0-1)
  match_confidence: {
    type: Number,
    default: 0
  },
  
  // Expiration
  expires_at: {
    type: Date,
    required: true,
    index: true
  },
  
  // Timestamps
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  confirmed_at: {
    type: Date
  }
});

// Index for querying pending sessions
fingerprintSessionSchema.index({ status: 1, expires_at: 1 });

// TTL index to automatically delete expired documents after 24 hours
fingerprintSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 86400 });

// Virtual for checking if session is expired
fingerprintSessionSchema.virtual('isExpired').get(function() {
  return this.expires_at < new Date();
});

// Method to mark as confirmed
fingerprintSessionSchema.methods.confirm = async function() {
  this.status = 'confirmed';
  this.confirmed_at = new Date();
  return this.save();
};

// Method to mark as rejected
fingerprintSessionSchema.methods.reject = async function() {
  this.status = 'rejected';
  return this.save();
};

// Static method to clean up expired sessions
fingerprintSessionSchema.statics.cleanupExpired = async function() {
  const result = await this.updateMany(
    {
      status: 'pending',
      expires_at: { $lt: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );
  return result;
};

const FingerprintSession = mongoose.model('FingerprintSession', fingerprintSessionSchema);

module.exports = FingerprintSession;
