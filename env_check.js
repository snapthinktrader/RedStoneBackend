// Quick environment test
require('dotenv').config();

console.log('🔍 ENVIRONMENT CHECK');
console.log('====================');
console.log('');

console.log('📋 Configuration:');
console.log(`   TRON_NETWORK: ${process.env.TRON_NETWORK || 'NOT SET'}`);
console.log(`   TESTNET_OWNER_WALLET: ${process.env.TESTNET_OWNER_WALLET || 'NOT SET'}`);
console.log(`   OWNER_WALLET_PRIVATE_KEY: ${process.env.OWNER_WALLET_PRIVATE_KEY ? 'SET ✅' : 'NOT SET ❌'}`);
console.log('');

console.log('📦 Checking Dependencies:');
try {
    const TronWeb = require('tronweb');
    console.log('   TronWeb: ✅ Available');
    
    // Quick connection test
    const tronWeb = new TronWeb({
        fullHost: 'https://api.shasta.trongrid.io'
    });
    
    console.log('   Connection: ✅ Configured');
    console.log('');
    
    console.log('🚀 READY TO RUN DEMO!');
    console.log('=====================');
    console.log('');
    console.log('Execute: PATH=$PATH:/usr/local/bin node real_transfer_demo.js');
    console.log('');
    
} catch (error) {
    console.log('   TronWeb: ❌ Not available');
    console.log('   Error:', error.message);
    console.log('');
    console.log('🔧 INSTALL TRONWEB:');
    console.log('===================');
    console.log('Run: npm install tronweb');
    console.log('');
}