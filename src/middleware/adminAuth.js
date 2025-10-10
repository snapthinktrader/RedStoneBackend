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

        // Get user details
        const user = await User.findById(req.user.id);
        
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
            message: 'Server error during admin authentication'
        });
    }
};

module.exports = adminAuth;