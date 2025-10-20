const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { auth } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Apply authentication middleware to all admin routes
router.use(auth);
router.use(adminAuth);

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ createdAt: -1 });
    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// Get user by ID
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id, '-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
});

// Add manual credit to user
router.post('/users/:id/credit', async (req, res) => {
  try {
    const { amount, reason, description } = req.body;
    
    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }
    
    // Find user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Determine transaction type based on reason
    let transactionType = 'MANUAL_CREDIT';
    if (reason === 'Promotional Bonus') {
      transactionType = 'PROMOTIONAL_BONUS';
    } else if (reason === 'Support Credit') {
      transactionType = 'SUPPORT_CREDIT';
    } else if (reason === 'Referral Bonus') {
      transactionType = 'REFERRAL_COMMISSION';
    }
    
    // Create transaction record
    const transaction = new Transaction({
      userId: user._id,
      type: transactionType,
      amount: parseFloat(amount),
      status: 'COMPLETED',
      description: description || `Admin credit: ${reason}`,
      processedAt: new Date(),
      metadata: {
        addedBy: 'admin',
        reason: reason,
        timestamp: new Date().toISOString()
      }
    });
    
    await transaction.save();
    
    // Update user balance
    user.walletBalance += parseFloat(amount);
    
    // Update total deposit if it's promotional/deposit related
    if (transactionType === 'PROMOTIONAL_BONUS' || transactionType === 'MANUAL_CREDIT') {
      user.totalDeposit = (user.totalDeposit || 0) + parseFloat(amount);
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: `Successfully added $${amount} to ${user.name}'s account`,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          walletBalance: user.walletBalance,
          totalDeposit: user.totalDeposit
        },
        transaction: transaction
      }
    });
  } catch (error) {
    console.error('Error adding manual credit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add credit',
      error: error.message
    });
  }
});

// Add admin deposit (simulates real deposit + triggers referral commissions)
router.post('/users/:id/deposit', async (req, res) => {
  const mongoose = require('mongoose');
  const session = await mongoose.startSession();
  
  try {
    const { amount, description } = req.body;
    
    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }
    
    // Find user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    let commissionsCreated = [];
    
    await session.withTransaction(async () => {
      // Create DEPOSIT transaction
      const depositTransaction = new Transaction({
        userId: user._id,
        type: 'DEPOSIT',
        amount: parseFloat(amount),
        status: 'COMPLETED',
        description: description || `Admin deposit`,
        processedAt: new Date(),
        metadata: {
          addedBy: 'admin',
          isAdminDeposit: true,  // Mark as admin deposit
          timestamp: new Date().toISOString()
        }
      });
      
      await depositTransaction.save({ session });
      
      // Update user balance and total deposit
      user.walletBalance += parseFloat(amount);
      user.totalDeposit = (user.totalDeposit || 0) + parseFloat(amount);
      await user.save({ session });
      
      // Calculate referral commissions if user was referred
      if (user.referredBy) {
        // Level 1 Referral (Direct)
        const level1Referrer = await User.findById(user.referredBy).session(session);
        if (level1Referrer && level1Referrer.isActive) {
          const level1Commission = parseFloat(amount) * level1Referrer.getCommissionRate();
          
          const level1Transaction = new Transaction({
            userId: level1Referrer._id,
            type: 'REFERRAL_COMMISSION',
            amount: level1Commission,
            status: 'COMPLETED',
            description: `Level 1 referral commission from ${user.name}`,
            metadata: {
              refereeId: user._id,
              refereeName: user.name,
              depositAmount: parseFloat(amount),
              level: 1,
              isFromAdminDeposit: true  // Mark that this came from admin deposit
            },
            processedAt: new Date(),
          });
          
          await level1Transaction.save({ session });
          
          level1Referrer.walletBalance += level1Commission;
          await level1Referrer.save({ session });
          
          commissionsCreated.push({
            level: 1,
            userId: level1Referrer._id,
            userName: level1Referrer.name,
            amount: level1Commission
          });
          
          // Level 2 Referral (Indirect) - 30% of level 1 commission
          if (level1Referrer.referredBy) {
            const level2Referrer = await User.findById(level1Referrer.referredBy).session(session);
            if (level2Referrer && level2Referrer.isActive) {
              const level2Commission = level1Commission * 0.3; // 30% of level 1
              
              const level2Transaction = new Transaction({
                userId: level2Referrer._id,
                type: 'REFERRAL_COMMISSION',
                amount: level2Commission,
                status: 'COMPLETED',
                description: `Level 2 referral commission from ${user.name}`,
                metadata: {
                  refereeId: user._id,
                  refereeName: user.name,
                  depositAmount: parseFloat(amount),
                  level: 2,
                  isFromAdminDeposit: true  // Mark that this came from admin deposit
                },
                processedAt: new Date(),
              });
              
              await level2Transaction.save({ session });
              
              level2Referrer.walletBalance += level2Commission;
              await level2Referrer.save({ session });
              
              commissionsCreated.push({
                level: 2,
                userId: level2Referrer._id,
                userName: level2Referrer.name,
                amount: level2Commission
              });
            }
          }
        }
      }
    });
    
    await session.endSession();
    
    res.json({
      success: true,
      message: `Successfully added deposit of $${amount} to ${user.name}'s account`,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          walletBalance: user.walletBalance,
          totalDeposit: user.totalDeposit
        },
        commissions: commissionsCreated
      }
    });
  } catch (error) {
    await session.endSession();
    console.error('Error adding admin deposit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add deposit',
      error: error.message
    });
  }
});

