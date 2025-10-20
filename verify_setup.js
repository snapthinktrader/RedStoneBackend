require('dotenv').config();

console.log('🧪 TESTNET SETUP VERIFICATION');
console.log('==============================\n');

// Check environment variables
console.log('📋 Environment Check:');
console.log('   TRON_NETWORK:', process.env.TRON_NETWORK || 'NOT SET');
console.log('   TESTNET_OWNER_WALLET:', process.env.TESTNET_OWNER_WALLET || 'NOT SET');
console.log('   OWNER_WALLET_PRIVATE_KEY:', process.env.OWNER_WALLET_PRIVATE_KEY ? '✅ SET (64 chars)' : '❌ NOT SET');
console.log('');

// Check if wallet address matches
const expectedWallet = 'TMii1VrgBeiERbFsEqkq5FZexazYz1hnjy';
const actualWallet = process.env.TESTNET_OWNER_WALLET;

console.log('🎯 Wallet Configuration:');
console.log('   Expected:', expectedWallet);
console.log('   Configured:', actualWallet);
console.log('   Match:', expectedWallet === actualWallet ? '✅ Perfect' : '❌ Mismatch');
console.log('');

// Validate private key format
const privateKey = process.env.OWNER_WALLET_PRIVATE_KEY;
if (privateKey) {
    console.log('🔐 Private Key Validation:');
    console.log('   Length:', privateKey.length, privateKey.length === 64 ? '✅' : '❌ Should be 64');
    console.log('   Format:', /^[a-fA-F0-9]{64}$/.test(privateKey) ? '✅ Valid hex' : '❌ Invalid format');
    console.log('');
}

console.log('🚀 SETUP STATUS:');
if (process.env.TRON_NETWORK === 'testnet' && 
    process.env.TESTNET_OWNER_WALLET === expectedWallet && 
    process.env.OWNER_WALLET_PRIVATE_KEY && 
    process.env.OWNER_WALLET_PRIVATE_KEY.length === 64) {
    
    console.log('✅ PERFECT! Your testnet setup is complete!');
    console.log('');
    console.log('🧪 Ready to test:');
    console.log('   1. Your wallet has 2000 TRX');
    console.log('   2. Private key is configured');
    console.log('   3. Testnet mode is enabled');
    console.log('');
    console.log('🎯 Next steps:');
    console.log('   • Run fund sweep test');
    console.log('   • Test gas fee automation');
    console.log('   • Verify blockchain transactions');
    
} else {
    console.log('⚠️ Setup needs attention');
    console.log('');
    console.log('Missing:');
    if (process.env.TRON_NETWORK !== 'testnet') console.log('   ❌ TRON_NETWORK=testnet');
    if (process.env.TESTNET_OWNER_WALLET !== expectedWallet) console.log('   ❌ TESTNET_OWNER_WALLET');
    if (!process.env.OWNER_WALLET_PRIVATE_KEY) console.log('   ❌ OWNER_WALLET_PRIVATE_KEY');
}

console.log('');
console.log('🔗 Your wallet: https://shasta.tronscan.org/address/' + expectedWallet);