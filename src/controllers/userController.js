const { validationResult } = require('express-validator');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

class UserController {
  // Get user profile
  static async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Calculate real-time earnings from own deposits
      const earningsData = user.calculateRealTimeEarnings();
      
      // Calculate real-time referral commission earnings
      const referralCommissionData = await user.calculateRealTimeReferralCommission();

      // Total real-time earnings = own earnings + referral commissions
      const totalPendingEarnings = earningsData.pendingEarnings + referralCommissionData.pendingCommission;
      const totalCalculatedBalance = earningsData.calculatedBalance + referralCommissionData.pendingCommission;

      // Calculate next milestone for Flutter app
      const nextMilestone = UserController.getNextMilestone(user.directReferrals || 0);

      res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            referralCode: user.referralCode,
            walletBalance: totalCalculatedBalance, // Real-time balance including referral commissions
            storedBalance: user.walletBalance, // Original stored balance
            pendingEarnings: totalPendingEarnings, // Total earnings since last update (own + referral)
            pendingOwnEarnings: earningsData.pendingEarnings, // Own wallet earnings
            pendingReferralCommission: referralCommissionData.pendingCommission, // Referral commission earnings
            pendingIndirectCommission: referralCommissionData.pendingIndirectCommission || 0, // Indirect commission earnings
            dailyReferralCommission: referralCommissionData.dailyCommissionRate, // Daily referral commission rate
            dailyIndirectCommission: referralCommissionData.dailyIndirectCommissionRate || 0, // Daily indirect commission rate
            totalDeposit: user.totalDeposit,
            totalEarnings: user.totalEarnings || 0, // Total earnings from database
            directReferrals: user.directReferrals || 0,
            indirectReferrals: user.indirectReferrals || 0,
            // Milestone data for Flutter app
            nextBonusAmount: nextMilestone.bonus,
            nextBonusTarget: nextMilestone.target,
            // Dual-level system
            currentLevel: user.currentLevel, // Deposit-based level (1-8)
            referralLevel: user.referralLevel, // Referral-based level (1-9)
            levelName: user.levelName, // Deposit level name (Basic, Bronze, etc.)
            // Separate rates for dual-level system
            dailyEarningRate: user.dailyEarningRate, // Deposit-based daily earning rate
            commissionRate: user.commissionRate, // Referral-based direct commission rate
            indirectCommissionRate: user.indirectCommissionRate, // Referral-based indirect commission rate
            isVerified: user.isVerified,
            twoFactorEnabled: user.twoFactorEnabled,
            profilePicture: user.profilePicture,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
            lastEarningUpdate: earningsData.lastUpdate,
            // Add earning rate info for client-side calculation
            secondlyEarningRate: earningsData.ratePerSecond,
            // Referral commission details
            totalReferralDailyEarnings: referralCommissionData.totalReferralDailyEarnings || 0,
            totalIndirectReferralDailyEarnings: referralCommissionData.totalIndirectReferralDailyEarnings || 0,
            referralCount: referralCommissionData.referralCount || 0,
            indirectReferralCount: referralCommissionData.indirectReferralCount || 0,
          },
        },
      });

    } catch (error) {
      logger.error('Profile fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching profile data',
      });
    }
  }

  // Update user profile
  static async updateProfile(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { name, email } = req.body;
      const user = await User.findById(req.user.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Check if email is already taken by another user
      if (email && email !== user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Email is already taken',
          });
        }
        // If email is changed, mark as unverified
        user.isVerified = false;
        user.emailVerifiedAt = null;
      }

      // Update fields
      if (name) user.name = name;
      if (email) user.email = email;

      await user.save();

      logger.info(`Profile updated for user: ${user.email}`);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            isVerified: user.isVerified,
          },
        },
      });

    } catch (error) {
      logger.error('Profile update error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating profile',
      });
    }
  }

  // Get user dashboard data
  static async getDashboard(req, res) {
    try {
      const user = await User.findById(req.user.userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Calculate real-time earnings
      const earningsData = user.calculateRealTimeEarnings();

      // Get referral statistics
      const directReferrals = await User.countDocuments({
        referredBy: req.user.userId,
        isActive: true,
      });

      const indirectReferrals = await User.aggregate([
        {
          $match: { referredBy: user._id, isActive: true }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: 'referredBy',
            as: 'indirectReferrals'
          }
        },
        {
          $project: {
            indirectCount: { $size: '$indirectReferrals' }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$indirectCount' }
          }
        }
      ]);

      const totalIndirectReferrals = indirectReferrals.length > 0 ? indirectReferrals[0].total : 0;

      // Get recent transactions - Only show DEPOSIT, WITHDRAWAL, and MILESTONE_BONUS
      // Daily earnings and referral commissions are calculated per-second, not as discrete transactions
      const recentTransactions = await Transaction.find({ 
        userId: user._id,
        type: { $in: ['DEPOSIT', 'WITHDRAWAL', 'MILESTONE_BONUS'] }
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('type amount status createdAt description');

      // Calculate monthly earnings
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyEarnings = await Transaction.aggregate([
        {
          $match: {
            userId: user._id,
            type: { $in: ['DAILY_EARNING', 'REFERRAL_COMMISSION', 'MILESTONE_BONUS'] },
            createdAt: { $gte: startOfMonth }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]);

      const monthlyEarningsTotal = monthlyEarnings.length > 0 ? monthlyEarnings[0].total : 0;

      // Calculate total earnings
      const totalEarnings = await Transaction.aggregate([
        {
          $match: {
            userId: user._id,
            type: { $in: ['DAILY_EARNING', 'REFERRAL_COMMISSION', 'MILESTONE_BONUS'] }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]);

      const totalEarningsAmount = totalEarnings.length > 0 ? totalEarnings[0].total : 0;

      // Get pending withdrawals
      const pendingWithdrawals = await Transaction.aggregate([
        {
          $match: {
            userId: user._id,
            type: 'WITHDRAWAL',
            status: 'PENDING'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]);

      const pendingWithdrawalsAmount = pendingWithdrawals.length > 0 ? pendingWithdrawals[0].total : 0;

      // Calculate next milestone
      const nextMilestone = UserController.getNextMilestone(directReferrals);

      res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            walletBalance: earningsData.calculatedBalance, // Real-time balance
            storedBalance: user.walletBalance, // Original stored balance
            pendingEarnings: earningsData.pendingEarnings, // Earnings since last update
            totalDeposit: user.totalDeposit,
            currentLevel: user.currentLevel,
            referralCode: user.referralCode,
            dailyEarnings: user.dailyEarnings,
            levelName: user.levelName,
            commissionRate: user.commissionRate,
            lastEarningUpdate: earningsData.lastUpdate,
            // Add earning rate info for client-side calculation
            dailyEarningRate: earningsData.dailyRate,
            secondlyEarningRate: earningsData.ratePerSecond,
          },
          stats: {
            directReferrals,
            indirectReferrals: totalIndirectReferrals,
            monthlyEarnings: monthlyEarningsTotal + earningsData.pendingEarnings, // Include pending
            totalEarnings: totalEarningsAmount + earningsData.pendingEarnings, // Include pending
            pendingWithdrawals: pendingWithdrawalsAmount,
            nextMilestone
          },
          recentTransactions
        }
      });

    } catch (error) {
      logger.error('Dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching dashboard data',
      });
    }
  }

  // Get user statistics
  static async getStats(req, res) {
    try {
      const user = await User.findById(req.user.userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Get daily earnings for the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const dailyEarnings = await Transaction.find({
        userId: user._id,
        type: 'DAILY_EARNING',
        createdAt: { $gte: thirtyDaysAgo }
      }).sort({ createdAt: 1 });

      // Group earnings by date
      const earningsChart = dailyEarnings.reduce((acc, transaction) => {
        const date = transaction.createdAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + parseFloat(transaction.amount);
        return acc;
      }, {});

      // Get referral commissions for the last 30 days
      const referralCommissions = await Transaction.find({
        userId: user._id,
        type: 'REFERRAL_COMMISSION',
        createdAt: { $gte: thirtyDaysAgo }
      }).sort({ createdAt: 1 });

      // Group commissions by date
      const commissionsChart = referralCommissions.reduce((acc, transaction) => {
        const date = transaction.createdAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + parseFloat(transaction.amount);
        return acc;
      }, {});

      // Get all-time transaction summary
      const transactionSummary = await Transaction.aggregate([
        {
          $match: { userId: user._id }
        },
        {
          $group: {
            _id: '$type',
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);

      const summary = transactionSummary.reduce((acc, item) => {
        acc[item._id] = {
          total: parseFloat(item.total) || 0,
          count: parseInt(item.count) || 0
        };
        return acc;
      }, {});

      // Calculate real-time referral commission earnings (not yet saved to database)
      const referralCommissionData = await user.calculateRealTimeReferralCommission();

      res.json({
        success: true,
        data: {
          earningsChart,
          commissionsChart,
          transactionSummary: summary,
          // Real-time referral commission data
          realTimeReferralCommission: {
            pendingCommission: referralCommissionData.pendingCommission,
            dailyCommissionRate: referralCommissionData.dailyCommissionRate,
            totalReferralDeposits: referralCommissionData.totalReferralDeposits,
            commissionRate: referralCommissionData.commissionRate,
            referralCount: referralCommissionData.referralCount
          }
        }
      });

    } catch (error) {
      logger.error('User stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user statistics',
      });
    }
  }

  // Change password
  static async changePassword(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { currentPassword, newPassword } = req.body;
      
      // Get user with password
      const user = await User.findById(req.user.userId).select('+password');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await user.checkPassword(currentPassword);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect',
        });
      }

      // Update password
      user.password = newPassword;
      await user.save();

      // Clear all refresh tokens to logout from all devices
      if (user.clearRefreshTokens) {
        await user.clearRefreshTokens();
      }

      logger.info(`Password changed for user: ${user.email}`);

      res.json({
        success: true,
        message: 'Password changed successfully. Please login again.',
      });

    } catch (error) {
      logger.error('Password change error:', error);
      res.status(500).json({
        success: false,
        message: 'Error changing password',
      });
    }
  }

  // Enable/disable two-factor authentication
  static async toggleTwoFactor(req, res) {
    try {
      const user = await User.findById(req.user.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      user.twoFactorEnabled = !user.twoFactorEnabled;
      await user.save();

      logger.info(`Two-factor authentication ${user.twoFactorEnabled ? 'enabled' : 'disabled'} for user: ${user.email}`);

      res.json({
        success: true,
        message: `Two-factor authentication ${user.twoFactorEnabled ? 'enabled' : 'disabled'} successfully`,
        data: {
          twoFactorEnabled: user.twoFactorEnabled,
        },
      });

    } catch (error) {
      logger.error('Toggle two-factor error:', error);
      res.status(500).json({
        success: false,
        message: 'Error toggling two-factor authentication',
      });
    }
  }

  // Get user settings
  static async getSettings(req, res) {
    try {
      const user = await User.findById(req.user.userId).select(
        'name email twoFactorEnabled isVerified notificationSettings'
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      res.json({
        success: true,
        data: {
          settings: {
            id: user._id,
            name: user.name,
            email: user.email,
            twoFactorEnabled: user.twoFactorEnabled,
            isVerified: user.isVerified,
            notificationSettings: user.notificationSettings || {
              email: true,
              sms: false,
              push: true,
            },
          },
        },
      });

    } catch (error) {
      logger.error('Get settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user settings',
      });
    }
  }

  // Update user settings
  static async updateSettings(req, res) {
    try {
      const { notificationSettings } = req.body;
      const user = await User.findById(req.user.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      if (notificationSettings) {
        user.notificationSettings = {
          ...user.notificationSettings,
          ...notificationSettings,
        };
      }

      await user.save();

      logger.info(`Settings updated for user: ${user.email}`);

      res.json({
        success: true,
        message: 'Settings updated successfully',
        data: {
          settings: {
            notificationSettings: user.notificationSettings,
          },
        },
      });

    } catch (error) {
      logger.error('Update settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating settings',
      });
    }
  }

  // Helper method to calculate next milestone
  static getNextMilestone(currentReferrals) {
    // Get milestones from environment configuration
    // For now, use the lower track as the primary milestone display for Flutter compatibility
    const milestonesConfig = JSON.parse(process.env.MILESTONE_BONUSES_LOWER || '{"3":50,"10":100,"15":150,"25":250,"50":750,"100":1000,"500":5000,"1000":25000}');
    
    const milestones = Object.entries(milestonesConfig)
      .map(([count, bonus]) => ({
        count: parseInt(count),
        bonus: parseInt(bonus)
      }))
      .sort((a, b) => a.count - b.count);

    for (const milestone of milestones) {
      if (currentReferrals < milestone.count) {
        return {
          target: milestone.count,
          current: currentReferrals,
          remaining: milestone.count - currentReferrals,
          bonus: milestone.bonus,
          progress: (currentReferrals / milestone.count) * 100
        };
      }
    }

    // All milestones achieved - use the highest milestone
    const highestMilestone = milestones[milestones.length - 1];
    return {
      target: highestMilestone.count,
      current: currentReferrals,
      remaining: 0,
      bonus: highestMilestone.bonus,
      progress: 100,
      completed: true
    };
  }

  // Get available milestones (dual-track system)
  static async getMilestones(req, res) {
    try {
      const user = await User.findById(req.user.userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const milestones = user.checkMilestoneBonus();

      res.json({
        success: true,
        data: {
          lowerTrack: {
            currentCount: user.milestoneTracking?.lowerTrack?.count || 0,
            lastClaimed: user.milestoneTracking?.lowerTrack?.lastMilestoneClaimed || 0,
            claimedMilestones: user.milestoneTracking?.lowerTrack?.claimedMilestones || [],
            availableMilestones: milestones.lowerMilestones
          },
          upperTrack: {
            currentCount: user.milestoneTracking?.upperTrack?.count || 0,
            lastClaimed: user.milestoneTracking?.upperTrack?.lastMilestoneClaimed || 0,
            claimedMilestones: user.milestoneTracking?.upperTrack?.claimedMilestones || [],
            availableMilestones: milestones.upperMilestones,
            locked: !milestones.canClaimUpper,
            unlockLevel: 'Bronze' // Bronze+ can claim upper milestones
          },
          userLevel: user.currentLevel,
          levelName: user.levelName
        }
      });

    } catch (error) {
      logger.error('Get milestones error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching milestone data'
      });
    }
  }

  // Claim milestone bonus
  static async claimMilestone(req, res) {
    try {
      const { track, milestoneCount } = req.body;

      if (!track || !['lower', 'upper'].includes(track)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid track. Must be "lower" or "upper"'
        });
      }

      if (!milestoneCount || milestoneCount < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid milestone count'
        });
      }

      const user = await User.findById(req.user.userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user can claim this milestone
      const milestones = user.checkMilestoneBonus();
      
      // Validate track accessibility
      if (track === 'upper' && !milestones.canClaimUpper) {
        return res.status(403).json({
          success: false,
          message: 'Upper track milestones are only available for Bronze level and above'
        });
      }

      // Find the milestone to claim
      const trackMilestones = track === 'lower' ? milestones.lowerMilestones : milestones.upperMilestones;
      const milestone = trackMilestones.find(m => m.count === milestoneCount);

      if (!milestone) {
        return res.status(404).json({
          success: false,
          message: 'Milestone not found or not yet achieved'
        });
      }

      // Check if already claimed
      const trackData = track === 'lower' 
        ? user.milestoneTracking.lowerTrack 
        : user.milestoneTracking.upperTrack;

      if (trackData.claimedMilestones.includes(milestoneCount)) {
        return res.status(400).json({
          success: false,
          message: 'This milestone has already been claimed'
        });
      }

      // Award the bonus
      user.walletBalance = (user.walletBalance || 0) + milestone.bonus;
      user.totalEarnings = (user.totalEarnings || 0) + milestone.bonus;

      // Update milestone tracking
      trackData.lastMilestoneClaimed = milestoneCount;
      trackData.claimedMilestones.push(milestoneCount);
      user.markModified('milestoneTracking');

      await user.save();

      // Create transaction record
      await Transaction.create({
        userId: user._id,
        type: 'MILESTONE_BONUS',
        subType: track.toUpperCase(),
        amount: milestone.bonus,
        status: 'COMPLETED',
        description: `${track === 'lower' ? 'Lower' : 'Upper'} track milestone bonus for ${milestoneCount} referral deposits`
      });

      logger.info(`User ${user.email} claimed ${track} milestone ${milestoneCount} for $${milestone.bonus}`);

      res.json({
        success: true,
        message: `Milestone bonus of $${milestone.bonus} claimed successfully!`,
        data: {
          bonusAmount: milestone.bonus,
          newBalance: user.walletBalance,
          track,
          milestoneCount
        }
      });

    } catch (error) {
      logger.error('Claim milestone error:', error);
      res.status(500).json({
        success: false,
        message: 'Error claiming milestone bonus'
      });
    }
  }
}

module.exports = UserController;