const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided or invalid format.',
      });
    }

    // Extract token
    const token = authHeader.replace('Bearer ', '');

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. User not found.',
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Account is deactivated.',
      });
    }

    // Add user info to request
    req.user = {
      userId: user._id,
      email: user.email,
      name: user.name,
      currentLevel: user.currentLevel,
      isVerified: user.isVerified,
    };

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token.',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Token expired.',
      });
    }

    logger.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication.',
    });
  }
};

// Middleware to check if user is verified
const requireVerified = (req, res, next) => {
  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Email verification required to access this resource.',
    });
  }
  next();
};

// Middleware to check minimum level requirement
const requireLevel = (minLevel) => {
  return (req, res, next) => {
    if (req.user.currentLevel < minLevel) {
      return res.status(403).json({
        success: false,
        message: `Minimum level ${minLevel} required to access this resource.`,
      });
    }
    next();
  };
};

// Middleware for admin only routes
const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    // Check if user is admin (you can define admin logic here)
    // For now, let's use email check
    if (user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
    }

    req.user.isAdmin = true;
    next();

  } catch (error) {
    logger.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during admin verification.',
    });
  }
};

module.exports = {
  auth,
  requireVerified,
  requireLevel,
  requireAdmin,
};