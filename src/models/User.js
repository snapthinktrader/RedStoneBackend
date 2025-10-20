const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false, // Don't include password in queries by default
  },
  referralCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  walletBalance: {
    type: Number,
    default: 0.00,
    min: [0, 'Wallet balance cannot be negative'],
  },
  totalDeposit: {
    type: Number,
    default: 0.00,
    min: [0, 'Total deposit cannot be negative'],
  },
  currentLevel: {
    type: Number,
    default: 1,
    min: [1, 'Level must be at least 1'],
    max: [10, 'Level cannot exceed 10'],
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  twoFactorSecret: {
    type: String,
    default: null,
  },
  notificationSettings: {
    email: {
      type: Boolean,
      default: true,
    },
    sms: {
      type: Boolean,
      default: false,
    },
    push: {
      type: Boolean,
      default: true,
    },
  },
  lastLoginAt: {
    type: Date,
    default: null,
  },
  emailVerifiedAt: {
    type: Date,
    default: null,
  },
  emailVerificationToken: {
    type: String,
    default: null,
  },
  emailVerificationExpires: {
    type: Date,
    default: null,
  },
  passwordResetToken: {
    type: String,
    default: null,
  },
  passwordResetExpires: {
    type: Date,
    default: null,
  },
  profilePicture: {
    type: String,
    default: null,
  },
  totalEarnings: {
    type: Number,
    default: 0.00,
    min: [0, 'Total earnings cannot be negative'],
  },
  lastEarningUpdate: {
    type: Date,
    default: null, // Will be set when first deposit is confirmed
  },
  pendingEarnings: {
    type: Number,
    default: 0.00,
    min: [0, 'Pending earnings cannot be negative'],
  },
  directReferrals: {
    type: Number,
    default: 0,
    min: [0, 'Direct referrals cannot be negative'],
  },
  indirectReferrals: {
    type: Number,
    default: 0,
    min: [0, 'Indirect referrals cannot be negative'],
  },
  refreshTokens: [{
    token: String,
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 2592000, // 30 days
    }
  }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ referralCode: 1 }, { unique: true });
