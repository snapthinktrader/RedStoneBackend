const express = require('express');
const { query, validationResult } = require('express-validator');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// @route   GET /api/referrals
// @desc    Get user's referral network
// @access  Private
router.get('/', [
  auth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
], async (req, res) => {
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

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get direct referrals (Level 1) with their earnings contribution
    const directReferralsRaw = await User.find({
      referredBy: req.user.userId,
      isActive: true,
    })
    .select('name email walletBalance totalDeposit currentLevel createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    // Calculate earnings from each referred user
    const directReferrals = await Promise.all(directReferralsRaw.map(async (referral) => {
      // Get commission earnings from this specific user
      const commissionData = await Transaction.aggregate([
        {
          $match: {
            userId: req.user.userId,
            type: 'REFERRAL_COMMISSION',
            status: 'COMPLETED',
            'metadata.refereeId': referral._id
          }
        },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: '$amount' },
            transactionCount: { $sum: 1 },
            lastEarning: { $max: '$createdAt' }
          }
        }
      ]);

      const earnings = commissionData[0] || { totalEarnings: 0, transactionCount: 0, lastEarning: null };

      return {
        _id: referral._id,
        name: referral.name,
        email: referral.email,
        walletBalance: referral.walletBalance,
        totalDeposit: referral.totalDeposit,
        currentLevel: referral.currentLevel,
        joinedAt: referral.createdAt,
        myEarningsFromThisUser: {
          total: earnings.totalEarnings,
          commissionCount: earnings.transactionCount,
          lastEarningDate: earnings.lastEarning
        }
      };
    }));

    // Get total count of direct referrals
    const totalDirectReferrals = await User.countDocuments({
      referredBy: req.user.userId,
      isActive: true,
    });

    // Get indirect referrals (Level 2) - referrals of direct referrals
    const indirectReferralsData = await User.aggregate([
      {
        $match: { referredBy: req.user.userId, isActive: true }
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
        $unwind: {
          path: '$indirectReferrals',
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $match: {
          'indirectReferrals.isActive': true
        }
      },
      {
        $project: {
          'indirectReferrals.name': 1,
          'indirectReferrals.email': 1,
          'indirectReferrals.walletBalance': 1,
          'indirectReferrals.totalDeposit': 1,
          'indirectReferrals.currentLevel': 1,
          'indirectReferrals.createdAt': 1,
          referrerName: '$name',
          referrerEmail: '$email'
        }
      },
      {
        $sort: { 'indirectReferrals.createdAt': -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: limit
      }
    ]);

    // Calculate commission earnings
    const commissionEarnings = await Transaction.aggregate([
      {
        $match: {
          userId: req.user.userId,
          type: 'REFERRAL_COMMISSION',
          status: 'COMPLETED'
        }
      },
      {
        $group: {
          _id: null,
          totalCommissions: { $sum: '$amount' },
          thisMonthCommissions: {
            $sum: {
              $cond: {
                if: {
                  $gte: ['$createdAt', new Date(new Date().getFullYear(), new Date().getMonth(), 1)]
                },
                then: '$amount',
                else: 0
              }
            }
          }
        }
      }
    ]);

    const commissions = commissionEarnings[0] || { totalCommissions: 0, thisMonthCommissions: 0 };

    res.json({
      success: true,
      data: {
        directReferrals,
        indirectReferrals: indirectReferralsData.map(item => ({
          ...item.indirectReferrals,
          referrer: {
            name: item.referrerName,
            email: item.referrerEmail
          }
        })),
        stats: {
          totalDirectReferrals,
          totalIndirectReferrals: await User.aggregate([
            { $match: { referredBy: req.user.userId, isActive: true } },
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
                indirectCount: {
                  $size: {
                    $filter: {
                      input: '$indirectReferrals',
                      cond: { $eq: ['$$this.isActive', true] }
                    }
                  }
                }
              }
            },
            {
              $group: {
                _id: null,
                total: { $sum: '$indirectCount' }
              }
            }
          ]).then(result => result[0]?.total || 0),
          totalCommissions: commissions.totalCommissions,
          thisMonthCommissions: commissions.thisMonthCommissions,
        },
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalDirectReferrals / limit),
          hasNextPage: skip + limit < totalDirectReferrals,
          hasPrevPage: page > 1,
        },
      },
    });

  } catch (error) {
    logger.error('Get referrals error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching referral data',
    });
  }
});