// Update user status
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isVerified: status === 'active' },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: `User ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
      data: user
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
});

// Get all transactions
router.get('/transactions', async (req, res) => {
  try {
    console.log('Fetching transactions, req.user:', req.user);
    console.log('Fetching transactions, req.admin:', req.admin);
    
    const transactions = await Transaction.find({})
      .populate('userId', 'firstName lastName fullName email')
      .sort({ createdAt: -1 });
    
    console.log('Transactions fetched:', transactions.length);
    
    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
});

// Get transaction by ID
router.get('/transactions/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('userId', 'firstName lastName fullName email');
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction'
    });
  }
});

// Update transaction status
router.patch('/transactions/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      { 
        status: status.toUpperCase(),
        processedAt: status.toUpperCase() === 'COMPLETED' ? new Date() : null
      },
      { new: true }
    ).populate('userId', 'firstName lastName fullName email');
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    res.json({
      success: true,
      message: `Transaction ${status.toLowerCase()} successfully`,
      data: transaction
    });
  } catch (error) {
    console.error('Error updating transaction status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transaction status'
    });
  }
});

// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalTransactions,
      pendingTransactions,
      completedDeposits,
      completedWithdrawals
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVerified: true }),
      Transaction.countDocuments(),
      Transaction.countDocuments({ status: 'PENDING' }),
      Transaction.find({ type: 'DEPOSIT', status: 'COMPLETED' }),
      Transaction.find({ type: 'WITHDRAWAL', status: 'COMPLETED' })
    ]);

    const totalDeposits = completedDeposits.reduce((sum, tx) => sum + tx.amount, 0);
    const totalWithdrawals = completedWithdrawals.reduce((sum, tx) => sum + tx.amount, 0);
    const totalRevenue = totalDeposits * 0.1; // 10% platform fee

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        totalTransactions,
        pendingTransactions,
        totalDeposits,
        totalWithdrawals,
        totalRevenue
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
});

// Get system settings
router.get('/settings', async (req, res) => {
  try {
    // For now, return default settings
    // In production, store these in database
    const settings = {
      platform: {
        name: 'RedStone Investment',
        version: '1.0.0',
        maintenanceMode: false,
        registrationEnabled: true,
        minDeposit: 100,
        maxDeposit: 10000,
        minWithdrawal: 50,
        maxWithdrawal: 5000,
        dailyROI: 2.0,
        platformFee: 10.0,
      },
      referral: {
        level1Commission: 5.0,
        level2Commission: 3.0,
        level3Commission: 1.0,
        bonusThreshold: 10,
        bonusAmount: 100,
      },
      security: {
        twoFactorRequired: false,
        sessionTimeout: 3600,
        maxLoginAttempts: 5,
        passwordMinLength: 8,
      },
      email: {
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpUsername: 'noreply@redstone.com',
        emailVerificationRequired: true,
      }
    };

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
});

// Update system settings
router.put('/settings', async (req, res) => {
  try {
    const { settings } = req.body;
    
    // In production, save to database
    console.log('Updating system settings:', settings);
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: settings
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
});

module.exports = router;