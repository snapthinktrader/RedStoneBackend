const mongoose = require('mongoose');

/**
 * SystemWallet Schema
 * Stores the single system-wide reusable wallet used for all user deposits
 * Rotates after 40 deposits
 */
const systemWalletSchema = new mongoose.Schema({
    address: {
        type: String,
        required: true,
        unique: true
    },
    privateKey: {
        type: String,
        required: true,
        select: false // Don't include in queries by default for security
    },
    depositCount: {
        type: Number,
        default: 0,
        min: 0
    },
    totalReceived: {
        type: Number,
        default: 0,
        min: 0
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'ROTATING', 'RETIRED'],
        default: 'ACTIVE'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastUsedAt: {
        type: Date,
        default: Date.now
    },
    rotatedAt: {
        type: Date,
        default: null
    },
    metadata: {
        network: {
            type: String,
            default: 'tron'
        },
        rotationReason: String,
        finalUsdtBalance: Number,
        finalTrxBalance: Number,
        sweepTxHash: String,
        trxRecoveryTxHash: String
    }
}, {
    timestamps: true
});

// Index for efficient queries
systemWalletSchema.index({ status: 1 });
systemWalletSchema.index({ createdAt: -1 });

// Static method to get the current active wallet
systemWalletSchema.statics.getActiveWallet = async function() {
    return await this.findOne({ status: 'ACTIVE' }).select('+privateKey');
};

// Static method to check if rotation is needed
systemWalletSchema.statics.needsRotation = async function() {
    const wallet = await this.findOne({ status: 'ACTIVE' });
    if (!wallet) return false;
    return wallet.depositCount >= 40;
};

// Method to increment deposit count
systemWalletSchema.methods.incrementDeposit = async function(amount) {
    this.depositCount += 1;
    this.totalReceived += amount;
    this.lastUsedAt = new Date();
    await this.save();
};

// Method to mark as retired
systemWalletSchema.methods.retire = async function(finalBalances) {
    this.status = 'RETIRED';
    this.rotatedAt = new Date();
    if (finalBalances) {
        this.metadata.finalUsdtBalance = finalBalances.usdt;
        this.metadata.finalTrxBalance = finalBalances.trx;
        this.metadata.sweepTxHash = finalBalances.sweepTxHash;
        this.metadata.trxRecoveryTxHash = finalBalances.trxRecoveryTxHash;
    }
    await this.save();
};

const SystemWallet = mongoose.model('SystemWallet', systemWalletSchema);

module.exports = SystemWallet;