userSchema.index({ referredBy: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// Virtual fields
userSchema.virtual('dailyEarnings').get(function() {
  const rate = parseFloat(process.env.DAILY_EARNING_RATE) || 0.02;
  return this.walletBalance * rate;
});

userSchema.virtual('levelName').get(function() {
  const levels = {
    1: 'Bronze',
    2: 'Silver', 
    3: 'Gold',
    4: 'Platinum',
    5: 'Diamond'
  };
  return levels[this.currentLevel] || `Level ${this.currentLevel || 1}`;
});

userSchema.virtual('commissionRate').get(function() {
  const rates = JSON.parse(process.env.LEVEL_COMMISSION_RATES || '{"1":0.05,"2":0.08,"3":0.12,"4":0.15,"5":0.20}');
  const level = this.currentLevel || 1;
  return rates[level.toString()] || 0.05;
});

// Pre-save middleware
userSchema.pre('save', async function(next) {
  // Hash password if it's modified
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
  }

  // Generate referral code if not present
  if (!this.referralCode) {
    this.referralCode = await this.constructor.generateUniqueReferralCode();
  }

  next();
});

// Pre-save middleware to update level based on total deposit
userSchema.pre('save', function(next) {
  if (this.isModified('totalDeposit')) {
    this.updateLevel();
  }
  next();
});

// Instance methods
userSchema.methods.checkPassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.updateLevel = function() {
  const deposit = this.totalDeposit;
  let newLevel = 1;
  
  if (deposit >= 10000) newLevel = 5; // Diamond
  else if (deposit >= 5000) newLevel = 4; // Platinum
  else if (deposit >= 2000) newLevel = 3; // Gold
  else if (deposit >= 500) newLevel = 2; // Silver
  
  this.currentLevel = newLevel;
  return this;
};

userSchema.methods.getDailyEarnings = function() {
  // Daily earnings are 2% of the total wallet balance (including deposits, commissions, bonuses)
  const rate = parseFloat(process.env.DAILY_EARNING_RATE) || 0.02;
  return (this.walletBalance || 0) * rate;
};

userSchema.methods.getCommissionRate = function() {
  const rates = JSON.parse(process.env.LEVEL_COMMISSION_RATES || '{"1":0.05,"2":0.08,"3":0.12,"4":0.15,"5":0.20}');
  return rates[this.currentLevel.toString()] || 0.05;
};

/**
 * Calculate real-time earnings based on elapsed time since last update
 * Earnings = 2% daily = 0.02 / 86400 seconds per second
 * @returns {Object} { calculatedBalance, pendingEarnings, lastUpdate }
 */
userSchema.methods.calculateRealTimeEarnings = function() {
  const DAILY_RATE = 0.02; // 2% per day
  const SECONDS_PER_DAY = 86400;
  const RATE_PER_SECOND = DAILY_RATE / SECONDS_PER_DAY; // 0.000023148148...
  
  const now = new Date();
  const lastUpdate = this.lastEarningUpdate || this.createdAt || now;
  const elapsedSeconds = Math.floor((now - lastUpdate) / 1000);
  
  // If no balance or no time elapsed, return current state
  if (!this.walletBalance || elapsedSeconds <= 0) {
    return {
      calculatedBalance: this.walletBalance || 0,
      pendingEarnings: 0,
      elapsedSeconds: 0,
      lastUpdate: lastUpdate,
      currentTime: now
    };
  }
  
  // Calculate earnings based on current wallet balance
  // The balance grows exponentially: Balance(t) = Balance(0) * (1 + rate)^(seconds)
  // For small rates and short time periods, we can approximate: Balance(0) * (1 + rate * seconds)
  const compoundFactor = Math.pow(1 + RATE_PER_SECOND, elapsedSeconds);
  const newEarnings = this.walletBalance * (compoundFactor - 1);
  
  return {
    calculatedBalance: this.walletBalance + newEarnings,
    pendingEarnings: newEarnings,
    elapsedSeconds: elapsedSeconds,
    lastUpdate: lastUpdate,
    currentTime: now,
    dailyRate: DAILY_RATE,
    ratePerSecond: RATE_PER_SECOND
  };
};

userSchema.methods.addRefreshToken = function(token) {
  this.refreshTokens.push({ token });
  return this.save();
};

userSchema.methods.removeRefreshToken = function(token) {
  this.refreshTokens = this.refreshTokens.filter(tokenObj => tokenObj.token !== token);
  return this.save();
};

userSchema.methods.clearRefreshTokens = function() {
  this.refreshTokens = [];
  return this.save();
};

// Static methods
userSchema.statics.generateUniqueReferralCode = async function() {
  let referralCode;
  let isUnique = false;
  
  while (!isUnique) {
    referralCode = this.generateReferralCode();
    const existingUser = await this.findOne({ referralCode });
    if (!existingUser) {
      isUnique = true;
    }
  }
  
  return referralCode;
};

userSchema.statics.generateReferralCode = function() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'RS';
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

userSchema.statics.findByReferralCode = function(referralCode) {
  return this.findOne({ referralCode: referralCode.toUpperCase() });
};

userSchema.statics.getUserStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { _id: mongoose.Types.ObjectId(userId) } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: 'referredBy',
        as: 'directReferrals'
      }
    },
    {
      $lookup: {
        from: 'transactions',
        localField: '_id',
        foreignField: 'userId',
        as: 'transactions'
      }
    },
    {
      $project: {
        name: 1,
        email: 1,
        walletBalance: 1,
        totalDeposit: 1,
        currentLevel: 1,
        directReferralCount: { $size: '$directReferrals' },
        totalTransactions: { $size: '$transactions' },
        totalEarnings: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: '$transactions',
                  cond: { 
                    $and: [
                      { $eq: ['$$this.status', 'COMPLETED'] },
                      { $in: ['$$this.type', ['DAILY_EARNING', 'REFERRAL_COMMISSION', 'MILESTONE_BONUS']] }
                    ]
                  }
                }
              },
              as: 'transaction',
              in: '$$transaction.amount'
            }
          }
        }
      }
    }
  ]);

  return stats[0] || null;
};

// Ensure we don't return password in JSON
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.refreshTokens;
  delete userObject.twoFactorSecret;
  return userObject;
};

const User = mongoose.model('User', userSchema);

module.exports = User;