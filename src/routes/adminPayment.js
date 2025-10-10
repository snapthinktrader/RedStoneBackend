const express = require('express');
const AdminPaymentController = require('../controllers/adminPaymentController');
const { auth } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');

const router = express.Router();

// All admin routes require authentication and admin privileges
router.use(auth);
router.use(adminAuth);

// Validation middleware
const approveWithdrawalValidation = [
    param('withdrawalId').isMongoId().withMessage('Invalid withdrawal ID'),
    body('adminNotes')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Admin notes cannot exceed 1000 characters'),
    body('fromAddress')
        .optional()
        .isLength({ min: 40, max: 42 })
        .withMessage('Invalid from address format'),
];

const rejectWithdrawalValidation = [
    param('withdrawalId').isMongoId().withMessage('Invalid withdrawal ID'),
    body('rejectionReason')
        .notEmpty()
        .withMessage('Rejection reason is required')
        .isLength({ max: 500 })
        .withMessage('Rejection reason cannot exceed 500 characters'),
    body('adminNotes')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Admin notes cannot exceed 1000 characters'),
];

const signedTransactionValidation = [
    param('withdrawalId').isMongoId().withMessage('Invalid withdrawal ID'),
    body('signedTransaction')
        .notEmpty()
        .withMessage('Signed transaction is required')
        .isHexadecimal()
        .withMessage('Signed transaction must be a valid hex string'),
];

const withdrawalIdValidation = [
    param('withdrawalId').isMongoId().withMessage('Invalid withdrawal ID'),
];

// Withdrawal management routes
router.get('/withdrawals/pending', 
    AdminPaymentController.getPendingWithdrawals
);

router.get('/withdrawals', 
    AdminPaymentController.getAllWithdrawals
);

router.post('/withdrawals/:withdrawalId/approve', 
    approveWithdrawalValidation, 
    validate, 
    AdminPaymentController.approveWithdrawal
);

router.post('/withdrawals/:withdrawalId/reject', 
    rejectWithdrawalValidation, 
    validate, 
    AdminPaymentController.rejectWithdrawal
);

router.post('/withdrawals/:withdrawalId/sign', 
    signedTransactionValidation, 
    validate, 
    AdminPaymentController.submitSignedTransaction
);

router.post('/withdrawals/:withdrawalId/broadcast', 
    withdrawalIdValidation, 
    validate, 
    AdminPaymentController.broadcastTransaction
);

// Deposit monitoring routes
router.get('/deposits/summary', 
    AdminPaymentController.getDepositSummary
);

router.post('/deposits/monitor', 
    AdminPaymentController.runDepositMonitoring
);

// HD Wallet and Fund Sweep routes
router.get('/hdwallet/summary',
    AdminPaymentController.getHDWalletSummary
);

router.post('/hdwallet/sweep',
    AdminPaymentController.runFundSweep
);

// Stuck Fund Management routes
router.get('/hdwallet/stuck-funds',
    AdminPaymentController.findStuckFunds
);

router.post('/hdwallet/emergency-recovery',
    AdminPaymentController.emergencyRecovery
);

router.post('/hdwallet/bulk-recovery',
    AdminPaymentController.bulkRecoveryStuckFunds
);

module.exports = router;