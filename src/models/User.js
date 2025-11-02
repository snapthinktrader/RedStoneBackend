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
  totalReferrals: {
    type: Number,
    default: 0,
    min: [0, 'Total referrals cannot be negative'],
  },
  lifetimeReferralEarnings: {
    type: Number,
    default: 0.00,
    min: [0, 'Lifetime referral earnings cannot be negative'],
  },
  pendingCommission: {
    type: Number,
    default: 0.00,
    min: [0, 'Pending commission cannot be negative'],
  },
  // Withdrawal tracking
  withdrawalCount: {
    type: Number,
    default: 0,
    min: [0, 'Withdrawal count cannot be negative'],
  },
  lastSuccessfulWithdrawal: {
    type: Date,
    default: null,
  },
  totalWithdrawn: {
    type: Number,
    default: 0.00,
    min: [0, 'Total withdrawn cannot be negative'],
  },
  // Reusable deposit wallet (saves network fees)
  currentDepositWallet: {
    address: {
      type: String,
      default: null
    },
    privateKey: {
      type: String,
      default: null,
      select: false // Don't include in queries by default for security
    },
    depositCount: {
      type: Number,
      default: 0
    },
    totalReceived: {
      type: Number,
      default: 0.00
    },
    createdAt: {
      type: Date,
      default: null
    },
    lastUsedAt: {
      type: Date,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  // Wallet rotation tracking
  walletRotationHistory: [{
    address: String,
    depositCount: Number,
    totalReceived: Number,
    createdAt: Date,
    rotatedAt: Date,
    finalBalance: Number
  }],
  // Dual milestone tracking (separate lower and upper tracks)
  milestoneTracking: {
    lowerTrack: {
      count: { type: Number, default: 0 }, // Referrals with deposits $0-$49
      lastMilestoneClaimed: { type: Number, default: 0 },
      claimedMilestones: [{ milestone: Number, claimedAt: Date, bonus: Number }]
    },
    upperTrack: {
      count: { type: Number, default: 0 }, // Referrals with deposits $50+
      lastMilestoneClaimed: { type: Number, default: 0 },
      claimedMilestones: [{ milestone: Number, claimedAt: Date, bonus: Number }]
    }
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

// Sync referral counts and level by counting actual referrals from database
userSchema.methods.syncReferralData = async function() {
  // Count actual direct referrals
  const actualDirectReferrals = await this.constructor.countDocuments({
    referredBy: this._id,
    isActive: true
  });
  
  // Count actual indirect referrals
  const actualIndirectReferrals = await this.constructor.countDocuments({
    referredBy: { $in: await this.constructor.find({ referredBy: this._id, isActive: true }).distinct('_id') },
    isActive: true
  });
  
  // Update counts
  this.directReferrals = actualDirectReferrals;
  this.indirectReferrals = actualIndirectReferrals;
  
  // Update referral level based on actual count
  this.updateReferralLevel();
  
  return this;
};

/**
 * Calculate daily earnings considering each deposit's individual earning period
 * Each deposit earns separately based on when it was confirmed
 * Example: $99 deposited 11 days ago earns from 11 days ago
 *          $9999 deposited today only earns from today
 * @returns {Number} Total daily earnings rate from all deposits
 */
userSchema.methods.getDailyEarnings = async function() {
  // If no wallet balance, no earnings
  if (!this.walletBalance || this.walletBalance <= 0) return 0;
  
  // Get all confirmed/completed deposits for this user
  const Deposit = require('./Deposit');
  const deposits = await Deposit.find({
    userId: this._id,
    status: { $in: ['CONFIRMED', 'COMPLETED'] }, // Accept both CONFIRMED and COMPLETED
    balanceUpdated: true
  }).select('amount processedAt createdAt').sort({ processedAt: 1 });
  
  // If no deposits found, fall back to simple calculation
  // (for users with manual credits or old accounts)
  if (!deposits || deposits.length === 0) {
    return (this.walletBalance || 0) * this.dailyEarningRate;
  }
  
  // Calculate total deposit amount
  const totalDeposits = deposits.reduce((sum, dep) => sum + dep.amount, 0);
  
  // If deposits match wallet balance, use deposit-based calculation
  // Otherwise fall back to wallet balance (accounting for withdrawals)
  const baseAmount = Math.abs(totalDeposits - this.walletBalance) < 0.01 
    ? totalDeposits 
    : this.walletBalance;
  
  // Daily earnings based on current balance and rate
  return baseAmount * this.dailyEarningRate;
};

userSchema.methods.getCommissionRate = function() {
  // Commission rates based on referral level (recheck.txt documents 4-7)
  return this.commissionRate;
};

/**
 * Get milestone bonuses based on referral count and track type
 * Dual-track system: Lower ($0-$49) and Upper ($50+)
 * Uses environment configuration for milestone values
 * @param {Number} referralCount - Referral count for specific track
 * @param {String} track - 'lower' or 'upper'
 * @returns {Number} - Bonus amount
 */
userSchema.methods.getMilestoneBonus = function(referralCount, track = 'lower') {
  // Get milestone bonuses from environment configuration
  const lowerTrackBonuses = JSON.parse(process.env.MILESTONE_BONUSES_LOWER || '{"3":50,"10":100,"15":150,"25":250,"50":750,"100":1000,"500":5000,"1000":25000}');
  const upperTrackBonuses = JSON.parse(process.env.MILESTONE_BONUSES_UPPER || '{"3":100,"10":200,"15":300,"25":500,"50":1500,"100":3000,"500":10000,"1000":50000}');
  
  if (track === 'upper') {
    // Upper bonuses only for Bronze+ (level 2+)
    return this.currentLevel >= 2 ? (parseInt(upperTrackBonuses[referralCount]) || 0) : 0;
  }
  
  // Lower bonuses available for all levels
  return parseInt(lowerTrackBonuses[referralCount]) || 0;
};

/**
 * Check if user qualifies for milestone bonuses (dual-track system)
 * Tracks lower ($0-$49) and upper ($50+) milestones separately
 * @returns {Object} - { lowerMilestones: Array, upperMilestones: Array, canClaimUpper: Boolean }
 */
userSchema.methods.checkMilestoneBonus = function() {
  // Get milestone counts from environment configuration
  const lowerTrackBonuses = JSON.parse(process.env.MILESTONE_BONUSES_LOWER || '{"3":50,"10":100,"15":150,"25":250,"50":750,"100":1000,"500":5000,"1000":25000}');
  const upperTrackBonuses = JSON.parse(process.env.MILESTONE_BONUSES_UPPER || '{"3":100,"10":200,"15":300,"25":500,"50":1500,"100":3000,"500":10000,"1000":50000}');
  
  const milestones = Object.keys(lowerTrackBonuses).map(k => parseInt(k)).sort((a, b) => a - b);
  
  // Initialize tracking if not exists
  if (!this.milestoneTracking) {
    this.milestoneTracking = {
      lowerTrack: { count: 0, lastMilestoneClaimed: 0, claimedMilestones: [] },
      upperTrack: { count: 0, lastMilestoneClaimed: 0, claimedMilestones: [] }
    };
  }
  
  const lowerCount = this.milestoneTracking.lowerTrack.count || 0;
  const upperCount = this.milestoneTracking.upperTrack.count || 0;
  const lowerLastClaimed = this.milestoneTracking.lowerTrack.lastMilestoneClaimed || 0;
  const upperLastClaimed = this.milestoneTracking.upperTrack.lastMilestoneClaimed || 0;
  
  const result = {
    lowerMilestones: [],
    upperMilestones: [],
    canClaimUpper: this.currentLevel >= 2 // Bronze+ can claim upper
  };
  
  // Check lower track milestones (always claimable)
  for (const milestone of milestones) {
    if (lowerCount >= milestone && lowerLastClaimed < milestone) {
      const bonus = this.getMilestoneBonus(milestone, 'lower');
      result.lowerMilestones.push({
        milestone,
        bonus,
        track: 'lower',
        count: lowerCount,
        claimable: true
      });
    }
  }
  
  // Check upper track milestones (only claimable for Bronze+)
  for (const milestone of milestones) {
    if (upperCount >= milestone && upperLastClaimed < milestone) {
      const bonus = this.getMilestoneBonus(milestone, 'upper');
      result.upperMilestones.push({
        milestone,
        bonus,
        track: 'upper',
        count: upperCount,
        claimable: this.currentLevel >= 2, // Only Bronze+ can claim
        locked: this.currentLevel < 2
      });
    }
  }
  
  return result;
};

/**
 * Update milestone tracking when referral makes a deposit
 * @param {Number} depositAmount - Amount deposited by referral
 * DEPRECATED: This method incorrectly counts deposits instead of unique referrals
 * Milestone tracking is now handled by the /stats endpoint auto-initialization
 */
userSchema.methods.updateMilestoneTracking = function(depositAmount) {
  // DO NOTHING - milestone tracking is now handled by the /stats endpoint
  // which correctly counts unique referrals by their total deposits
  console.log(`   ⚠️  updateMilestoneTracking called but ignored - use /stats endpoint for accurate counting`);
};

/**
 * Calculate real-time earnings based on elapsed time since last update
 * Uses per-deposit/transaction calculation for accurate compound interest
 * Looks at both Deposit table and Transaction records (DEPOSIT type)
 * @returns {Object} { calculatedBalance, pendingEarnings, lastUpdate }
 */
userSchema.methods.calculateRealTimeEarnings = async function() {
  const now = new Date();
  const SECONDS_PER_DAY = 86400;
  const myCommissionRate = this.getCommissionRate(); // 15% commission rate
  
  // Get all transactions (deposits, bonuses) in chronological order
  const Transaction = require('./Transaction');
  const transactions = await Transaction.find({
    userId: this._id,
    type: { $in: ['DEPOSIT', 'PROMOTIONAL_BONUS', 'MILESTONE_BONUS'] },
    status: 'COMPLETED'
  }).select('type amount createdAt description').sort({ createdAt: 1 });
  
  if (transactions.length === 0) {
    return {
      calculatedBalance: this.walletBalance || 0,
      pendingEarnings: 0,
      elapsedSeconds: 0,
      lastUpdate: this.createdAt,
      currentTime: now,
      dailyRate: 0,
      ratePerSecond: 0
    };
  }
  
  // Helper function to determine earning rate based on total deposits
  const getEarningRate = (totalDeposits) => {
    if (totalDeposits >= 10000) return 0.05;      // Radiant: 5%
    if (totalDeposits >= 5000) return 0.045;      // Ascendant: 4.5%
    if (totalDeposits >= 3500) return 0.04;       // Diamond: 4%
    if (totalDeposits >= 2000) return 0.035;      // Platinum: 3.5%
    if (totalDeposits >= 1000) return 0.03;       // Gold: 3%
    if (totalDeposits >= 300) return 0.025;       // Silver: 2.5%
    if (totalDeposits >= 50) return 0.02;         // Bronze: 2%
    if (totalDeposits >= 15) return 0.02;         // Basic: 2%
    return 0;
  };
  
  // Calculate CONSTANT commission rate based on referrals' STORED balances
  // Commission = % of (referral's stored balance × their daily rate)
  let commissionPerSecond = 0;
  let firstReferralDepositTime = null;
  let referralDepositEvents = []; // Track all referral deposits for timeline
  
  if (myCommissionRate > 0 && this.totalReferrals > 0) {
    const refs = await this.constructor.find({
      referredBy: this._id,
      isActive: true
    }).select('_id walletBalance totalDeposit');
    
    // Get ALL referral deposit transactions for timeline
    const Transaction = require('./Transaction');
    const allRefDeposits = await Transaction.find({
      userId: { $in: refs.map(r => r._id) },
      type: 'DEPOSIT',
      status: 'COMPLETED'
    }).select('userId amount createdAt').sort({ createdAt: 1 });
    
    if (allRefDeposits.length > 0) {
      firstReferralDepositTime = new Date(allRefDeposits[0].createdAt);
      
      // Store referral deposit events for timeline processing
      referralDepositEvents = allRefDeposits.map(dep => ({
        time: new Date(dep.createdAt),
        type: 'REFERRAL_DEPOSIT',
        referralId: dep.userId.toString(),
        amount: dep.amount
      }));
    }
  }
  
  // TIMELINE-BASED CALCULATION
  // Merge your transactions with referral deposit events for accurate commission tracking
  const allEvents = [
    ...transactions.map(tx => ({
      time: new Date(tx.createdAt),
      type: tx.type,
      amount: tx.amount,
      isYourTransaction: true
    })),
    ...referralDepositEvents
  ].sort((a, b) => a.time - b.time);
  
  // Track referral deposits per referral ID to calculate commission rates
  const referralTotals = {}; // { referralId: totalDeposit }
  
  // Process each event and compound earnings between events
  let balance = 0;
  let totalDeposits = 0;
  let currentRate = 0;
  let totalOwnEarnings = 0;
  let totalCommissionEarnings = 0;
  
  const yourFirstTxTime = allEvents.find(e => e.isYourTransaction) ? allEvents.find(e => e.isYourTransaction).time : now;
  const commissionStartTime = firstReferralDepositTime || new Date('2099-01-01'); // Far future if no referrals
  
  for (let i = 0; i < allEvents.length; i++) {
    const event = allEvents[i];
    const nextEvent = allEvents[i + 1];
    const eventTime = event.time;
    const nextTime = nextEvent ? nextEvent.time : now;
    
    // Process the event
    if (event.isYourTransaction) {
      // Your transaction - affects your balance and rate
      if (event.type === 'DEPOSIT') {
        totalDeposits += event.amount;
        currentRate = getEarningRate(totalDeposits);
      }
      balance += event.amount; // Add transaction amount to balance
    } else if (event.type === 'REFERRAL_DEPOSIT') {
      // Referral deposit - update referral totals (affects commission rate going forward)
      const refId = event.referralId;
      referralTotals[refId] = (referralTotals[refId] || 0) + event.amount;
    }
    
    // Recalculate commission per second based on current referral totals
    commissionPerSecond = 0;
    if (myCommissionRate > 0 && eventTime >= commissionStartTime) {
      for (const refId in referralTotals) {
        const refTotal = referralTotals[refId];
        if (refTotal > 0) {
          const refDailyRate = getEarningRate(refTotal);
          const refEarningsPerDay = refTotal * refDailyRate;
          const myCommissionPerDay = refEarningsPerDay * myCommissionRate;
          commissionPerSecond += myCommissionPerDay / SECONDS_PER_DAY;
        }
      }
    }
    
    // Calculate compound earnings for the period UNTIL the next event (or now)
    const periodSeconds = Math.floor((nextTime - eventTime) / 1000);
    
    if (periodSeconds > 0) {
      const ratePerSecond = currentRate / SECONDS_PER_DAY;
      
      // Part 1: Your own balance compounds at your rate
      // Formula: Balance × [(1 + rate_per_second)^seconds - 1]
      let principalGrowth = 0;
      if (ratePerSecond > 0 && balance > 0) {
        const compoundFactor = Math.pow(1 + ratePerSecond, periodSeconds);
        principalGrowth = balance * (compoundFactor - 1);
        totalOwnEarnings += principalGrowth;
        balance += principalGrowth; // Add to balance before calculating commission
      }
      
      // Part 2: Referral commission (only after they deposit)
      // Commission flows as a stream and compounds with YOUR rate
      // Formula: C × [((1 + r)^t - 1) / r] where C = commission per second, r = your rate
      let commissionStreamValue = 0;
      if (commissionPerSecond > 0 && nextTime > commissionStartTime) {
        // Calculate overlap period (only the time after commission starts)
        const overlapStart = eventTime > commissionStartTime ? eventTime : commissionStartTime;
        const overlapSeconds = Math.floor((nextTime - overlapStart) / 1000);
        
        if (overlapSeconds > 0) {
          if (ratePerSecond > 0) {
            // Commission stream compounds at YOUR rate
            const compoundFactor = Math.pow(1 + ratePerSecond, overlapSeconds);
            commissionStreamValue = commissionPerSecond * (compoundFactor - 1) / ratePerSecond;
          } else {
            // No compounding if your rate is 0
            commissionStreamValue = commissionPerSecond * overlapSeconds;
          }
          totalCommissionEarnings += commissionStreamValue;
          balance += commissionStreamValue; // Add commission to balance
        }
      }
    }
  }
  
  const totalEarnings = totalOwnEarnings + totalCommissionEarnings;
  
  return {
    calculatedBalance: balance,
    pendingEarnings: totalEarnings,
    ownEarnings: totalOwnEarnings,
    referralCommission: totalCommissionEarnings,
    elapsedSeconds: Math.floor((now - yourFirstTxTime) / 1000),
    lastUpdate: yourFirstTxTime,
    currentTime: now,
    dailyRate: currentRate,
    ratePerSecond: currentRate / SECONDS_PER_DAY,
    depositsFound: transactions.filter(t => t.type === 'DEPOSIT').length,
    totalDepositAmount: totalDeposits,
    commissionPerDay: commissionPerSecond * SECONDS_PER_DAY
  };
};

/**
 * Calculate daily referral commission earnings based on new system
 * Based on recheck.txt: Commission = % of referral's daily earnings (not deposits)
 * Example: Level 2 gets 15% of each referral's daily income
 * @param {Array} directReferrals - Array of direct referral users
 * @returns {Number} Daily commission earnings
 */
userSchema.methods.calculateDailyReferralCommission = async function(directReferrals = []) {
  const commissionRate = this.getCommissionRate(); // Direct commission rate based on referral level

  if (commissionRate === 0) return 0; // Level 1 gets no commission

  // Sum of all referrals' daily earnings (handle async getDailyEarnings)
  const earningsPromises = directReferrals.map(async (referral) => {
    try {
      const val = await referral.getDailyEarnings();
      return typeof val === 'number' ? val : 0;
    } catch (e) {
      return 0;
    }
  });

  const earningsArray = await Promise.all(earningsPromises);
  const totalReferralDailyEarnings = earningsArray.reduce((sum, v) => sum + v, 0);

  // Daily commission = Commission rate × Total referrals' daily earnings
  const dailyCommission = totalReferralDailyEarnings * commissionRate;

  return dailyCommission;
};

/**
 * Calculate daily indirect referral commission earnings
 * Based on recheck.txt: Indirect commission = % of indirect referral's daily earnings
 * @param {Array} indirectReferrals - Array of indirect referral users (referrals of your referrals)
 * @returns {Number} Daily indirect commission earnings
 */
userSchema.methods.calculateDailyIndirectReferralCommission = async function(indirectReferrals = []) {
  const indirectCommissionRate = this.indirectCommissionRate; // Indirect commission rate based on referral level

  if (indirectCommissionRate === 0) return 0; // Level 1 gets no commission

  // Sum of all indirect referrals' daily earnings (handle async getDailyEarnings)
  const earningsPromises = indirectReferrals.map(async (referral) => {
    try {
      const val = await referral.getDailyEarnings();
      return typeof val === 'number' ? val : 0;
    } catch (e) {
      return 0;
    }
  });

  const earningsArray = await Promise.all(earningsPromises);
  const totalIndirectReferralDailyEarnings = earningsArray.reduce((sum, v) => sum + v, 0);

  // Daily indirect commission = Indirect commission rate × Total indirect referrals' daily earnings
  const dailyIndirectCommission = totalIndirectReferralDailyEarnings * indirectCommissionRate;

  return dailyIndirectCommission;
};

/**
 * Calculate real-time referral commission earnings based on elapsed time
 * Uses timeline-based calculation matching referral's actual earnings
 * @returns {Object} { pendingCommission, pendingIndirectCommission, dailyCommissionRate, etc. }
 */
userSchema.methods.calculateRealTimeReferralCommission = async function() {
  const SECONDS_PER_DAY = 86400;
  const now = new Date();
  const myCommissionRate = this.getCommissionRate(); // Your 15% commission rate
  
  if (myCommissionRate === 0) {
    return {
      pendingCommission: 0,
      pendingIndirectCommission: 0,
      elapsedSeconds: 0,
      dailyCommissionRate: 0,
      dailyIndirectCommissionRate: 0,
      commissionRate: 0,
      indirectCommissionRate: this.indirectCommissionRate,
      referralCount: 0,
      indirectReferralCount: 0
    };
  }
  
  // Get direct referrals
  const User = this.constructor;
  const directReferrals = await User.find({ referredBy: this._id, isActive: true })
    .select('_id walletBalance totalDeposit currentLevel');
  
  if (directReferrals.length === 0) {
    return {
      pendingCommission: 0,
      pendingIndirectCommission: 0,
      elapsedSeconds: 0,
      dailyCommissionRate: 0,
      dailyIndirectCommissionRate: 0,
      commissionRate: myCommissionRate,
      indirectCommissionRate: this.indirectCommissionRate,
      referralCount: 0,
      indirectReferralCount: 0
    };
  }
  
  // Helper function to get earning rate based on total deposits
  const getEarningRate = (totalDeposits) => {
    if (totalDeposits >= 10000) return 0.05;
    if (totalDeposits >= 5000) return 0.045;
    if (totalDeposits >= 3500) return 0.04;
    if (totalDeposits >= 2000) return 0.035;
    if (totalDeposits >= 1000) return 0.03;
    if (totalDeposits >= 300) return 0.025;
    if (totalDeposits >= 50) return 0.02;
    if (totalDeposits >= 15) return 0.02;
    return 0;
  };
  
  // Calculate lifetime commission from ALL referrals using timeline-based method
  const Transaction = require('./Transaction');
  let totalLifetimeCommission = 0;
  let totalCurrentDailyCommission = 0;
  
  for (const referral of directReferrals) {
    // Get referral's transaction timeline
    const referralTransactions = await Transaction.find({
      userId: referral._id,
      type: { $in: ['DEPOSIT', 'PROMOTIONAL_BONUS', 'MILESTONE_BONUS'] },
      status: 'COMPLETED'
    }).select('type amount createdAt').sort({ createdAt: 1 });
    
    if (referralTransactions.length > 0) {
      let refBalance = 0;
      let refTotalDeposits = 0;
      let refCurrentRate = 0;
      
      for (let i = 0; i < referralTransactions.length; i++) {
        const event = referralTransactions[i];
        const nextEvent = referralTransactions[i + 1];
        const eventTime = new Date(event.createdAt);
        const nextTime = nextEvent ? new Date(nextEvent.createdAt) : now;
        
        // Update their balance and rate
        if (event.type === 'DEPOSIT') {
          refTotalDeposits += event.amount;
          refCurrentRate = getEarningRate(refTotalDeposits);
        }
        refBalance += event.amount;
        
        // Calculate earnings between events
        const periodSeconds = Math.floor((nextTime - eventTime) / 1000);
        
        if (periodSeconds > 0 && refBalance > 0 && refCurrentRate > 0) {
          const refRatePerSecond = refCurrentRate / SECONDS_PER_DAY;
          
          // Their compound earnings in this period
          const compoundFactor = Math.pow(1 + refRatePerSecond, periodSeconds);
          const refPeriodEarnings = refBalance * (compoundFactor - 1);
          
          // Your 15% commission on their earnings
          const myCommissionThisPeriod = refPeriodEarnings * myCommissionRate;
          totalLifetimeCommission += myCommissionThisPeriod;
          
          // Add their earnings to their balance for next period
          refBalance += refPeriodEarnings;
        }
      }
      
      // Calculate current daily commission from this referral
      if (refBalance > 0 && refCurrentRate > 0) {
        const refDailyEarnings = refBalance * refCurrentRate;
        const myDailyCommissionFromThisRef = refDailyEarnings * myCommissionRate;
        totalCurrentDailyCommission += myDailyCommissionFromThisRef;
      }
    }
  }
  
  // Get indirect referrals for stats
  const directReferralIds = directReferrals.map(ref => ref._id);
  const indirectReferrals = await User.find({ 
    referredBy: { $in: directReferralIds }, 
    isActive: true 
  }).select('_id');
  
  return {
    pendingCommission: totalLifetimeCommission, // Total lifetime commission calculated from timeline
    pendingIndirectCommission: 0, // Not implemented yet
    elapsedSeconds: 0,
    dailyCommissionRate: totalCurrentDailyCommission, // Current daily commission rate
    dailyIndirectCommissionRate: 0,
    totalReferralDailyEarnings: 0,
    totalIndirectReferralDailyEarnings: 0,
    commissionRate: myCommissionRate,
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

// Fix all users' referral levels by syncing with actual database counts
userSchema.statics.fixAllReferralLevels = async function() {
  const users = await this.find({ isActive: true });
  let updatedCount = 0;
  
  for (const user of users) {
    const oldLevel = user.referralLevel || 1;
    await user.syncReferralData();
    await user.save();
    
    if (user.referralLevel !== oldLevel) {
      console.log(`Updated ${user.name} (${user.email}): Level ${oldLevel} → ${user.referralLevel} (${user.directReferrals} referrals)`);
      updatedCount++;
    }
  }
  
  console.log(`Fixed ${updatedCount} users' referral levels`);
  return updatedCount;
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