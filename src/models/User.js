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
    max: [8, 'Level cannot exceed 8'], // Updated to support 8 levels (Basic to Radiant)
  },
  referralLevel: {
    type: Number,
    default: 1,
    min: [1, 'Referral level must be at least 1'],
    max: [9, 'Referral level cannot exceed 9'], // Level 1-9 based on referral count
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
userSchema.virtual('dailyEarningRate').get(function() {
  // Daily earning rates based on deposit levels (recheck.txt documents 1-3)
  const rates = {
    1: 0.02,  // Basic: 2%
    2: 0.02,  // Bronze: 2%
    3: 0.025, // Silver: 2.5%
    4: 0.03,  // Gold: 3% (estimated for missing page 2)
    5: 0.035, // Platinum: 3.5% (estimated for missing page 2)
    6: 0.04,  // Diamond: 4% (estimated for missing page 2)
    7: 0.045, // Ascendant: 4.5%
    8: 0.05   // Radiant: 5%
  };
  return rates[this.currentLevel] || 0.02;
});

userSchema.virtual('dailyEarnings').get(function() {
  return this.walletBalance * this.dailyEarningRate;
});

userSchema.virtual('levelName').get(function() {
  const levels = {
    1: 'Basic',
    2: 'Bronze', 
    3: 'Silver',
    4: 'Gold',
    5: 'Platinum',
    6: 'Diamond',
    7: 'Ascendant',
    8: 'Radiant'
  };
  return levels[this.currentLevel] || `Level ${this.currentLevel || 1}`;
});

userSchema.virtual('commissionRate').get(function() {
  // Commission rates based on referral levels (recheck.txt documents 4-7)
  const rates = {
    1: 0.00,  // Level 1: 0% (no commission)
    2: 0.15,  // Level 2: 15% direct
    3: 0.20,  // Level 3: 20% direct
    4: 0.25,  // Level 4: 25% direct
    5: 0.30,  // Level 5: 30% direct
    6: 0.35,  // Level 6: 35% direct
    7: 0.40,  // Level 7: 40% direct
    8: 0.45,  // Level 8: 45% direct
    9: 0.50   // Level 9: 50% direct
  };
  return rates[this.referralLevel] || 0.00;
});

userSchema.virtual('indirectCommissionRate').get(function() {
  // Indirect commission rates based on referral levels (recheck.txt documents 4-7)
  const rates = {
    1: 0.00,  // Level 1: 0% (no commission)
    2: 0.02,  // Level 2: 2% indirect
    3: 0.03,  // Level 3: 3% indirect
    4: 0.04,  // Level 4: 4% indirect
    5: 0.05,  // Level 5: 5% indirect
    6: 0.06,  // Level 6: 6% indirect
    7: 0.07,  // Level 7: 7% indirect
    8: 0.08,  // Level 8: 8% indirect
    9: 0.10   // Level 9: 10% indirect
  };
  return rates[this.referralLevel] || 0.00;
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
  if (this.isModified('directReferrals')) {
    this.updateReferralLevel();
  }
  next();
});

// Instance methods
userSchema.methods.checkPassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.updateLevel = function() {
  // Deposit-based level progression (recheck.txt documents 1-3)
  const deposit = this.totalDeposit;
  let newLevel = 1; // Basic
  
  if (deposit >= 10000) newLevel = 8;      // Radiant: $10,000
  else if (deposit >= 5000) newLevel = 7;  // Ascendant: $5,000
  else if (deposit >= 3500) newLevel = 6;  // Diamond: $3,500 (estimated)
  else if (deposit >= 2000) newLevel = 5;  // Platinum: $2,000 (estimated)
  else if (deposit >= 1000) newLevel = 4;  // Gold: $1,000 (estimated)
  else if (deposit >= 300) newLevel = 3;   // Silver: $300
  else if (deposit >= 50) newLevel = 2;    // Bronze: $50
  else if (deposit >= 15) newLevel = 1;    // Basic: $15
  
  this.currentLevel = newLevel;
  return this;
};

userSchema.methods.updateReferralLevel = function() {
  // Referral-based level progression (recheck.txt documents 4-7)
  const referralCount = this.directReferrals || 0;
  let newReferralLevel = 1; // Level 1: 0 referrals
  
  if (referralCount >= 1000) newReferralLevel = 9;      // Level 9: 1000 referrals
  else if (referralCount >= 500) newReferralLevel = 8;  // Level 8: 500 referrals
  else if (referralCount >= 100) newReferralLevel = 7;  // Level 7: 100 referrals
  else if (referralCount >= 50) newReferralLevel = 6;   // Level 6: 50 referrals
  else if (referralCount >= 25) newReferralLevel = 5;   // Level 5: 25 referrals
  else if (referralCount >= 15) newReferralLevel = 4;   // Level 4: 15 referrals
  else if (referralCount >= 10) newReferralLevel = 3;   // Level 3: 10 referrals
  else if (referralCount >= 3) newReferralLevel = 2;    // Level 2: 3 referrals
  else newReferralLevel = 1;                            // Level 1: 0 referrals
  
  this.referralLevel = newReferralLevel;
  return this;
};

userSchema.methods.getDailyEarnings = function() {
  // Daily earnings based on deposit level rates (recheck.txt documents 1-3)
  return (this.walletBalance || 0) * this.dailyEarningRate;
};

userSchema.methods.getCommissionRate = function() {
  // Commission rates based on referral level (recheck.txt documents 4-7)
  return this.commissionRate;
};

/**
 * Get milestone bonuses based on referral count
 * Returns the bonus amount for reaching a referral milestone
 * Based on recheck.txt documents 11-12 (Basic level vs Bronze+ level bonuses)
 */
userSchema.methods.getMilestoneBonus = function(referralCount) {
  // Basic level bonuses (recheck.txt document 11)
  const basicLevelBonuses = {
    3: 15,      // $15 for 3 referrals
    10: 30,     // $30 for 10 referrals
    15: 45,     // $45 for 15 referrals
    25: 65,     // $65 for 25 referrals
    50: 100,    // $100 for 50 referrals
    100: 300,   // $300 for 100 referrals
    500: 1000,  // $1000 for 500 referrals
    1000: 3500  // $3500 for 1000 referrals
  };
  
  // Bronze+ level bonuses (recheck.txt document 12)
  const bronzePlusBonuses = {
    3: 50,      // $50 for 3 referrals
    10: 100,    // $100 for 10 referrals
    15: 150,    // $150 for 15 referrals
    25: 250,    // $250 for 25 referrals
    50: 750,    // $750 for 50 referrals
    100: 1600,  // $1600 for 100 referrals
    500: 5000,  // $5000 for 500 referrals
    1000: 25000 // $25000 for 1000 referrals
  };
  
  // Use Bronze+ bonuses if deposit level is Bronze (2) or higher, otherwise use Basic
  const bonuses = this.currentLevel >= 2 ? bronzePlusBonuses : basicLevelBonuses;
  return bonuses[referralCount] || 0;
};

/**
 * Check if user qualifies for a milestone bonus
 * @param {Number} referralCount - Current direct referral count
 * @param {Number} previousCount - Previous direct referral count
 * @returns {Object|null} - {bonus: Number, milestone: Number} or null
 */
userSchema.methods.checkMilestoneBonus = function(referralCount, previousCount = 0) {
  const milestones = [3, 10, 15, 25, 50, 100, 500, 1000];
  
  // Find if user crossed a milestone
  for (const milestone of milestones) {
    if (referralCount >= milestone && previousCount < milestone) {
      const bonus = this.getMilestoneBonus(milestone);
      return { bonus, milestone };
    }
  }
  
  return null;
};

/**
 * Calculate real-time earnings based on elapsed time since last update
 * Uses deposit-based daily earning rates from recheck.txt
 * @returns {Object} { calculatedBalance, pendingEarnings, lastUpdate }
 */
userSchema.methods.calculateRealTimeEarnings = function() {
  const dailyRate = this.dailyEarningRate; // Deposit-based rate from virtual field
  const SECONDS_PER_DAY = 86400;
  const RATE_PER_SECOND = dailyRate / SECONDS_PER_DAY;
  
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
      currentTime: now,
      dailyRate: dailyRate,
      ratePerSecond: RATE_PER_SECOND
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
    dailyRate: dailyRate,
    ratePerSecond: RATE_PER_SECOND
  };
};

