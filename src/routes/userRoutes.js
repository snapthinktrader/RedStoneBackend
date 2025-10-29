const express = require('express');
const { body, validationResult } = require('express-validator');
const UserController = require('../controllers/userController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', auth, UserController.getProfile);

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', [
  auth,
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
], UserController.updateProfile);

// @route   GET /api/users/dashboard
// @desc    Get user dashboard data
// @access  Private
router.get('/dashboard', auth, UserController.getDashboard);

// @route   GET /api/users/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', auth, UserController.getStats);

// @route   PUT /api/users/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', [
  auth,
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long'),
], UserController.changePassword);

// @route   PUT /api/users/toggle-2fa
// @desc    Enable/disable two-factor authentication
// @access  Private
router.put('/toggle-2fa', auth, UserController.toggleTwoFactor);

// @route   GET /api/users/settings
// @desc    Get user settings
// @access  Private
router.get('/settings', auth, UserController.getSettings);

// @route   PUT /api/users/settings
// @desc    Update user settings
// @access  Private
router.put('/settings', auth, UserController.updateSettings);

// @route   GET /api/users/milestones
// @desc    Get user's milestone progress (dual-track system)
// @access  Private
router.get('/milestones', auth, UserController.getMilestones);

// @route   POST /api/users/claim-milestone
// @desc    Claim milestone bonus
// @access  Private
router.post('/claim-milestone', [
  auth,
  body('track')
    .isIn(['lower', 'upper'])
    .withMessage('Track must be either "lower" or "upper"'),
  body('milestoneCount')
    .isInt({ min: 1 })
    .withMessage('Milestone count must be a positive integer'),
], UserController.claimMilestone);

module.exports = router;