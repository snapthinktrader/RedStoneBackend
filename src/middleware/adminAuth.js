const User = require('../models/User');

const adminAuth = async (req, res, next) => {
    try {
        // Check if user is authenticated (should be handled by auth middleware first)
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Check if this is an admin token (separate from user accounts)
        if (req.user.type === 'admin' && req.user.role === 'admin') {
            // Admin token authenticated - no need to check database
            req.admin = {
                id: 'admin',
                username: req.user.username,
                role: 'admin',
                type: 'admin'
            };
            return next();
        }

        // Otherwise, check if user account has admin role
        // Make sure req.user.id exists before querying
        if (!req.user.id && !req.user.userId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid user token'
            });
        }

        const userId = req.user.id || req.user.userId;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user is admin
        if (user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin privileges required'
            });
        }

        // Add user details to request
        req.admin = user;
        next();
    } catch (error) {
        console.error('Admin auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during admin authentication',
            error: error.message
        });
    }
};

module.exports = adminAuth;