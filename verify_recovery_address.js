require('dotenv').config();
const AutoFundTransferService = require('./src/services/AutoFundTransferService');
const CompleteAutoSweepService = require('./src/services/CompleteAutoSweepService');

console.log('\n🔍 VERIFYING TRX RECOVERY DESTINATION');
console.log('═══════════════════════════════════════════════════════');

console.log('\n📋 Environment Variables:');
console.log(`FUEL_WALLET_ADDRESS: ${process.env.FUEL_WALLET_ADDRESS}`);
console.log(`MAIN_WALLET_ADDRESS: ${process.env.MAIN_WALLET_ADDRESS || 'NOT SET (uses default)'}`);

console.log('\n🔧 AutoFundTransferService:');
const autoFundTransfer = new AutoFundTransferService();
console.log(`fuelWalletAddress: ${autoFundTransfer.fuelWalletAddress}`);

console.log('\n🤖 CompleteAutoSweepService:');
const completeAutoSweep = new CompleteAutoSweepService();
console.log(`autoFundTransfer.fuelWalletAddress: ${completeAutoSweep.autoFundTransfer.fuelWalletAddress}`);
console.log(`usdtSweepService.mainWalletAddress: ${completeAutoSweep.usdtSweepService.mainWalletAddress}`);

console.log('\n✅ VERIFICATION RESULTS:');
console.log('═══════════════════════════════════════════════════════');

const fuelWallet = completeAutoSweep.autoFundTransfer.fuelWalletAddress;
const mainWallet = completeAutoSweep.usdtSweepService.mainWalletAddress;

console.log(`\n💰 USDT Sweep Destination: ${mainWallet}`);
console.log(`🔄 TRX Recovery Destination: ${fuelWallet}`);

if (fuelWallet === 'T9yPwwZiMbcLuhKWUtHwqLEoqqvm4S9mYJ') {
    console.log('\n✅ ✅ ✅ CORRECT! TRX will be recovered to FUEL wallet!');
} else {
    console.log(`\n❌ ❌ ❌ WRONG! TRX recovery address is: ${fuelWallet}`);
    console.log(`Should be: T9yPwwZiMbcLuhKWUtHwqLEoqqvm4S9mYJ`);
}

if (mainWallet === 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu') {
    console.log('✅ ✅ ✅ CORRECT! USDT will be swept to MAIN wallet!');
} else {
    console.log(`❌ ❌ ❌ WRONG! USDT sweep address is: ${mainWallet}`);
    console.log(`Should be: TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu`);
}

if (fuelWallet !== mainWallet) {
    console.log('✅ ✅ ✅ CORRECT! Fuel and Main wallets are different!');
} else {
    console.log('❌ ❌ ❌ WRONG! Fuel and Main wallets are the same!');
}

console.log('\n═══════════════════════════════════════════════════════\n');
