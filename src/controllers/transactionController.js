const { Transaction, User } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const crypto = require('crypto');

class TransactionController {
  // Get user transactions
  static async getTransactions(req, res) {
    try {
      const userId = req.user.id;
      const { 
        page = 1, 
        limit = 20, 
        type, 
        status, 
        startDate, 
        endDate 
      } = req.query;

      const offset = (page - 1) * limit;
      const where = { userId };

      // Add filters
      if (type) {
        where.type = type;
      }

      if (status) {
        where.status = status;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          where.createdAt[Op.lte] = new Date(endDate);
        }
      }

      const { count, rows: transactions } = await Transaction.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const totalPages = Math.ceil(count / limit);

      res.json({
        success: true,
        data: {
          transactions,
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
      logger.error('Get transactions error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get single transaction
  static async getTransaction(req, res) {
    try {
      const userId = req.user.id;
      const { transactionId } = req.params;

      const transaction = await Transaction.findOne({
        where: {
          id: transactionId,
          userId
        }
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      res.json({
        success: true,
        data: {
          transaction
        }
      });

    } catch (error) {
      logger.error('Get transaction error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Create deposit transaction
  static async createDeposit(req, res) {
    try {
      const userId = req.user.id;
      const { amount, cryptocurrency, paymentMethod } = req.body;

      // Validate amount
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid deposit amount'
        });
      }

      // Get user to check current status
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is not active'
        });
      }

      // Generate deposit address based on cryptocurrency
      const depositAddress = TransactionController.generateDepositAddress(cryptocurrency);
      
      // Create deposit transaction
      const transaction = await Transaction.create({
        userId,
        type: 'DEPOSIT',
        amount,
        status: 'PENDING',
        description: `Deposit of ${amount} ${cryptocurrency}`,
        cryptocurrency,
        walletAddress: depositAddress,
        metadata: {
          paymentMethod,
          depositAddress,
          qrCodeData: `${cryptocurrency}:${depositAddress}?amount=${amount}`
        }
      });

      logger.info(`Deposit created: ${transaction.id} for user ${userId}, amount: ${amount} ${cryptocurrency}`);

      res.status(201).json({
        success: true,
        message: 'Deposit transaction created successfully',
        data: {
          transaction: {
            id: transaction.id,
            amount: transaction.amount,
            cryptocurrency: transaction.cryptocurrency,
            depositAddress,
            qrCodeData: transaction.metadata.qrCodeData,
            status: transaction.status,
            createdAt: transaction.createdAt
          }
        }
      });

    } catch (error) {
      logger.error('Create deposit error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during deposit creation'
      });
    }
  }

  // Create withdrawal transaction
  static async createWithdrawal(req, res) {
    try {
      const userId = req.user.id;
      const { amount, cryptocurrency, walletAddress } = req.body;

      // Validate amount
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid withdrawal amount'
        });
      }

      // Get user to check balance
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is not active'
        });
      }

      // Check if user has sufficient balance
      if (user.walletBalance < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance'
        });
      }

      // Check minimum withdrawal amount
      const minWithdrawal = 10; // $10 minimum
      if (amount < minWithdrawal) {
        return res.status(400).json({
          success: false,
          message: `Minimum withdrawal amount is $${minWithdrawal}`
        });
      }

      // Check if there are any pending withdrawals
      const pendingWithdrawal = await Transaction.findOne({
        where: {
          userId,
          type: 'WITHDRAWAL',
          status: 'PENDING'
        }
      });

      if (pendingWithdrawal) {
        return res.status(400).json({
          success: false,
          message: 'You have a pending withdrawal. Please wait for it to be processed.'
        });
      }

      // Calculate withdrawal fee (2% of amount)
      const feePercentage = 0.02;
      const fee = amount * feePercentage;
      const netAmount = amount - fee;

      // Create withdrawal transaction
      const transaction = await Transaction.create({
        userId,
        type: 'WITHDRAWAL',
        amount,
        status: 'PENDING',
        description: `Withdrawal of ${amount} ${cryptocurrency} to ${walletAddress}`,
        cryptocurrency,
        walletAddress,
        metadata: {
          fee,
          netAmount,
          feePercentage
        }
      });

      // Deduct amount from user balance immediately
      await user.update({
        walletBalance: user.walletBalance - amount
      });

      logger.info(`Withdrawal created: ${transaction.id} for user ${userId}, amount: ${amount} ${cryptocurrency}`);

      res.status(201).json({
        success: true,
        message: 'Withdrawal request submitted successfully',
        data: {
          transaction: {
            id: transaction.id,
            amount: transaction.amount,
            fee,
            netAmount,
            cryptocurrency: transaction.cryptocurrency,
            walletAddress: transaction.walletAddress,
            status: transaction.status,
            createdAt: transaction.createdAt
          }
        }
      });

    } catch (error) {
      logger.error('Create withdrawal error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during withdrawal creation'
      });
    }
  }

  // Confirm deposit (webhook handler)
  static async confirmDeposit(req, res) {
    try {
      const { transactionId, txHash, confirmations } = req.body;

      const transaction = await Transaction.findByPk(transactionId);
      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      if (transaction.type !== 'DEPOSIT') {
        return res.status(400).json({
          success: false,
          message: 'Invalid transaction type'
        });
      }

      if (transaction.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          message: 'Transaction is not pending'
        });
      }

      // Update transaction with confirmation details
      await transaction.update({
        status: 'COMPLETED',
        txHash,
        metadata: {
          ...transaction.metadata,
          confirmations,
          confirmedAt: new Date()
        }
      });

      // Update user balance and total deposit
      const user = await User.findByPk(transaction.userId);
      await user.update({
        walletBalance: parseFloat(user.walletBalance) + parseFloat(transaction.amount),
        totalDeposit: parseFloat(user.totalDeposit) + parseFloat(transaction.amount)
      });

      // Update user level based on total deposit
      const newLevel = TransactionController.calculateUserLevel(user.totalDeposit);
      if (newLevel !== user.currentLevel) {
        await user.update({ currentLevel: newLevel });
      }

      // Process referral commissions
      await TransactionController.processReferralCommissions(user.id, transaction.amount);

      logger.info(`Deposit confirmed: ${transaction.id}, amount: ${transaction.amount}`);

      res.json({
        success: true,
        message: 'Deposit confirmed successfully'
      });

    } catch (error) {
      logger.error('Confirm deposit error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get transaction statistics
  static async getTransactionStats(req, res) {
    try {
      const userId = req.user.id;

      // Get current month stats
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const stats = await Transaction.findAll({
        where: { userId },
        attributes: [
          'type',
          'status',
          [Transaction.sequelize.fn('SUM', Transaction.sequelize.col('amount')), 'total'],
          [Transaction.sequelize.fn('COUNT', Transaction.sequelize.col('id')), 'count']
        ],
        group: ['type', 'status']
      });

      // Get monthly stats
      const monthlyStats = await Transaction.findAll({
        where: {
          userId,
          createdAt: {
            [Op.gte]: startOfMonth
          }
        },
        attributes: [
          'type',
          [Transaction.sequelize.fn('SUM', Transaction.sequelize.col('amount')), 'total'],
          [Transaction.sequelize.fn('COUNT', Transaction.sequelize.col('id')), 'count']
        ],
        group: ['type']
      });

      // Format response
      const allTimeStats = stats.reduce((acc, stat) => {
        const key = `${stat.type}_${stat.status}`;
        acc[key] = {
          total: parseFloat(stat.dataValues.total) || 0,
          count: parseInt(stat.dataValues.count) || 0
        };
        return acc;
      }, {});

      const currentMonthStats = monthlyStats.reduce((acc, stat) => {
        acc[stat.type] = {
          total: parseFloat(stat.dataValues.total) || 0,
          count: parseInt(stat.dataValues.count) || 0
        };
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          allTime: allTimeStats,
          currentMonth: currentMonthStats
        }
      });

    } catch (error) {
      logger.error('Get transaction stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Helper methods
  static generateDepositAddress(cryptocurrency) {
    // Generate mock addresses for different cryptocurrencies
    const addresses = {
      BTC: '1' + crypto.randomBytes(16).toString('hex'),
      ETH: '0x' + crypto.randomBytes(20).toString('hex'),
      USDT: '0x' + crypto.randomBytes(20).toString('hex'),
      LTC: 'L' + crypto.randomBytes(16).toString('hex'),
      XRP: 'r' + crypto.randomBytes(16).toString('hex')
    };

    return addresses[cryptocurrency] || addresses.BTC;
  }

  static calculateUserLevel(totalDeposit) {
    if (totalDeposit >= 10000) return 5; // Diamond
    if (totalDeposit >= 5000) return 4;  // Platinum
    if (totalDeposit >= 2000) return 3;  // Gold
    if (totalDeposit >= 500) return 2;   // Silver
    return 1; // Bronze
  }

  static async processReferralCommissions(userId, depositAmount) {
    try {
      const user = await User.findByPk(userId);
      if (!user || !user.referredBy) return;

      // Level 1 referral (direct)
      const level1Referrer = await User.findByPk(user.referredBy);
      if (level1Referrer) {
        const level1Commission = TransactionController.calculateCommission(level1Referrer.currentLevel, depositAmount);
        
        if (level1Commission > 0) {
          await Transaction.create({
            userId: level1Referrer.id,
            type: 'REFERRAL_COMMISSION',
            amount: level1Commission,
            status: 'COMPLETED',
            description: `Level 1 referral commission from ${user.name}`,
            metadata: {
              referredUserId: userId,
              referredUserName: user.name,
              level: 1,
              depositAmount,
              commissionRate: TransactionController.getCommissionRate(level1Referrer.currentLevel)
            }
          });

          // Update referrer balance
          await level1Referrer.update({
            walletBalance: parseFloat(level1Referrer.walletBalance) + level1Commission
          });

          // Level 2 referral (indirect)
          if (level1Referrer.referredBy) {
            const level2Referrer = await User.findByPk(level1Referrer.referredBy);
            if (level2Referrer) {
              const level2Commission = level1Commission * 0.3; // 30% of level 1 commission

              await Transaction.create({
                userId: level2Referrer.id,
                type: 'REFERRAL_COMMISSION',
                amount: level2Commission,
                status: 'COMPLETED',
                description: `Level 2 referral commission from ${user.name}`,
                metadata: {
                  referredUserId: userId,
                  referredUserName: user.name,
                  level: 2,
                  depositAmount,
                  level1Commission,
                  commissionRate: 0.3
                }
              });

              // Update level 2 referrer balance
              await level2Referrer.update({
                walletBalance: parseFloat(level2Referrer.walletBalance) + level2Commission
              });
            }
          }
        }
      }

    } catch (error) {
      logger.error('Process referral commissions error:', error);
    }
  }

  static calculateCommission(userLevel, depositAmount) {
    const rate = TransactionController.getCommissionRate(userLevel);
    return depositAmount * rate;
  }

  static getCommissionRate(userLevel) {
    const rates = {
      1: 0.05, // Bronze: 5%
      2: 0.08, // Silver: 8%
      3: 0.12, // Gold: 12%
      4: 0.16, // Platinum: 16%
      5: 0.20  // Diamond: 20%
    };
    return rates[userLevel] || 0.05;
  }
}

module.exports = TransactionController;