// @route   GET /api/referrals/user-referrals
// @desc    Get user's referrals (for mobile app compatibility)
// @access  Private
router.get('/user-referrals', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get direct referrals with earnings
    const directReferralsRaw = await User.find({
      referredBy: req.user.userId,
      isActive: true,
    })
    .select('name email walletBalance totalDeposit currentLevel createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    // Calculate earnings from each referred user
    const referrals = await Promise.all(directReferralsRaw.map(async (referral) => {
      const commissionData = await Transaction.aggregate([
        {
          $match: {
            userId: req.user.userId,
            type: 'REFERRAL_COMMISSION',
            status: 'COMPLETED',
            'metadata.refereeId': referral._id
          }
        },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: '$amount' },
            transactionCount: { $sum: 1 },
            lastEarning: { $max: '$createdAt' }
          }
        }
      ]);

      const earnings = commissionData[0] || { totalEarnings: 0, transactionCount: 0, lastEarning: null };

      // Calculate referral's REAL-TIME earnings (includes compounding)
      const refUserModel = await User.findById(referral._id);
      const referralRealTimeData = refUserModel ? refUserModel.calculateRealTimeEarnings() : { calculatedBalance: 0, pendingEarnings: 0, dailyRate: 0, ratePerSecond: 0 };
      
      // Calculate their ACTUAL per-second earnings based on their current balance
      const SECONDS_PER_DAY = 86400;
      const referralCurrentBalance = referralRealTimeData.calculatedBalance; // Their real-time balance including pending
      const referralDailyEarningRate = refUserModel ? refUserModel.dailyEarningRate : 0; // Their daily % rate
      const referralEarningsPerSecond = (referralCurrentBalance * referralDailyEarningRate) / SECONDS_PER_DAY; // Actual $ per second
      
      // Calculate YOUR commission from their per-second earnings
      const user = await User.findById(req.user.userId);
      const myCommissionRate = user ? user.getCommissionRate() : 0; // Your 15% rate
      const myCommissionPerSecond = referralEarningsPerSecond * myCommissionRate; // 15% of their per-second earnings
      const myCommissionPerDay = myCommissionPerSecond * SECONDS_PER_DAY; // 15% of their daily earnings

      return {
        id: referral._id.toString(),
        referrerId: req.user.userId,
        refereeId: referral._id.toString(),
        refereeName: referral.name,
        refereeEmail: referral.email,
        commissionEarned: earnings.totalEarnings, // Total historical commission
        level: 1, // Direct referral
        joinedAt: referral.createdAt.toISOString(),
        refereeDeposit: referral.totalDeposit,
        isActive: true,
        // Additional data for enhanced display
        walletBalance: referral.walletBalance,
        currentLevel: referral.currentLevel,
        // REAL-TIME earnings data (updates every second with compounding)
        realTimeBalance: referralRealTimeData.calculatedBalance, // Their current balance including pending earnings
        pendingEarnings: referralRealTimeData.pendingEarnings, // Their unclaimed earnings since last update
        currentBalanceForEarnings: referralCurrentBalance, // Balance used for earning calculations
        dailyEarningRate: referralDailyEarningRate, // Their daily percentage rate
        actualEarningsPerSecond: referralEarningsPerSecond, // Their actual $ per second from current balance
        actualDailyEarnings: referralEarningsPerSecond * SECONDS_PER_DAY, // Their actual daily $ earnings
        myDailyCommission: myCommissionPerDay, // What you earn per day from them (15% of their daily earnings)
        myCommissionPerSecond: myCommissionPerSecond, // What you earn per second from them (15% of their per-sec earnings)
        myCommissionRate: myCommissionRate, // Your commission percentage (15%)
        lastEarningUpdate: referralRealTimeData.lastUpdate, // When their earnings were last updated
        myEarningsFromThisUser: {
          total: earnings.totalEarnings,
          commissionCount: earnings.transactionCount,
          lastEarningDate: earnings.lastEarning
        }
      };
    }));

    res.json({
      success: true,
      data: {
        referrals
      },
    });

  } catch (error) {
    logger.error('Get user referrals error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching referrals',
    });
  }
});

