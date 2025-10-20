// HD Wallet Balance Checker - Real-time monitoring
require('dotenv').config();

async function checkHDWalletBalance() {
    console.log('🔍 HD WALLET BALANCE MONITOR');
    console.log('============================');
    console.log('');
    
    try {
        const TronWebModule = require('tronweb');
        const TronWeb = TronWebModule.TronWeb || TronWebModule.default.TronWeb;
        
        const tronWeb = new TronWeb({
            fullHost: 'https://api.shasta.trongrid.io'
        });
        
        const hdWallet = 'THWMmoeTFSwD1NjeVGjYTjiBCs2zZ8Jx36';
        const mainWallet = process.env.TESTNET_OWNER_WALLET;
        
        console.log('📋 Monitoring Wallets:');
        console.log(`   HD Wallet: ${hdWallet}`);
        console.log(`   Main Wallet: ${mainWallet}`);
        console.log('');
        
        // Check balances multiple times to catch incoming transactions
        for (let i = 1; i <= 5; i++) {
            console.log(`🔄 Check #${i}/5:`);
            
            const hdBalance = await tronWeb.trx.getBalance(hdWallet);
            const mainBalance = await tronWeb.trx.getBalance(mainWallet);
            
            console.log(`   HD Wallet: ${tronWeb.fromSun(hdBalance)} TRX`);
            console.log(`   Main Wallet: ${tronWeb.fromSun(mainBalance)} TRX`);
            
            if (hdBalance > 0) {
                console.log('');
                console.log('✅ FUNDS DETECTED IN HD WALLET!');
                console.log(`   Amount: ${tronWeb.fromSun(hdBalance)} TRX`);
                console.log('');
                console.log('🚀 Ready for auto-sweep!');
                console.log('   Run: PATH=$PATH:/usr/local/bin node hd_auto_sweep_demo.js');
                return;
            }
            
            if (i < 5) {
                console.log('   ⏳ Waiting 10 seconds for transaction confirmation...');
                console.log('');
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
        
        console.log('');
        console.log('⚠️  No funds detected after 5 checks');
        console.log('');
        console.log('💡 Possible reasons:');
        console.log('   - Transaction still being confirmed (can take 1-3 minutes)');
        console.log('   - Sent to wrong address');
        console.log('   - Network congestion');
        console.log('');
        console.log('🔗 Check transaction status:');
        console.log(`   Wallet: ${hdWallet}`);
        console.log('   Explorer: https://shasta.tronscan.org/#/address/' + hdWallet);
        
    } catch (error) {
        console.error('❌ Balance check failed:', error.message);
    }
}

checkHDWalletBalance();