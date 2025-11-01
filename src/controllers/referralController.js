const { User, Transaction } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

class ReferralController {
  // Get referral statistics
  static async getReferralStats(req, res) {
    try {
      const userId = req.user.id;

      // Get direct referrals (Level 1)
      const directReferrals = await User.findAll({
        where: { referredBy: userId },
        attributes: ['id', 'name', 'email', 'totalDeposit', 'createdAt', 'isActive'],
        order: [['createdAt', 'DESC']]
      });

      // Get indirect referrals (Level 2)
      const directReferralIds = directReferrals.map(user => user.id);
      const indirectReferrals = directReferralIds.length > 0 ? await User.findAll({
        where: { 
          referredBy: {
            [Op.in]: directReferralIds
          }
        },
        attributes: ['id', 'name', 'email', 'totalDeposit', 'createdAt', 'referredBy', 'isActive'],
        order: [['createdAt', 'DESC']]
      }) : [];

      // Calculate total referral commissions
      const totalCommissions = await Transaction.sum('amount', {
        where: {
          userId,
          type: 'REFERRAL_COMMISSION'
        }
      }) || 0;

      // Calculate this month's commissions
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyCommissions = await Transaction.sum('amount', {
        where: {
          userId,
          type: 'REFERRAL_COMMISSION',
          createdAt: {
            [Op.gte]: startOfMonth
          }
        }
      }) || 0;

      // Calculate milestone progress
      const directReferralCount = directReferrals.length;
      const milestoneProgress = ReferralController.calculateMilestoneProgress(directReferralCount);

      // Calculate team statistics
      const teamStats = {
        level1: {
          count: directReferrals.length,
          activeCount: directReferrals.filter(user => user.isActive).length,
          totalDeposits: directReferrals.reduce((sum, user) => sum + parseFloat(user.totalDeposit), 0)
        },
        level2: {
          count: indirectReferrals.length,
          activeCount: indirectReferrals.filter(user => user.isActive).length,
          totalDeposits: indirectReferrals.reduce((sum, user) => sum + parseFloat(user.totalDeposit), 0)
        }
      };

      // Get recent referral activities
      const recentActivities = await Transaction.findAll({
        where: {
          userId,
          type: 'REFERRAL_COMMISSION'
        },
        order: [['createdAt', 'DESC']],
        limit: 10
      });

      res.json({
        success: true,
        data: {
          overview: {
            directReferrals: directReferralCount,
            indirectReferrals: indirectReferrals.length,
            totalCommissions,
            monthlyCommissions
          },
          milestoneProgress,
          teamStats,
          recentActivities
        }
      });

    } catch (error) {
      logger.error('Get referral stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get referral network/tree
  static async getReferralNetwork(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, level = 1 } = req.query;

      const offset = (page - 1) * limit;

      let referrals;
      let totalCount;

      if (level == 1) {
        // Get direct referrals
        const result = await User.findAndCountAll({
          where: { referredBy: userId },
          attributes: ['id', 'name', 'email', 'totalDeposit', 'walletBalance', 'currentLevel', 'createdAt', 'isActive'],
          order: [['createdAt', 'DESC']],
          limit: parseInt(limit),
          offset: parseInt(offset)
        });

        referrals = result.rows;
        totalCount = result.count;

      } else if (level == 2) {
        // Get indirect referrals
        const directReferralIds = await User.findAll({
          where: { referredBy: userId },
          attributes: ['id']
        }).then(users => users.map(u => u.id));

        if (directReferralIds.length === 0) {
          referrals = [];
          totalCount = 0;
        } else {
          const result = await User.findAndCountAll({
            where: { 
              referredBy: {
                [Op.in]: directReferralIds
              }
            },
            attributes: ['id', 'name', 'email', 'totalDeposit', 'walletBalance', 'currentLevel', 'createdAt', 'referredBy', 'isActive'],
            include: [{
              model: User,
              as: 'referrer',
              attributes: ['name', 'email']
            }],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
          });

          referrals = result.rows;
          totalCount = result.count;
        }
      }

      const totalPages = Math.ceil(totalCount / limit);

      res.json({
        success: true,
        data: {
          referrals,
          pagination: {
            total: totalCount,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      });

    } catch (error) {
      logger.error('Get referral network error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get referral commissions history
  static async getReferralCommissions(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, startDate, endDate } = req.query;

      const offset = (page - 1) * limit;
      const where = {
        userId,
        type: 'REFERRAL_COMMISSION'
      };

      // Add date filters
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          where.createdAt[Op.lte] = new Date(endDate);
        }
      }

      const { count, rows: commissions } = await Transaction.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const totalPages = Math.ceil(count / limit);

      // Calculate commission summary
      const totalCommissions = await Transaction.sum('amount', {
        where: {
          userId,
          type: 'REFERRAL_COMMISSION'
        }
      }) || 0;

      const level1Commissions = await Transaction.sum('amount', {
        where: {
          userId,
          type: 'REFERRAL_COMMISSION',
          'metadata.level': 1
        }
      }) || 0;

      const level2Commissions = await Transaction.sum('amount', {
        where: {
          userId,
          type: 'REFERRAL_COMMISSION',
          'metadata.level': 2
        }
      }) || 0;

      res.json({
        success: true,
        data: {
          commissions,
          summary: {
            total: totalCommissions,
            level1: level1Commissions,
            level2: level2Commissions
          },
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      });

    } catch (error) {
      logger.error('Get referral commissions error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get referral performance analytics
  static async getReferralAnalytics(req, res) {
    try {
      const userId = req.user.id;
      const { period = '30d' } = req.query;

      // Calculate date range
      let startDate;
      switch (period) {
        case '7d':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      // Get new referrals over time
      const newReferrals = await User.findAll({
        where: {
          referredBy: userId,
          createdAt: {
            [Op.gte]: startDate
          }
        },
        attributes: [
          [User.sequelize.fn('DATE', User.sequelize.col('createdAt')), 'date'],
          [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'count']
        ],
        group: [User.sequelize.fn('DATE', User.sequelize.col('createdAt'))],
        order: [[User.sequelize.fn('DATE', User.sequelize.col('createdAt')), 'ASC']]
      });

      // Get commission earnings over time
      const commissionEarnings = await Transaction.findAll({
        where: {
          userId,
          type: 'REFERRAL_COMMISSION',
          createdAt: {
            [Op.gte]: startDate
          }
        },
        attributes: [
          [Transaction.sequelize.fn('DATE', Transaction.sequelize.col('createdAt')), 'date'],
          [Transaction.sequelize.fn('SUM', Transaction.sequelize.col('amount')), 'total']
        ],
        group: [Transaction.sequelize.fn('DATE', Transaction.sequelize.col('createdAt'))],
        order: [[Transaction.sequelize.fn('DATE', Transaction.sequelize.col('createdAt')), 'ASC']]
      });

      // Get top performing referrals
      const topReferrals = await User.findAll({
        where: { referredBy: userId },
        attributes: ['id', 'name', 'email', 'totalDeposit', 'walletBalance', 'createdAt'],
        order: [['totalDeposit', 'DESC']],
        limit: 10
      });

      // Calculate conversion rates
      const totalClicks = await ReferralController.getReferralClicks(userId); // Mock data
      const totalReferrals = await User.count({ where: { referredBy: userId } });
      const conversionRate = totalClicks > 0 ? (totalReferrals / totalClicks) * 100 : 0;

      res.json({
        success: true,
        data: {
          chartData: {
            newReferrals: newReferrals.map(item => ({
              date: item.dataValues.date,
              count: parseInt(item.dataValues.count)
            })),
            commissionEarnings: commissionEarnings.map(item => ({
              date: item.dataValues.date,
              amount: parseFloat(item.dataValues.total)
            }))
          },
          topReferrals,
          performance: {
            totalClicks,
            totalReferrals,
            conversionRate: conversionRate.toFixed(2)
          }
        }
      });

    } catch (error) {
      logger.error('Get referral analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get user's referral code and sharing info
  static async getReferralCode(req, res) {
    try {
      const userId = req.user.id;

      const user = await User.findByPk(userId, {
        attributes: ['id', 'name', 'email', 'referralCode']
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const referralUrl = `${process.env.FRONTEND_URL}/register?ref=${user.referralCode}`;
      const shareText = `Join RedStone and start earning daily returns on your crypto investments! Use my referral code: ${user.referralCode}`;

      res.json({
        success: true,
        data: {
          referralCode: user.referralCode,
          referralUrl,
          shareText,
          qrCodeData: referralUrl
        }
      });

    } catch (error) {
      logger.error('Get referral code error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Helper methods
  static calculateMilestoneProgress(referralCount) {
    // Get milestones from environment configuration - use lower track for primary display
    const milestonesConfig = JSON.parse(process.env.MILESTONE_BONUSES_LOWER || '{"3":50,"10":100,"15":150,"25":250,"50":750,"100":1000,"500":5000,"1000":25000}');
    
    const milestones = Object.entries(milestonesConfig)
      .map(([count, bonus]) => ({
        count: parseInt(count),
        bonus: parseInt(bonus),
        title: this.getMilestoneTitle(parseInt(count))
      }))
      .sort((a, b) => a.count - b.count);

    const completedMilestones = milestones.filter(m => referralCount >= m.count);
    const nextMilestone = milestones.find(m => referralCount < m.count);

    return {
      completed: completedMilestones,
      next: nextMilestone ? {
        ...nextMilestone,
        progress: (referralCount / nextMilestone.count) * 100,
        remaining: nextMilestone.count - referralCount
      } : null,
      totalEarned: completedMilestones.reduce((sum, m) => sum + m.bonus, 0)
    };
  }

  static getMilestoneTitle(count) {
    if (count <= 3) return 'Starter';
    if (count <= 10) return 'Bronze';
    if (count <= 25) return 'Silver';
    if (count <= 50) return 'Gold';
    if (count <= 100) return 'Platinum';
    if (count <= 200) return 'Diamond';
    return 'Legend';
  }

  static async getReferralClicks(userId) {
    // This would typically come from analytics tracking
    // For now, return mock data
    return Math.floor(Math.random() * 1000) + 100;
  }
}

module.exports = ReferralController;