/**
 * Calculate daily referral commission earnings based on new system
 * Based on recheck.txt: Commission = % of referral's daily earnings (not deposits)
 * Example: Level 2 gets 15% of each referral's daily income
 * @param {Array} directReferrals - Array of direct referral users
 * @returns {Number} Daily commission earnings
 */
userSchema.methods.calculateDailyReferralCommission = function(directReferrals = []) {
  const commissionRate = this.getCommissionRate(); // Direct commission rate based on referral level
  
  if (commissionRate === 0) return 0; // Level 1 gets no commission
  
  // Sum of all referrals' daily earnings
  const totalReferralDailyEarnings = directReferrals.reduce((sum, referral) => {
    return sum + referral.getDailyEarnings();
  }, 0);
  
  // Daily commission = Commission rate × Total referrals' daily earnings
  // Example: 15% × $10 daily earnings = $1.50 daily commission
  const dailyCommission = totalReferralDailyEarnings * commissionRate;
  
  return dailyCommission;
};

/**
 * Calculate daily indirect referral commission earnings
 * Based on recheck.txt: Indirect commission = % of indirect referral's daily earnings
 * @param {Array} indirectReferrals - Array of indirect referral users (referrals of your referrals)
 * @returns {Number} Daily indirect commission earnings
 */
