const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    address: {
        type: String,
        required: true
    },
    walletAddress: {
        type: String,
        required: false
    },
    network: {
        type: String,
        required: true,
        enum: ['ethereum', 'bsc', 'polygon', 'tron'],
        default: 'tron'
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    expectedAmount: {
        type: Number,
        required: true,
        min: 0
    },
    actualAmount: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        required: true,
        enum: ['PENDING', 'PENDING_CONFIRMATIONS', 'CONFIRMED', 'FAILED', 'EXPIRED', 'CANCELLED'],
        default: 'PENDING'
    },
    transactionHash: {
        type: String,
        default: null
    },
    sweepTransactionHash: {
        type: String,
        default: null
    },
    fromAddress: {
        type: String,
        default: null
    },
    blockNumber: {
        type: Number,
        default: null
    },
    confirmations: {
        type: Number,
        default: 0
    },
    requiredConfirmations: {
        type: Number,
        default: 15
    },
    addressIndex: {
        type: Number,
        required: true
    },
    derivationPath: {
        type: String,
        required: true
    },
    publicKey: {
        type: String,
        required: true
    },
    isHDWallet: {
        type: Boolean,
        default: true
    },
    privateKeySeed: {
        type: String,
        default: null
    },
    ownerWallet: {
        type: String,
        default: 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu'
    },
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    },
    processedAt: {
        type: Date,
        default: null
    },
    lastCheckedAt: {
        type: Date,
        default: Date.now
    },
    metadata: {
        usdtContract: String,
        networkDetails: {
            name: String,
            symbol: String,
            chainId: Number,
            rpcUrl: String
        },
        gasUsed: Number,
        gasPrice: String,
        fees: {
            network: Number,
            usd: Number
        }
    },
    notes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
depositSchema.index({ userId: 1, status: 1 });
depositSchema.index({ address: 1 });
depositSchema.index({ transactionHash: 1 });
depositSchema.index({ status: 1, lastCheckedAt: 1 });
depositSchema.index({ expiresAt: 1 });

// Pre-save middleware to handle status changes
depositSchema.pre('save', function(next) {
    if (this.isModified('status') && this.status === 'CONFIRMED' && !this.processedAt) {
        this.processedAt = new Date();
    }
    next();
});

// Methods
depositSchema.methods.isExpired = function() {
    return new Date() > this.expiresAt;
};

depositSchema.methods.isConfirmed = function() {
    return this.confirmations >= this.requiredConfirmations;
};

depositSchema.methods.updateConfirmations = function(confirmations) {
    this.confirmations = confirmations;
    this.lastCheckedAt = new Date();
    
    if (this.isConfirmed() && this.status === 'PENDING_CONFIRMATIONS') {
        this.status = 'CONFIRMED';
        this.processedAt = new Date();
    }
};

// Static methods
depositSchema.statics.findPendingDeposits = function() {
    return this.find({
        status: { $in: ['PENDING', 'PENDING_CONFIRMATIONS'] },
        expiresAt: { $gt: new Date() }
    }).populate('userId', 'email username');
};

depositSchema.statics.findExpiredDeposits = function() {
    return this.find({
        status: { $in: ['PENDING', 'PENDING_CONFIRMATIONS'] },
        expiresAt: { $lte: new Date() }
    });
};

depositSchema.statics.getUserDeposits = function(userId, limit = 50) {
    return this.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'email username');
};

const Deposit = mongoose.model('Deposit', depositSchema);

module.exports = Deposit;