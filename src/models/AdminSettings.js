const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

/**
 * Admin Settings Schema
 * Stores configurable admin settings in MongoDB
 */
const adminSettingsSchema = new mongoose.Schema({
    // Main wallet configuration
    mainWalletAddress: {
        type: String,
        required: true,
        default: 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu',
        validate: {
            validator: function(v) {
                // Basic Tron address validation
                return v && typeof v === 'string' && v.startsWith('T') && v.length === 34;
            },
            message: 'Invalid Tron wallet address format'
        }
    },
    
    // Admin credentials
    adminEmail: {
        type: String,
        required: true,
        lowercase: true,
        validate: {
            validator: function(v) {
                return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
            },
            message: 'Invalid email format'
        }
    },
    
    adminPasswordHash: {
        type: String,
        required: true
    },
    
    // HD Wallet configuration
    hdWalletSeed: {
        type: String,
        default: 'redstone-hd-seed',
        required: true
    },
    
    // Security settings
    jwtSecret: {
        type: String,
        required: true,
        default: 'your_super_secret_jwt_key_here_make_it_very_long_and_secure_redstone_2023'
    },
    
    jwtRefreshSecret: {
        type: String,
        required: true,
        default: 'your_refresh_secret_key_redstone_refresh_2023'
    },
    
    // API configuration
    tronApiKey: {
        type: String,
        default: ''
    },
    
    ethScanApiKey: {
        type: String,
        default: ''
    },
    
    // System settings
    enableDepositMonitoring: {
        type: Boolean,
        default: true
    },
    
    autoConfirmDeposits: {
        type: Boolean,
        default: false
    },
    
    requireManualWithdrawalApproval: {
        type: Boolean,
        default: true
    },
    
    maxDailyWithdrawalUSD: {
        type: Number,
        default: 10000
    },
    
    // Email configuration
    smtpHost: {
        type: String,
        default: 'smtp.gmail.com'
    },
    
    smtpPort: {
        type: Number,
        default: 587
    },
    
    smtpUser: {
        type: String,
        default: 'redstoneauth@gmail.com'
    },
    
    smtpPassword: {
        type: String,
        default: ''
    },
    
    // Backup and security
    lastBackupDate: {
        type: Date,
        default: null
    },
    
    securityAuditDate: {
        type: Date,
        default: null
    },
    
    // Metadata
    lastUpdatedBy: {
        type: String,
        required: true
    },
    
    lastUpdatedAt: {
        type: Date,
        default: Date.now
    },
    
    version: {
        type: Number,
        default: 1
    }
}, {
    timestamps: true,
    collection: 'admin_settings'
});

// Pre-save middleware to hash password if changed
adminSettingsSchema.pre('save', async function(next) {
    // Only hash password if it was modified and is not already hashed
    if (this.isModified('adminPasswordHash') && !this.adminPasswordHash.startsWith('$2b$')) {
        try {
            const saltRounds = 12;
            this.adminPasswordHash = await bcrypt.hash(this.adminPasswordHash, saltRounds);
        } catch (error) {
            return next(error);
        }
    }
    
    this.lastUpdatedAt = new Date();
    this.version += 1;
    next();
});

// Method to verify admin password
adminSettingsSchema.methods.verifyPassword = async function(password) {
    try {
        return await bcrypt.compare(password, this.adminPasswordHash);
    } catch (error) {
        return false;
    }
};

// Static method to get current settings (singleton pattern)
adminSettingsSchema.statics.getCurrentSettings = async function() {
    let settings = await this.findOne().sort({ createdAt: -1 });
    
    if (!settings) {
        // Create default settings if none exist
        settings = new this({
            adminEmail: process.env.ADMIN_EMAIL || 'admin@redstone.com',
            adminPasswordHash: process.env.ADMIN_PASSWORD || 'super_secure_admin_password',
            lastUpdatedBy: 'system'
        });
        await settings.save();
    }
    
    return settings;
};

// Static method to update settings safely
adminSettingsSchema.statics.updateSettings = async function(updates, updatedBy) {
    const currentSettings = await this.getCurrentSettings();
    
    // Apply updates
    Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined && currentSettings.schema.paths[key]) {
            currentSettings[key] = updates[key];
        }
    });
    
    currentSettings.lastUpdatedBy = updatedBy;
    await currentSettings.save();
    
    return currentSettings;
};

// Method to export safe settings (without sensitive data)
adminSettingsSchema.methods.toSafeObject = function() {
    const settings = this.toObject();
    
    // Remove sensitive fields
    delete settings.adminPasswordHash;
    delete settings.jwtSecret;
    delete settings.jwtRefreshSecret;
    delete settings.smtpPassword;
    delete settings.hdWalletSeed;
    
    return settings;
};

const AdminSettings = mongoose.model('AdminSettings', adminSettingsSchema);

module.exports = AdminSettings;