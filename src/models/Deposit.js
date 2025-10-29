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
    // Reusable wallet tracking
    isReusableWallet: {
        type: Boolean,
        default: false
    },
    walletDepositNumber: {
        type: Number,
        default: null // Which deposit number this is for the reusable wallet (1-40)
    },
    // Enhanced Auto-Sweep Fields
    walletPrivateKey: {
        type: String,
        default: null // Encrypted storage of the deposit wallet private key
    },
    // Emergency recovery field - stores encrypted private key with different method
    emergencyPrivateKey: {
        type: String,
        default: null // Double-encrypted for emergency access
    },
    // Raw wallet details for emergency recovery
    walletBackup: {
        address: String,
        publicKey: String,
        derivationPath: String,
        createdAt: { type: Date, default: Date.now }
    },
    gasFeesCalculated: {
        type: Number,
        default: 0 // TRX amount needed for USDT sweep
    },
    gasFeesSent: {
        type: Number,
        default: 0 // Actual TRX sent from fuel wallet
    },
    gasTxHash: {
        type: String,
        default: null // Transaction hash of TRX transfer from fuel wallet
    },
    sweepStatus: {
        type: String,
        enum: ['NONE', 'GAS_CALCULATING', 'GAS_SENDING', 'GAS_SENT', 'SWEEPING', 'SWEPT', 'FAILED'],
        default: 'NONE'
    },
    sweepAttempts: {
        type: Number,
        default: 0
    },
    lastSweepAttempt: {
        type: Date,
        default: null
    },
    sweepError: {
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
    },
    
    // Balance processing
    balanceUpdated: {
        type: Boolean,
        default: false
    },
    
    // Auto-sweep related fields
    autoSweepProcessed: {
        type: Boolean,
        default: false
    },
    autoSweepProcessedAt: {
        type: Date,
        default: null
    },
    autoSweepType: {
        type: String,
        default: null
    },
    autoSweepAttempts: {
        type: Number,
        default: 0
    },
    lastAutoSweepAttempt: {
        type: Date,
        default: null
    },
    lastAutoSweepError: {
        type: String,
        default: null
    },
    gasTxid: {
        type: String,
        default: null
    },
    sweepTxid: {
        type: String,
        default: null
    },
    sweptAmount: {
        type: Number,
        default: null
    },
    sweptAt: {
        type: Date,
        default: null
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
depositSchema.pre('save', async function(next) {
    if (this.isModified('status') && this.status === 'CONFIRMED' && !this.processedAt) {
        this.processedAt = new Date();
    }
    next();
});

// Post-save middleware to update user balance when deposit is confirmed
depositSchema.post('save', async function(doc) {
    // Only process if status changed to CONFIRMED and balance not yet updated
    if (doc.status === 'CONFIRMED' && !doc.balanceUpdated) {
        try {
            const User = mongoose.model('User');
            const Transaction = mongoose.model('Transaction');
            
            const user = await User.findById(doc.userId);
            if (!user) {
                console.log(`⚠️  User not found for deposit ${doc._id}`);
                return;
            }
            
            console.log(`\n💰 Processing confirmed deposit ${doc._id} for user ${user.email}`);
            
            // Red Stone investment levels and commission rates
            const levels = [
                { level: 1, required: 50, directRate: 0.40, indirectRate: 0.07 },
                { level: 2, required: 300, directRate: 0.40, indirectRate: 0.07 },
                { level: 3, required: 1000, directRate: 0.50, indirectRate: 0.09 },
                { level: 4, required: 2000, directRate: 0.60, indirectRate: 0.11 },
                { level: 5, required: 3000, directRate: 0.65, indirectRate: 0.12 },
                { level: 6, required: 5000, directRate: 0.70, indirectRate: 0.13 },
                { level: 7, required: 10000, directRate: 0.80, indirectRate: 0.15 },
                { level: 8, required: 35000, directRate: 0.90, indirectRate: 0.20 }
            ];
            
            // 1. Update user's total deposit AND wallet balance
            const oldTotal = user.totalDeposit || 0;
            user.totalDeposit = oldTotal + doc.amount;
            
            // Add deposit to wallet balance (this will earn 2% daily)
            user.walletBalance = (user.walletBalance || 0) + doc.amount;
            
            // Set lastEarningUpdate to now if this is the first deposit
            if (!user.lastEarningUpdate) {
                user.lastEarningUpdate = new Date();
                console.log(`   Starting earnings timer from now`);
            }
            
            console.log(`   Total Deposit: $${oldTotal} → $${user.totalDeposit}`);
            console.log(`   Wallet Balance: $${user.walletBalance.toFixed(2)}`);
            
            // 1.5. Update reusable wallet deposit count if applicable
            if (doc.isReusableWallet && user.currentDepositWallet?.address === doc.address) {
                const ReusableWalletService = require('../services/reusableWalletService');
                const reusableWalletService = new ReusableWalletService();
                
                try {
                    await reusableWalletService.incrementDepositCount(doc.userId, doc.amount);
                    console.log(`   ✅ Reusable wallet deposit count updated`);
                } catch (walletError) {
                    console.error(`   ⚠️ Error updating wallet count:`, walletError);
                }
            }
            
            // 2. Update user level
            let newLevel = 1;
            for (const lvl of [...levels].reverse()) {
                if (user.totalDeposit >= lvl.required) {
                    newLevel = lvl.level;
                    break;
                }
            }
            
            if (user.currentLevel !== newLevel) {
                console.log(`   Level: ${user.currentLevel || 1} → ${newLevel}`);
                user.currentLevel = newLevel;
            }
            
            await user.save();
            
            // 3. Process referral commissions
            if (user.referredBy) {
                const referrer = await User.findById(user.referredBy);
                if (referrer) {
                    const referrerLevel = levels.find(l => l.level === (referrer.currentLevel || 1));
                    const directCommission = doc.amount * referrerLevel.directRate;
                    
                    referrer.walletBalance = (referrer.walletBalance || 0) + directCommission;
                    referrer.totalEarnings = (referrer.totalEarnings || 0) + directCommission;
                    referrer.referralEarnings = (referrer.referralEarnings || 0) + directCommission;
                    
                    // Start earnings timer if first commission
                    if (!referrer.lastEarningUpdate) {
                        referrer.lastEarningUpdate = new Date();
                    }
                    
                    // Update milestone tracking for referrer based on deposit amount
                    referrer.updateMilestoneTracking(doc.amount);
                    
                    await referrer.save();
                    
                    console.log(`   Direct commission: $${directCommission.toFixed(2)} to ${referrer.email}`);
                    
                    await Transaction.create({
                        userId: referrer._id,
                        type: 'REFERRAL_COMMISSION',
                        subType: 'DIRECT',
                        amount: directCommission,
                        status: 'COMPLETED',
                        description: `Direct referral commission from ${user.email || user.username}'s $${doc.amount} deposit`,
                        relatedDeposit: doc._id
                    });
                    
                    // Process indirect commission
                    if (referrer.referredBy) {
                        const indirectReferrer = await User.findById(referrer.referredBy);
                        if (indirectReferrer) {
                            const indirectLevel = levels.find(l => l.level === (indirectReferrer.currentLevel || 1));
                            const indirectCommission = doc.amount * indirectLevel.indirectRate;
                            
                            indirectReferrer.walletBalance = (indirectReferrer.walletBalance || 0) + indirectCommission;
                            indirectReferrer.totalEarnings = (indirectReferrer.totalEarnings || 0) + indirectCommission;
                            indirectReferrer.referralEarnings = (indirectReferrer.referralEarnings || 0) + indirectCommission;
                            await indirectReferrer.save();
                            
                            console.log(`   Indirect commission: $${indirectCommission.toFixed(2)} to ${indirectReferrer.email}`);
                            
                            await Transaction.create({
                                userId: indirectReferrer._id,
                                type: 'REFERRAL_COMMISSION',
                                subType: 'INDIRECT',
                                amount: indirectCommission,
                                status: 'COMPLETED',
                                description: `Indirect referral commission from ${user.email || user.username}'s $${doc.amount} deposit`,
                                relatedDeposit: doc._id
                            });
                        }
                    }
                    
                    // Check for recruitment bonus
                    const Referral = mongoose.model('Referral');
                    const referralCount = await Referral.countDocuments({ referrerId: referrer._id });
                    
                    const bonusTiers = [
                        { count: 1000, bonus: 25000 },
                        { count: 500, bonus: 5000 },
                        { count: 100, bonus: 1000 },
                        { count: 50, bonus: 750 },
                        { count: 25, bonus: 250 },
                        { count: 15, bonus: 150 },
                        { count: 10, bonus: 100 },
                        { count: 3, bonus: 50 }
                    ];
                    
                    const achievedTier = bonusTiers.find(tier => referralCount >= tier.count);
                    const paidTier = referrer.recruitmentBonusPaid || 0;
                    
                    if (achievedTier && achievedTier.count > paidTier) {
                        referrer.walletBalance = (referrer.walletBalance || 0) + achievedTier.bonus;
                        referrer.totalEarnings = (referrer.totalEarnings || 0) + achievedTier.bonus;
                        referrer.recruitmentBonusPaid = achievedTier.count;
                        await referrer.save();
                        
                        console.log(`   🎉 Recruitment bonus: $${achievedTier.bonus} for ${referralCount} referrals`);
                        
                        await Transaction.create({
                            userId: referrer._id,
                            type: 'RECRUITMENT_BONUS',
                            amount: achievedTier.bonus,
                            status: 'COMPLETED',
                            description: `Recruitment bonus for ${referralCount} referrals`
                        });
                    }
                }
            }
            
            // Mark as processed
            await mongoose.model('Deposit').updateOne(
                { _id: doc._id },
                { $set: { balanceUpdated: true } }
            );
            
            console.log(`✅ Deposit ${doc._id} processing completed\n`);
            
        } catch (error) {
            console.error(`❌ Error processing deposit ${doc._id}:`, error.message);
        }
    }
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