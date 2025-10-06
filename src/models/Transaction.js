const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true,
  },
  type: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: {
      values: ['DEPOSIT', 'WITHDRAWAL', 'DAILY_EARNING', 'REFERRAL_COMMISSION', 'MILESTONE_BONUS'],
      message: '{VALUE} is not a valid transaction type'
    },
    index: true,
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative'],
  },
  status: {
    type: String,
    default: 'PENDING',
    enum: {
      values: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'],
      message: '{VALUE} is not a valid status'
    },
    index: true,
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
  },
  txHash: {
    type: String,
    trim: true,
    sparse: true, // Allow multiple null values but unique non-null values
    index: true,
  },
  walletAddress: {
    type: String,
    trim: true,
  },
  cryptocurrency: {
    type: String,
    uppercase: true,
    enum: {
      values: ['BTC', 'ETH', 'USDT', 'SOL', 'LTC', 'BNB', null],
      message: '{VALUE} is not a supported cryptocurrency'
    },
  },
  networkFee: {
    type: Number,
    min: [0, 'Network fee cannot be negative'],
    default: 0,
  },
  exchangeRate: {
    type: Number,
    min: [0, 'Exchange rate cannot be negative'],
    comment: 'Rate at time of transaction (crypto to USD)',
  },
  referenceId: {
    type: String,
    trim: true,
    index: true,
    comment: 'External payment gateway reference',
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
    comment: 'Additional transaction metadata',
  },
  processedAt: {
    type: Date,
    default: null,
  },
  expiresAt: {
    type: Date,
    default: null,
    index: true,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ referenceId: 1 }, { sparse: true });
transactionSchema.index({ txHash: 1 }, { unique: true, sparse: true });
transactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual fields
transactionSchema.virtual('typeDisplayName').get(function() {
  const typeNames = {
    'DEPOSIT': 'Deposit',
    'WITHDRAWAL': 'Withdrawal',
    'DAILY_EARNING': 'Daily Earnings',
    'REFERRAL_COMMISSION': 'Referral Bonus',
    'MILESTONE_BONUS': 'Milestone Bonus',
  };
  return typeNames[this.type] || this.type;
});

transactionSchema.virtual('statusDisplayName').get(function() {
  const statusNames = {
    'PENDING': 'Pending',
    'COMPLETED': 'Completed',
    'FAILED': 'Failed',
    'CANCELLED': 'Cancelled',
  };
  return statusNames[this.status] || this.status;
});

transactionSchema.virtual('isIncoming').get(function() {
  return ['DEPOSIT', 'DAILY_EARNING', 'REFERRAL_COMMISSION', 'MILESTONE_BONUS'].includes(this.type);
});

transactionSchema.virtual('formattedAmount').get(function() {
  const sign = this.isIncoming ? '+' : '-';
  return `${sign}$${this.amount.toFixed(2)}`;
});

transactionSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Pre-save middleware
transactionSchema.pre('save', function(next) {
  // Set withdrawal expiry to 24 hours from now if not set
  if (this.type === 'WITHDRAWAL' && !this.expiresAt && this.isNew) {
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  
  // Set processedAt when status changes to COMPLETED
  if (this.isModified('status') && this.status === 'COMPLETED' && !this.processedAt) {
    this.processedAt = new Date();
  }
  
  next();
});

// Instance methods
transactionSchema.methods.getFormattedAmount = function() {
  const isIncoming = ['DEPOSIT', 'DAILY_EARNING', 'REFERRAL_COMMISSION', 'MILESTONE_BONUS'].includes(this.type);
  const sign = isIncoming ? '+' : '-';
  return `${sign}$${this.amount.toFixed(2)}`;
};

transactionSchema.methods.getTypeDisplayName = function() {
  const typeNames = {
    'DEPOSIT': 'Deposit',
    'WITHDRAWAL': 'Withdrawal',
    'DAILY_EARNING': 'Daily Earnings',
    'REFERRAL_COMMISSION': 'Referral Bonus',
    'MILESTONE_BONUS': 'Milestone Bonus',
  };
  return typeNames[this.type] || this.type;
};

transactionSchema.methods.canCancel = function() {
  return this.status === 'PENDING' && !this.isExpired;
};

transactionSchema.methods.markAsCompleted = function() {
  this.status = 'COMPLETED';
  this.processedAt = new Date();
  return this.save();
};

transactionSchema.methods.markAsFailed = function(reason) {
  this.status = 'FAILED';
  this.metadata = { ...this.metadata, failureReason: reason };
  return this.save();
};

// Static methods
transactionSchema.statics.getTotalByType = async function(userId, type, status = 'COMPLETED') {
  const result = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        type: type,
        status: status
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' }
      }
    }
  ]);
  
  return result.length > 0 ? result[0].total : 0;
};

transactionSchema.statics.getUserTransactionStats = async function(userId) {
  const stats = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        status: 'COMPLETED'
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        total: { $sum: '$amount' }
      }
    }
  ]);

  return stats.reduce((acc, stat) => {
    acc[stat._id] = {
      count: stat.count,
      total: stat.total,
    };
    return acc;
  }, {});
};

transactionSchema.statics.getRecentTransactions = function(userId, limit = 10) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'name email');
};

transactionSchema.statics.getDailyEarningsTotal = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        type: 'DAILY_EARNING',
        status: 'COMPLETED',
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id': 1 }
    }
  ]);

  return result;
};

transactionSchema.statics.getPendingWithdrawals = function() {
  return this.find({
    type: 'WITHDRAWAL',
    status: 'PENDING',
    expiresAt: { $gt: new Date() }
  }).populate('userId', 'name email');
};

// Clean up expired transactions
transactionSchema.statics.cleanupExpiredTransactions = async function() {
  const result = await this.updateMany(
    {
      status: 'PENDING',
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { status: 'CANCELLED' }
    }
  );
  
  return result.modifiedCount;
};

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;