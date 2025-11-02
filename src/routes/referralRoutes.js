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

    // Get parent user with stored lifetime earnings
    const parentUser = await User.findById(req.user.userId);
    const storedLifetimeEarnings = parentUser?.lifetimeReferralEarnings || 0;

    // Get direct referrals with earnings
    const directReferralsRaw = await User.find({
      referredBy: req.user.userId,
      isActive: true,
    })
    .select('name username email walletBalance totalDeposit currentLevel levelName createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    // Calculate total wallet balance of all referrals for proportional distribution
    const totalReferralBalance = directReferralsRaw.reduce((sum, ref) => sum + (ref.walletBalance || 0), 0);

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
      const referralRealTimeData = refUserModel ? await refUserModel.calculateRealTimeEarnings() : { calculatedBalance: 0, pendingEarnings: 0, dailyRate: 0, ratePerSecond: 0 };
      
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
      
      // Calculate ACTUAL lifetime commission based on referral's complete earning history
      // This uses the same timeline-based calculation as the referral's own earnings
      const referralTransactions = await Transaction.find({
        userId: referral._id,
        type: { $in: ['DEPOSIT', 'PROMOTIONAL_BONUS', 'MILESTONE_BONUS'] },
        status: 'COMPLETED'
      }).select('type amount createdAt').sort({ createdAt: 1 });
      
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
      
      let totalLifetimeEarnings = 0;
      
      if (referralTransactions.length > 0) {
        const now = new Date();
        let refBalance = 0;
        let refTotalDeposits = 0;
        let refCurrentRate = 0;
        
        for (let i = 0; i < referralTransactions.length; i++) {
          const event = referralTransactions[i];
          const nextEvent = referralTransactions[i + 1];
          const eventTime = new Date(event.createdAt);
          const nextTime = nextEvent ? new Date(nextEvent.createdAt) : now;
          
          // Update their balance and rate based on event
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
            totalLifetimeEarnings += myCommissionThisPeriod;
            
            // Add their earnings to their balance for next period
            refBalance += refPeriodEarnings;
          }
        }
      }

      // Determine track based on deposit amount
      const track = referral.totalDeposit >= 50 ? 'upper' : 'lower';
      const trackLabel = referral.totalDeposit >= 50 ? 'Bronze Plus' : 'Bronze';
      
      return {
        id: referral._id.toString(),
        referrerId: req.user.userId,
        refereeId: referral._id.toString(),
        username: referral.username || referral.name,
        refereeName: referral.name,
        refereeEmail: referral.email,
        email: referral.email,
        commissionEarned: earnings.totalEarnings, // Total historical commission
        level: 1, // Direct referral
        joinedAt: referral.createdAt.toISOString(),
        refereeDeposit: referral.totalDeposit,
        totalDeposit: referral.totalDeposit,
        isActive: true,
        // Track information
        track: track, // 'lower' or 'upper'
        trackLabel: trackLabel, // 'Bronze' or 'Bronze Plus'
        // Additional data for enhanced display
        walletBalance: referral.walletBalance,
        currentLevel: referral.currentLevel,
        levelName: referral.levelName,
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
          total: totalLifetimeEarnings, // Total lifetime commission calculated from timeline
          commissionCount: earnings.transactionCount,
          lastEarningDate: earnings.lastEarning,
          calculationDetails: {
            method: 'timeline-based',
            transactionCount: referralTransactions.length,
            myCommissionRate: myCommissionRate,
            note: 'Calculated using timeline-based per-second compound interest on referral earnings'
          }
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

    // Auto-initialize milestone tracking if it doesn't exist
    if (!user.milestoneTracking || 
        user.milestoneTracking.lowerTrack?.count === undefined || 
        user.milestoneTracking.upperTrack?.count === undefined) {
      
      console.log(`🔄 Auto-initializing milestone tracking for ${user.email}`);
      
      // Get all direct referrals
      const referrals = await User.find({
        referredBy: req.user.userId,
        isActive: true,
      });

      // Initialize milestone tracking
      if (!user.milestoneTracking) {
        user.milestoneTracking = {
          lowerTrack: { count: 0, lastMilestoneClaimed: 0 },
          upperTrack: { count: 0, lastMilestoneClaimed: 0 }
        };
      }

      // Count referrals by track
      let lowerCount = 0;
      let upperCount = 0;

      referrals.forEach(ref => {
        const deposit = ref.totalDeposit || 0;
        if (deposit >= 50) {
          upperCount++;
        } else if (deposit >= 15 && deposit < 50) {
          lowerCount++;
        }
        // Note: Deposits $0-$14 don't count in any track
      });

      // Update counts
      user.milestoneTracking.lowerTrack.count = lowerCount;
      user.milestoneTracking.upperTrack.count = upperCount;

      await user.save();
      
      console.log(`✅ Auto-initialized: Lower=${lowerCount}, Upper=${upperCount}`);
    }

  // Get milestone bonuses information - dual track system
  const lowerTrackBonuses = JSON.parse(process.env.MILESTONE_BONUSES_LOWER || '{"3":15,"10":30,"15":45,"25":65,"50":100,"100":300,"500":1000,"1000":3500}');
  const upperTrackBonuses = JSON.parse(process.env.MILESTONE_BONUSES_UPPER || '{"3":50,"10":100,"15":150,"25":250,"50":750,"100":1600,"500":5000,"1000":10000}');
  
  // Get counts for each track
  const lowerTrackCount = user.milestoneTracking?.lowerTrack?.count || 0;
  const upperTrackCount = user.milestoneTracking?.upperTrack?.count || 0;
  
  // Find next milestone for lower track
  let nextLowerMilestone = null;
  let currentLowerMilestoneReached = null;
  
  for (const [count, bonus] of Object.entries(lowerTrackBonuses)) {
    const milestoneCount = parseInt(count);
    if (lowerTrackCount >= milestoneCount) {
      currentLowerMilestoneReached = { count: milestoneCount, bonus };
    } else if (!nextLowerMilestone) {
      nextLowerMilestone = {
        count: milestoneCount,
        bonus,
        progress: lowerTrackCount,
        remaining: milestoneCount - lowerTrackCount,
        progressPercentage: Math.round((lowerTrackCount / milestoneCount) * 100),
        track: 'lower'
      };
    }
  }
  
  // Find next milestone for upper track
  let nextUpperMilestone = null;
  let currentUpperMilestoneReached = null;
  
  for (const [count, bonus] of Object.entries(upperTrackBonuses)) {
    const milestoneCount = parseInt(count);
    if (upperTrackCount >= milestoneCount) {
      currentUpperMilestoneReached = { count: milestoneCount, bonus };
    } else if (!nextUpperMilestone) {
      nextUpperMilestone = {
        count: milestoneCount,
        bonus,
        progress: upperTrackCount,
        remaining: milestoneCount - upperTrackCount,
        progressPercentage: Math.round((upperTrackCount / milestoneCount) * 100),
        track: 'upper'
      };
    }
  }
  
  // Use lower track for backward compatibility
  const milestones = lowerTrackBonuses;
  const nextMilestone = nextLowerMilestone;
  const currentMilestoneReached = currentLowerMilestoneReached;

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
          lowerTrack: lowerTrackCount,
          upperTrack: upperTrackCount,
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
          // Dual track information
          lowerTrack: {
            current: currentLowerMilestoneReached,
            next: nextLowerMilestone,
            count: lowerTrackCount,
            bonuses: lowerTrackBonuses,
          },
          upperTrack: {
            current: currentUpperMilestoneReached,
            next: nextUpperMilestone,
            count: upperTrackCount,
            bonuses: upperTrackBonuses,
          },
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

// @route   POST /api/referral/initialize-milestones
// @desc    Initialize milestone tracking for existing referrals
// @access  Private
router.post('/initialize-milestones', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get all direct referrals
    const referrals = await User.find({
      referredBy: req.user.userId,
      isActive: true,
    });

    console.log(`\n🔄 Initializing milestone tracking for ${user.email}`);
    console.log(`📊 Found ${referrals.length} referrals`);

    // Initialize milestone tracking if it doesn't exist
    if (!user.milestoneTracking) {
      user.milestoneTracking = {
        lowerTrack: { count: 0, lastMilestoneClaimed: 0 },
        upperTrack: { count: 0, lastMilestoneClaimed: 0 }
      };
    }

    // Count referrals by track
    let lowerCount = 0;
    let upperCount = 0;

    referrals.forEach(ref => {
      const deposit = ref.totalDeposit || 0;
      if (deposit >= 50) {
        upperCount++;
        console.log(`  ✓ ${ref.name || ref.email}: $${deposit} → Upper Track`);
      } else if (deposit >= 15 && deposit < 50) {
        lowerCount++;
        console.log(`  ✓ ${ref.name || ref.email}: $${deposit} → Lower Track`);
      } else {
        console.log(`  ✓ ${ref.name || ref.email}: $${deposit} → No Track (< $15)`);
      }
    });

    // Update counts
    user.milestoneTracking.lowerTrack.count = lowerCount;
    user.milestoneTracking.upperTrack.count = upperCount;

    await user.save();

    console.log(`✅ Updated milestone tracking:`);
    console.log(`   Lower Track: ${lowerCount} referrals`);
    console.log(`   Upper Track: ${upperCount} referrals`);

    // Get milestone bonuses
    const lowerTrackBonuses = JSON.parse(process.env.MILESTONE_BONUSES_LOWER || '{"3":15,"10":30,"15":45,"25":65,"50":100,"100":300,"500":1000,"1000":3500}');
    const upperTrackBonuses = JSON.parse(process.env.MILESTONE_BONUSES_UPPER || '{"3":50,"10":100,"15":150,"25":250,"50":750,"100":1600,"500":5000,"1000":10000}');

    // Find next milestones
    let nextLowerMilestone = null;
    let nextUpperMilestone = null;

    for (const [count, bonus] of Object.entries(lowerTrackBonuses)) {
      if (lowerCount < parseInt(count)) {
        nextLowerMilestone = { count: parseInt(count), bonus };
        break;
      }
    }

    for (const [count, bonus] of Object.entries(upperTrackBonuses)) {
      if (upperCount < parseInt(count)) {
        nextUpperMilestone = { count: parseInt(count), bonus };
        break;
      }
    }

    res.json({
      success: true,
      message: 'Milestone tracking initialized successfully',
      data: {
        lowerTrack: {
          count: lowerCount,
          next: nextLowerMilestone,
        },
        upperTrack: {
          count: upperCount,
          next: nextUpperMilestone,
        },
        totalReferrals: referrals.length,
      },
    });

  } catch (error) {
    logger.error('Initialize milestones error:', error);
    res.status(500).json({
      success: false,
      message: 'Error initializing milestone tracking',
    });
  }
});

module.exports = router;