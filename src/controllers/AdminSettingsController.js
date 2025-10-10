const AdminSettings = require('../models/AdminSettings');
const FundSweepService = require('../services/FundSweepService');
const bcrypt = require('bcrypt');

/**
 * Admin Settings Controller
 * Handles admin panel configuration and settings management
 */
class AdminSettingsController {
    
    /**
     * Get current admin settings
     */
    static async getSettings(req, res) {
        try {
            const settings = await AdminSettings.getCurrentSettings();
            
            res.status(200).json({
                success: true,
                message: 'Admin settings retrieved successfully',
                data: settings.toSafeObject()
            });
            
        } catch (error) {
            console.error('Get admin settings error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve admin settings',
                error: error.message
            });
        }
    }
    
    /**
     * Update main wallet address
     */
    static async updateMainWallet(req, res) {
        try {
            const { newWalletAddress, confirmPassword } = req.body;
            
            if (!newWalletAddress) {
                return res.status(400).json({
                    success: false,
                    message: 'New wallet address is required'
                });
            }
            
            // Validate Tron address format
            if (!newWalletAddress.startsWith('T') || newWalletAddress.length !== 34) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid Tron wallet address format'
                });
            }
            
            // Verify admin password for security
            if (!confirmPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Password confirmation required for wallet change'
                });
            }
            
            const currentSettings = await AdminSettings.getCurrentSettings();
            const isPasswordValid = await currentSettings.verifyPassword(confirmPassword);
            
            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid password confirmation'
                });
            }
            
            // Update the main wallet address
            const updatedSettings = await AdminSettings.updateSettings({
                mainWalletAddress: newWalletAddress
            }, req.user?.email || 'admin');
            
            // Update FundSweepService with new wallet address
            const sweepService = new FundSweepService();
            sweepService.ownerWallet = newWalletAddress;
            
            console.log(`✅ Main wallet updated to: ${newWalletAddress}`);
            
            res.status(200).json({
                success: true,
                message: 'Main wallet address updated successfully',
                data: {
                    oldWallet: currentSettings.mainWalletAddress,
                    newWallet: newWalletAddress,
                    updatedAt: updatedSettings.lastUpdatedAt
                }
            });
            
        } catch (error) {
            console.error('Update main wallet error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update main wallet address',
                error: error.message
            });
        }
    }
    
    /**
     * Update admin credentials
     */
    static async updateAdminCredentials(req, res) {
        try {
            const { currentPassword, newEmail, newPassword } = req.body;
            
            if (!currentPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is required'
                });
            }
            
            const currentSettings = await AdminSettings.getCurrentSettings();
            const isPasswordValid = await currentSettings.verifyPassword(currentPassword);
            
            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }
            
            const updates = {};
            
            // Update email if provided
            if (newEmail && newEmail !== currentSettings.adminEmail) {
                // Validate email format
                const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
                if (!emailRegex.test(newEmail)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid email format'
                    });
                }
                updates.adminEmail = newEmail.toLowerCase();
            }
            
            // Update password if provided
            if (newPassword) {
                if (newPassword.length < 8) {
                    return res.status(400).json({
                        success: false,
                        message: 'New password must be at least 8 characters long'
                    });
                }
                updates.adminPasswordHash = newPassword; // Will be hashed by pre-save middleware
            }
            
            if (Object.keys(updates).length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No updates provided'
                });
            }
            
            const updatedSettings = await AdminSettings.updateSettings(
                updates, 
                req.user?.email || currentSettings.adminEmail
            );
            
            console.log(`✅ Admin credentials updated`);
            
            res.status(200).json({
                success: true,
                message: 'Admin credentials updated successfully',
                data: {
                    email: updatedSettings.adminEmail,
                    passwordChanged: !!newPassword,
                    updatedAt: updatedSettings.lastUpdatedAt
                }
            });
            
        } catch (error) {
            console.error('Update admin credentials error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update admin credentials',
                error: error.message
            });
        }
    }
    
    /**
     * Update system settings
     */
    static async updateSystemSettings(req, res) {
        try {
            const { 
                enableDepositMonitoring,
                autoConfirmDeposits,
                requireManualWithdrawalApproval,
                maxDailyWithdrawalUSD,
                tronApiKey,
                ethScanApiKey
            } = req.body;
            
            const updates = {};
            
            // Validate and add boolean settings
            if (typeof enableDepositMonitoring === 'boolean') {
                updates.enableDepositMonitoring = enableDepositMonitoring;
            }
            
            if (typeof autoConfirmDeposits === 'boolean') {
                updates.autoConfirmDeposits = autoConfirmDeposits;
            }
            
            if (typeof requireManualWithdrawalApproval === 'boolean') {
                updates.requireManualWithdrawalApproval = requireManualWithdrawalApproval;
            }
            
            // Validate numeric settings
            if (maxDailyWithdrawalUSD && typeof maxDailyWithdrawalUSD === 'number' && maxDailyWithdrawalUSD > 0) {
                updates.maxDailyWithdrawalUSD = maxDailyWithdrawalUSD;
            }
            
            // Update API keys if provided
            if (tronApiKey !== undefined) {
                updates.tronApiKey = tronApiKey;
            }
            
            if (ethScanApiKey !== undefined) {
                updates.ethScanApiKey = ethScanApiKey;
            }
            
            if (Object.keys(updates).length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No valid updates provided'
                });
            }
            
            const updatedSettings = await AdminSettings.updateSettings(
                updates, 
                req.user?.email || 'admin'
            );
            
            console.log(`✅ System settings updated`);
            
            res.status(200).json({
                success: true,
                message: 'System settings updated successfully',
                data: updatedSettings.toSafeObject()
            });
            
        } catch (error) {
            console.error('Update system settings error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update system settings',
                error: error.message
            });
        }
    }
    
    /**
     * Update email settings
     */
    static async updateEmailSettings(req, res) {
        try {
            const { smtpHost, smtpPort, smtpUser, smtpPassword } = req.body;
            
            const updates = {};
            
            if (smtpHost) updates.smtpHost = smtpHost;
            if (smtpPort && typeof smtpPort === 'number') updates.smtpPort = smtpPort;
            if (smtpUser) updates.smtpUser = smtpUser;
            if (smtpPassword) updates.smtpPassword = smtpPassword;
            
            if (Object.keys(updates).length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No email settings provided'
                });
            }
            
            const updatedSettings = await AdminSettings.updateSettings(
                updates, 
                req.user?.email || 'admin'
            );
            
            console.log(`✅ Email settings updated`);
            
            res.status(200).json({
                success: true,
                message: 'Email settings updated successfully',
                data: {
                    smtpHost: updatedSettings.smtpHost,
                    smtpPort: updatedSettings.smtpPort,
                    smtpUser: updatedSettings.smtpUser,
                    updatedAt: updatedSettings.lastUpdatedAt
                }
            });
            
        } catch (error) {
            console.error('Update email settings error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update email settings',
                error: error.message
            });
        }
    }
    
    /**
     * Test main wallet connection
     */
    static async testMainWallet(req, res) {
        try {
            const settings = await AdminSettings.getCurrentSettings();
            const walletAddress = settings.mainWalletAddress;
            
            // Use FundSweepService to test wallet
            const sweepService = new FundSweepService();
            const trxBalance = await sweepService.getTRXBalance(walletAddress);
            const usdtBalance = await sweepService.getUSDTBalance(walletAddress);
            
            res.status(200).json({
                success: true,
                message: 'Main wallet connection test completed',
                data: {
                    walletAddress,
                    trxBalance,
                    usdtBalance,
                    connectionStatus: 'connected',
                    lastChecked: new Date()
                }
            });
            
        } catch (error) {
            console.error('Test main wallet error:', error);
            res.status(500).json({
                success: false,
                message: 'Main wallet connection test failed',
                error: error.message,
                data: {
                    connectionStatus: 'failed',
                    lastChecked: new Date()
                }
            });
        }
    }
    
    /**
     * Get admin settings audit log
     */
    static async getAuditLog(req, res) {
        try {
            const { page = 1, limit = 20 } = req.query;
            
            // Get historical settings (all versions)
            const auditLog = await AdminSettings.find()
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .select('-adminPasswordHash -jwtSecret -jwtRefreshSecret -smtpPassword -hdWalletSeed');
            
            const total = await AdminSettings.countDocuments();
            
            res.status(200).json({
                success: true,
                message: 'Audit log retrieved successfully',
                data: {
                    auditLog,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        pages: Math.ceil(total / limit)
                    }
                }
            });
            
        } catch (error) {
            console.error('Get audit log error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve audit log',
                error: error.message
            });
        }
    }
    
    /**
     * Initialize default settings
     */
    static async initializeSettings(req, res) {
        try {
            const settings = await AdminSettings.getCurrentSettings();
            
            res.status(200).json({
                success: true,
                message: 'Settings initialized successfully',
                data: settings.toSafeObject()
            });
            
        } catch (error) {
            console.error('Initialize settings error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to initialize settings',
                error: error.message
            });
        }
    }
}

module.exports = AdminSettingsController;