userSchema.methods.calculateDailyIndirectReferralCommission = function(indirectReferrals = []) {
  const indirectCommissionRate = this.indirectCommissionRate; // Indirect commission rate based on referral level
  
  if (indirectCommissionRate === 0) return 0; // Level 1 gets no commission
  
  // Sum of all indirect referrals' daily earnings
  const totalIndirectReferralDailyEarnings = indirectReferrals.reduce((sum, referral) => {
    return sum + referral.getDailyEarnings();
  }, 0);
  
  // Daily indirect commission = Indirect commission rate × Total indirect referrals' daily earnings
  // Example: 2% × $50 daily earnings = $1.00 daily indirect commission
  const dailyIndirectCommission = totalIndirectReferralDailyEarnings * indirectCommissionRate;
  
  return dailyIndirectCommission;
};

/**
 * Calculate real-time referral commission earnings based on elapsed time
 * New system: Commission based on % of referrals' daily earnings
 * @returns {Object} { pendingCommission, pendingIndirectCommission, dailyCommissionRate, etc. }
 */
userSchema.methods.calculateRealTimeReferralCommission = async function() {
  const SECONDS_PER_DAY = 86400;
  
  const now = new Date();
  const lastUpdate = this.lastEarningUpdate || this.createdAt || now;
  const elapsedSeconds = Math.floor((now - lastUpdate) / 1000);
  
  if (elapsedSeconds <= 0) {
    return {
      pendingCommission: 0,
      pendingIndirectCommission: 0,
      elapsedSeconds: 0,
      dailyCommissionRate: 0,
      dailyIndirectCommissionRate: 0,
      commissionRate: this.getCommissionRate(),
      indirectCommissionRate: this.indirectCommissionRate,
      referralCount: 0,
      indirectReferralCount: 0
    };
  }
  
  // Get direct referrals with their earning calculations
  const User = this.constructor;
  const directReferrals = await User.find({ referredBy: this._id, isActive: true })
    .select('walletBalance totalDeposit currentLevel');
    
  // Get indirect referrals (referrals of your referrals)
  const directReferralIds = directReferrals.map(ref => ref._id);
  const indirectReferrals = await User.find({ 
    referredBy: { $in: directReferralIds }, 
    isActive: true 
  }).select('walletBalance totalDeposit currentLevel');
  
  // Calculate base daily commission amounts
  const baseDailyCommission = this.calculateDailyReferralCommission(directReferrals);
  const baseDailyIndirectCommission = this.calculateDailyIndirectReferralCommission(indirectReferrals);
  
  // Calculate pending commission over elapsed time (simple interest)
  const pendingCommission = baseDailyCommission * (elapsedSeconds / SECONDS_PER_DAY);
  const pendingIndirectCommission = baseDailyIndirectCommission * (elapsedSeconds / SECONDS_PER_DAY);
  
  // Calculate total daily earnings from all referrals for reporting
  const totalReferralDailyEarnings = directReferrals.reduce((sum, referral) => {
    return sum + referral.getDailyEarnings();
  }, 0);
  
  const totalIndirectReferralDailyEarnings = indirectReferrals.reduce((sum, referral) => {
    return sum + referral.getDailyEarnings();
  }, 0);
  
  return {
    pendingCommission,
    pendingIndirectCommission,
    elapsedSeconds,
    dailyCommissionRate: baseDailyCommission,
    dailyIndirectCommissionRate: baseDailyIndirectCommission,
    totalReferralDailyEarnings,
    totalIndirectReferralDailyEarnings,
    commissionRate: this.getCommissionRate(),
    indirectCommissionRate: this.indirectCommissionRate,
    referralCount: directReferrals.length,
    indirectReferralCount: indirectReferrals.length
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