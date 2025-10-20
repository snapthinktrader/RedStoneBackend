const express = require('express');
const router = express.Router();

// Simple test route to ensure the module works
router.get('/status', (req, res) => {
    res.json({
        success: true,
        message: 'Auto-sweep service is available',
        status: 'ready'
    });
});

// Create a simple auto-sweep service placeholder
const autoSweepService = {
    getStatus: () => ({ isRunning: false, checkInterval: 30 }),
    start: () => console.log('Auto-sweep service started'),
    stop: () => console.log('Auto-sweep service stopped')
};

module.exports = { router, autoSweepService };