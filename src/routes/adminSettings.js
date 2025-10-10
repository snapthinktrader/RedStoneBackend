const express = require('express');
const router = express.Router();
const AdminSettingsController = require('../controllers/AdminSettingsController');
const { auth } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

/**
 * Admin Settings Routes
 * All routes require admin authentication
 */

// Apply admin authentication to all routes
router.use(auth);
router.use(adminAuth);

// Get current admin settings
router.get('/',
    AdminSettingsController.getSettings
);

// Initialize default settings
router.post('/initialize',
    AdminSettingsController.initializeSettings
);

// Update main wallet address
router.put('/main-wallet',
    AdminSettingsController.updateMainWallet
);

// Update admin credentials (email/password)
router.put('/credentials',
    AdminSettingsController.updateAdminCredentials
);

// Update system settings
router.put('/system',
    AdminSettingsController.updateSystemSettings
);

// Update email settings
router.put('/email',
    AdminSettingsController.updateEmailSettings
);

// Test main wallet connection
router.get('/test-wallet',
    AdminSettingsController.testMainWallet
);

// Get settings audit log
router.get('/audit-log',
    AdminSettingsController.getAuditLog
);

module.exports = router;