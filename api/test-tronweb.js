// Test if TronWeb is available on Vercel
const { TronWeb } = require('tronweb');

module.exports = (req, res) => {
    try {
        const tronWeb = new TronWeb({
            fullHost: 'https://api.trongrid.io'
        });
        
        // Test address generation
        const testPrivateKey = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
        const testAddress = tronWeb.address.fromPrivateKey(testPrivateKey);
        
        res.json({
            success: true,
            message: 'TronWeb test successful',
            data: {
                tronWebAvailable: !!tronWeb,
                testAddress: testAddress,
                isValidAddress: tronWeb.isAddress(testAddress),
                addressStartsWithT: testAddress.startsWith('T'),
                addressLength: testAddress.length,
                nodeVersion: process.version,
                environment: process.env.NODE_ENV || 'development'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'TronWeb test failed',
            error: error.message,
            stack: error.stack
        });
    }
};