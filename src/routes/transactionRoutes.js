const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { calculateReferralCommissions, checkMilestoneBonuses } = require('../jobs/cronJobs');
const logger = require('../utils/logger');

const router = express.Router();

// @route   GET /api/transaction/history
// @desc    Get transaction history (successful deposits and withdrawals only)
// @access  Private
router.get('/history', [
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

    // Get only COMPLETED deposits and withdrawals
    const filter = {
      userId: req.user.userId,
      type: { $in: ['DEPOSIT', 'WITHDRAWAL'] },
      status: 'COMPLETED'
    };

    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalTransactions = await Transaction.countDocuments(filter);
    const totalPages = Math.ceil(totalTransactions / limit);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: page,
          totalPages,
          totalTransactions,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });

  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transaction history',
      error: error.message,
    });
  }
});

// @route   GET /api/transaction/deposits
// @desc    Get deposit history (all statuses)
// @access  Private
router.get('/deposits', [
  auth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED']),
], async (req, res) => {
  try {
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

    const filter = {
      userId: req.user.userId,
      type: 'DEPOSIT'
    };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const deposits = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalDeposits = await Transaction.countDocuments(filter);
    const totalPages = Math.ceil(totalDeposits / limit);

    res.json({
      success: true,
      data: {
        deposits,
        pagination: {
          currentPage: page,
          totalPages,
          totalDeposits,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });

  } catch (error) {
    console.error('Get deposit history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching deposit history',
      error: error.message,
    });
  }
});

// @route   GET /api/transaction/withdrawals
// @desc    Get withdrawal history (all statuses)
// @access  Private
router.get('/withdrawals', [
  auth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED']),
], async (req, res) => {
  try {
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

    const filter = {
      userId: req.user.userId,
      type: 'WITHDRAWAL'
    };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const withdrawals = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalWithdrawals = await Transaction.countDocuments(filter);
    const totalPages = Math.ceil(totalWithdrawals / limit);

    res.json({
      success: true,
      data: {
        withdrawals,
        pagination: {
          currentPage: page,
          totalPages,
          totalWithdrawals,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });

  } catch (error) {
    console.error('Get withdrawal history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching withdrawal history',
      error: error.message,
    });
  }
});

// @route   GET /api/transactions
// @desc    Get user transactions with pagination and filtering
// @access  Private
router.get('/', [
  auth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('type').optional().isIn(['DEPOSIT', 'WITHDRAWAL', 'MILESTONE_BONUS']).withMessage('Invalid transaction type'),
  query('status').optional().isIn(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED']),
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

    // Build filter - Only show DEPOSIT, WITHDRAWAL, and MILESTONE_BONUS
    // Note: DAILY_EARNING and REFERRAL_COMMISSION are calculated per-second and added to balance automatically
    // so they shouldn't appear as individual transactions in history
    const filter = { 
      userId: req.user.userId,
      type: { $in: ['DEPOSIT', 'WITHDRAWAL', 'MILESTONE_BONUS'] }
    };
    
    // Allow override with query parameter (for backwards compatibility)
    if (req.query.type) {
      // Still filter to allowed types
      if (['DEPOSIT', 'WITHDRAWAL', 'MILESTONE_BONUS'].includes(req.query.type)) {
        filter.type = req.query.type;
      }
    }
    
    if (req.query.status) filter.status = req.query.status;

    // Get transactions with pagination
    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const totalTransactions = await Transaction.countDocuments(filter);
    const totalPages = Math.ceil(totalTransactions / limit);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: page,
          totalPages,
          totalTransactions,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });

  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transactions',
      error: error.message,
    });
  }
});

// @route   POST /api/transactions/deposit
// @desc    Create deposit transaction
// @access  Private
router.post('/deposit', [
  auth,
  body('amount')
    .isNumeric()
    .custom(value => {
      if (value < parseFloat(process.env.MIN_DEPOSIT_USD || 50)) {
        throw new Error(`Minimum deposit amount is $${process.env.MIN_DEPOSIT_USD || 50}`);
      }
      return true;
    }),
  body('cryptocurrency')
    .isIn(['BTC', 'ETH', 'USDT', 'SOL', 'LTC', 'BNB'])
    .withMessage('Invalid cryptocurrency'),
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

    const { amount, cryptocurrency } = req.body;

    // Create deposit transaction
    const transaction = new Transaction({
      userId: req.user.userId,
      type: 'DEPOSIT',
      amount: parseFloat(amount),
      cryptocurrency,
      description: `${cryptocurrency} deposit of $${amount}`,
      status: 'PENDING',
    });

    await transaction.save();

    logger.info(`Deposit transaction created: ${transaction._id} for user ${req.user.userId}`);

    res.status(201).json({
      success: true,
      message: 'Deposit transaction created successfully',
      data: { transaction },
    });

  } catch (error) {
    logger.error('Create deposit error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating deposit transaction',
    });
  }
});

// @route   POST /api/transactions/withdraw
// @desc    Create withdrawal transaction
// @access  Private
router.post('/withdraw', [
  auth,
  body('amount')
    .isNumeric()
    .custom(async (value, { req }) => {
      const user = await User.findById(req.user.userId);
      const withdrawAmount = parseFloat(value);
      const minWithdraw = parseFloat(process.env.MIN_WITHDRAWAL_USD || 10);
      
      if (withdrawAmount < minWithdraw) {
        throw new Error(`Minimum withdrawal amount is $${minWithdraw}`);
      }
      
      if (withdrawAmount > user.walletBalance) {
        throw new Error('Insufficient balance');
      }
      
      return true;
    }),
  body('cryptocurrency')
    .isIn(['BTC', 'ETH', 'USDT', 'SOL', 'LTC', 'BNB'])
    .withMessage('Invalid cryptocurrency'),
  body('walletAddress')
    .trim()
    .isLength({ min: 10 })
    .withMessage('Wallet address is required'),
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

    const { amount, cryptocurrency, walletAddress } = req.body;
    const user = await User.findById(req.user.userId);
    const withdrawAmount = parseFloat(amount);

    // Create withdrawal transaction
    const transaction = new Transaction({
      userId: req.user.userId,
      type: 'WITHDRAWAL',
      amount: withdrawAmount,
      cryptocurrency,
      walletAddress,
      description: `${cryptocurrency} withdrawal of $${withdrawAmount}`,
      status: 'PENDING',
    });

    await transaction.save();

    // Temporarily hold the funds (deduct from wallet balance)
    user.walletBalance -= withdrawAmount;
    await user.save();

    logger.info(`Withdrawal transaction created: ${transaction._id} for user ${req.user.userId}`);

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      data: { transaction },
    });

  } catch (error) {
    logger.error('Create withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating withdrawal transaction',
    });
  }
});

module.exports = router;