const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    toAddress: {
        type: String,
        required: true,
        lowercase: true
    },
    fromAddress: {
        type: String,
        default: null,
        lowercase: true
    },
    network: {
        type: String,
        required: true,
        enum: ['ethereum', 'bsc', 'polygon', 'tron'],
        default: 'bsc'
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    actualAmount: {
        type: Number,
        default: null // Amount after fees
    },
    status: {
        type: String,
        required: true,
        enum: [
            'PENDING_APPROVAL',
            'APPROVED', 
            'PROCESSING',
            'SIGNED',
            'BROADCASTED',
            'CONFIRMED',
            'FAILED',
            'REJECTED'
        ],
        default: 'PENDING_APPROVAL'
    },
    transactionHash: {
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
    fees: {
        gasLimit: {
            type: Number,
            default: 65000
        },
        gasPrice: {
            type: String,
            default: '5000000000' // 5 gwei
        },
        estimatedFeeETH: {
            type: String,
            default: '0'
        },
        actualFeeETH: {
            type: String,
            default: null
        },
        network: {
            type: Number,
            default: 0
        },
        usd: {
            type: Number,
            default: 0
        }
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },
    processedAt: {
        type: Date,
        default: null
    },
    broadcastedAt: {
        type: Date,
        default: null
    },
    confirmedAt: {
        type: Date,
        default: null
    },
    rejectedAt: {
        type: Date,
        default: null
    },
    rejectionReason: {
        type: String,
        default: null
    },
    unsignedTransaction: {
        to: String,
        from: String,
        data: String,
        value: String,
        gasLimit: String,
        gasPrice: String,
        nonce: Number,
        chainId: Number
    },
    signedTransaction: {
        type: String,
        default: null
    },
    metadata: {
        usdtContract: String,
        networkDetails: {
            name: String,
            symbol: String,
            chainId: Number,
            rpcUrl: String
        },
        userBalance: Number,
        requestIP: String,
        userAgent: String
    },
    adminNotes: {
        type: String,
        default: ''
    },
    userNotes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
withdrawalSchema.index({ userId: 1, status: 1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });
withdrawalSchema.index({ transactionHash: 1 });
withdrawalSchema.index({ approvedBy: 1 });
withdrawalSchema.index({ toAddress: 1 });

// Pre-save middleware to handle status changes
withdrawalSchema.pre('save', async function(next) {
    const now = new Date();
    
    if (this.isModified('status')) {
        switch (this.status) {
            case 'APPROVED':
                if (!this.approvedAt) this.approvedAt = now;
                break;
            case 'PROCESSING':
                if (!this.processedAt) this.processedAt = now;
                break;
            case 'BROADCASTED':
                if (!this.broadcastedAt) this.broadcastedAt = now;
                break;
            case 'CONFIRMED':
                if (!this.confirmedAt) this.confirmedAt = now;
                
                // Update user's withdrawal tracking
                try {
                    const User = mongoose.model('User');
                    await User.findByIdAndUpdate(this.userId, {
                        $inc: { 
                            withdrawalCount: 1,
                            totalWithdrawn: this.amount
                        },
                        lastSuccessfulWithdrawal: now
                    });
                } catch (error) {
                    console.error('Error updating user withdrawal stats:', error);
                }
                break;
            case 'REJECTED':
                if (!this.rejectedAt) this.rejectedAt = now;
                break;
        }
    }
    
    next();
});

// Methods
withdrawalSchema.methods.isConfirmed = function() {
    return this.confirmations >= this.requiredConfirmations;
};

withdrawalSchema.methods.canBeApproved = function() {
    return this.status === 'PENDING_APPROVAL';
};

withdrawalSchema.methods.canBeRejected = function() {
    return ['PENDING_APPROVAL', 'APPROVED'].includes(this.status);
};

withdrawalSchema.methods.calculateNetAmount = function() {
    return this.amount - (this.fees.usd || 0);
};

withdrawalSchema.methods.updateConfirmations = function(confirmations) {
    this.confirmations = confirmations;
    
    if (this.isConfirmed() && this.status === 'BROADCASTED') {
        this.status = 'CONFIRMED';
        this.confirmedAt = new Date();
    }
};

// Static methods
withdrawalSchema.statics.findPendingApprovals = function() {
    return this.find({ status: 'PENDING_APPROVAL' })
        .sort({ createdAt: 1 })
        .populate('userId', 'email username walletBalance');
};

withdrawalSchema.statics.findApprovedWithdrawals = function() {
    return this.find({ status: 'APPROVED' })
        .sort({ approvedAt: 1 })
        .populate('userId', 'email username')
        .populate('approvedBy', 'email username');
};

withdrawalSchema.statics.findProcessingWithdrawals = function() {
    return this.find({ 
        status: { $in: ['PROCESSING', 'SIGNED', 'BROADCASTED'] }
    })
        .sort({ processedAt: 1 })
        .populate('userId', 'email username');
};

withdrawalSchema.statics.getUserWithdrawals = function(userId, limit = 50) {
    return this.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('approvedBy', 'email username');
};

withdrawalSchema.statics.getAdminWithdrawals = function(status = null, limit = 100) {
    const query = status ? { status } : {};
    return this.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'email username walletBalance')
        .populate('approvedBy', 'email username');
};

// Virtual for total processing time
withdrawalSchema.virtual('processingTime').get(function() {
    if (this.confirmedAt && this.createdAt) {
        return this.confirmedAt - this.createdAt;
    }
    return null;
});

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

module.exports = Withdrawal;