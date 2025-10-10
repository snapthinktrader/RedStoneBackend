const express = require('express');
const PaymentController = require('../controllers/paymentController');
const { auth } = require('../middleware/auth');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');

const router = express.Router();

// Validation middleware
const createDepositValidation = [
    body('amount')
        .isFloat({ min: 0.01 })
        .withMessage('Amount must be greater than 0'),
    body('network')
        .optional()
        .isIn(['ethereum', 'bsc', 'polygon', 'tron'])
        .withMessage('Invalid network. Supported: ethereum, bsc, polygon, tron'),
];

const createWithdrawalValidation = [
    body('amount')
        .isFloat({ min: 10 })
        .withMessage('Amount must be at least $10 USDT'),
    body('toAddress')
        .notEmpty()
        .withMessage('Withdrawal address is required')
        .isLength({ min: 40, max: 42 })
        .withMessage('Invalid address format'),
    body('network')
        .optional()
        .isIn(['ethereum', 'bsc', 'polygon', 'tron'])
        .withMessage('Invalid network. Supported: ethereum, bsc, polygon, tron'),
    body('userNotes')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Notes cannot exceed 500 characters'),
];

const idValidation = [
    param('depositId').isMongoId().withMessage('Invalid deposit ID'),
];

const withdrawalIdValidation = [
    param('withdrawalId').isMongoId().withMessage('Invalid withdrawal ID'),
];

// Deposit routes
router.post('/deposits', 
    auth, 
    createDepositValidation, 
    validate, 
    PaymentController.createDeposit
);

router.get('/deposits/:depositId', 
    auth, 
    idValidation, 
    validate, 
    PaymentController.getDepositStatus
);

router.get('/deposits', 
    auth, 
    PaymentController.getDepositHistory
);

router.post('/deposits/:depositId/check', 
    auth, 
    idValidation, 
    validate, 
    PaymentController.checkDepositManually
);

router.post('/deposits/:depositId/sweep', 
    auth, 
    idValidation, 
    validate, 
    PaymentController.checkAndSweepDeposit
);

router.delete('/deposits/:depositId/cancel', 
    auth, 
    idValidation, 
    validate, 
    PaymentController.cancelDeposit
);

// Withdrawal routes
router.post('/withdrawals', 
    auth, 
    createWithdrawalValidation, 
    validate, 
    PaymentController.createWithdrawal
);

router.get('/withdrawals/:withdrawalId', 
    auth, 
    withdrawalIdValidation, 
    validate, 
    PaymentController.getWithdrawalStatus
);

router.get('/withdrawals', 
    auth, 
    PaymentController.getWithdrawalHistory
);

module.exports = router;