// @route   GET /api/referrals/stats
// @desc    Get referral statistics and milestone progress
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    // Count direct referrals
    const directReferralCount = await User.countDocuments({
      referredBy: req.user.userId,
      isActive: true,
    });

    // Count indirect referrals
    const indirectReferralData = await User.aggregate([
      { $match: { referredBy: req.user.userId, isActive: true } },
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
          indirectCount: {
            $size: {
              $filter: {
                input: '$indirectReferrals',
                cond: { $eq: ['$$this.isActive', true] }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$indirectCount' }
        }
      }
    ]);

    const indirectReferralCount = indirectReferralData[0]?.total || 0;

  // Get milestone bonuses information - use lower track for primary display
  const milestones = JSON.parse(process.env.MILESTONE_BONUSES_LOWER || '{"3":50,"10":100,"15":150,"25":250,"50":750,"100":1000,"500":5000,"1000":25000}');
    
    // Find next milestone
    let nextMilestone = null;
    let currentMilestoneReached = null;
    
    for (const [count, bonus] of Object.entries(milestones)) {
      const milestoneCount = parseInt(count);
      if (directReferralCount >= milestoneCount) {
        currentMilestoneReached = { count: milestoneCount, bonus };
      } else if (!nextMilestone) {
        nextMilestone = {
          count: milestoneCount,
          bonus,
          progress: directReferralCount,
          remaining: milestoneCount - directReferralCount,
          progressPercentage: Math.round((directReferralCount / milestoneCount) * 100),
        };
      }
    }

    // Get commission earnings by time period
    const commissionStats = await Transaction.aggregate([
      {
        $match: {
          userId: req.user.userId,
          type: 'REFERRAL_COMMISSION',
          status: 'COMPLETED'
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$amount' },
          thisMonthEarnings: {
            $sum: {
              $cond: {
                if: {
                  $gte: ['$createdAt', new Date(new Date().getFullYear(), new Date().getMonth(), 1)]
                },
                then: '$amount',
                else: 0
              }
            }
          },
          thisWeekEarnings: {
            $sum: {
              $cond: {
                if: {
                  $gte: ['$createdAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]
                },
                then: '$amount',
                else: 0
              }
            }
          }
        }
      }
    ]);

    const earnings = commissionStats[0] || {
      totalEarnings: 0,
      thisMonthEarnings: 0,
      thisWeekEarnings: 0
    };

    // Get recent referral activities
    const recentReferrals = await User.find({
      referredBy: req.user.userId,
      isActive: true,
    })
    .select('name email totalDeposit createdAt')
    .sort({ createdAt: -1 })
    .limit(5);

    res.json({
      success: true,
      data: {
        referralCode: user.referralCode,
        counts: {
          direct: directReferralCount,
          indirect: indirectReferralCount,
          total: directReferralCount + indirectReferralCount,
        },
        earnings,
        milestones: {
          current: currentMilestoneReached,
          next: nextMilestone,
          all: Object.entries(milestones).map(([count, bonus]) => ({
            count: parseInt(count),
            bonus,
            achieved: directReferralCount >= parseInt(count),
          })),
        },
        recentReferrals,
        commissionRate: user.commissionRate,
        currentLevel: user.currentLevel,
        levelName: user.levelName,
      },
    });

  } catch (error) {
    logger.error('Get referral stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching referral statistics',
    });
  }
});

// @route   GET /api/referrals/commissions
// @desc    Get commission transaction history
// @access  Private
router.get('/commissions', [
  auth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
], async (req, res) => {
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

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get commission transactions
    const commissions = await Transaction.find({
      userId: req.user.userId,
      type: { $in: ['REFERRAL_COMMISSION', 'MILESTONE_BONUS'] },
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    // Get total count
    const totalCommissions = await Transaction.countDocuments({
      userId: req.user.userId,
      type: { $in: ['REFERRAL_COMMISSION', 'MILESTONE_BONUS'] },
    });

    res.json({
      success: true,
      data: {
        commissions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCommissions / limit),
          totalCommissions,
          hasNextPage: skip + limit < totalCommissions,
          hasPrevPage: page > 1,
        },
      },
    });

  } catch (error) {
    logger.error('Get commissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching commission history',
    });
  }
});

// @route   GET /api/referrals/tree
// @desc    Get referral tree visualization data
// @access  Private
router.get('/tree', auth, async (req, res) => {
  try {
    // Get current user
    const user = await User.findById(req.user.userId).select('name email referralCode currentLevel');

    // Build referral tree (2 levels deep)
    const referralTree = await User.aggregate([
      {
        $match: { referredBy: req.user.userId, isActive: true }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'referredBy',
          as: 'children'
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          walletBalance: 1,
          totalDeposit: 1,
          currentLevel: 1,
          createdAt: 1,
          children: {
            $filter: {
              input: '$children',
              cond: { $eq: ['$$this.isActive', true] }
            }
          }
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]);

    // Calculate tree statistics
    const totalLevel1 = referralTree.length;
    const totalLevel2 = referralTree.reduce((sum, node) => sum + node.children.length, 0);

    res.json({
      success: true,
      data: {
        root: {
          id: user._id,
          name: user.name,
          email: user.email,
          referralCode: user.referralCode,
          level: user.currentLevel,
          type: 'root'
        },
        tree: referralTree.map(level1 => ({
          id: level1._id,
          name: level1.name,
          email: level1.email,
          walletBalance: level1.walletBalance,
          totalDeposit: level1.totalDeposit,
          currentLevel: level1.currentLevel,
          joinedAt: level1.createdAt,
          type: 'level1',
          children: level1.children.map(level2 => ({
            id: level2._id,
            name: level2.name,
            email: level2.email,
            walletBalance: level2.walletBalance,
            totalDeposit: level2.totalDeposit,
            currentLevel: level2.currentLevel,
            joinedAt: level2.createdAt,
            type: 'level2'
          }))
        })),
        stats: {
          totalLevel1,
          totalLevel2,
          totalNetwork: totalLevel1 + totalLevel2
        }
      },
    });

  } catch (error) {
    logger.error('Get referral tree error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching referral tree',
    });
  }
});

module.exports = router;