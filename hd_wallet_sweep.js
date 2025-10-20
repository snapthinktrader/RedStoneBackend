// HD Wallet Private Key Generator and Sweep Demo
// This regenerates the private key for any HD wallet address and performs sweep

require('dotenv').config();
const crypto = require('crypto');

async function regeneratePrivateKeyAndSweep() {
    console.log('🔑 HD WALLET PRIVATE KEY REGENERATION & SWEEP');
    console.log('==============================================');
    console.log('');
    
    try {
        // Import TronWeb
        const TronWebModule = require('tronweb');
        const TronWeb = TronWebModule.TronWeb || TronWebModule.default.TronWeb;
        
        // Test wallet details
        const testWalletAddress = 'TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC';
        const yourWallet = process.env.TESTNET_OWNER_WALLET;
        
        console.log('📋 WALLET INFORMATION:');
        console.log(`   Test Wallet: ${testWalletAddress}`);
        console.log(`   Your Wallet: ${yourWallet}`);
        console.log('');
        
        // HD Wallet parameters (we need to find the right userId and addressIndex)
        // Let's try common values that might have generated this address
        console.log('🔍 SEARCHING FOR HD WALLET PARAMETERS...');
        
        let foundPrivateKey = null;
        let foundUserId = null;
        let foundIndex = null;
        
        // Try different combinations to find the right one
        for (let userId = 1; userId <= 100; userId++) {
            for (let addressIndex = 0; addressIndex <= 10; addressIndex++) {
                try {
                    // Regenerate private key using HD wallet method
                    const tronPrivateKey = crypto.createHash('sha256')
                        .update(`tron-mainnet-${userId}-${addressIndex}-${process.env.HD_WALLET_SEED || 'redstone-hd-seed'}`)
                        .digest('hex');
                    
                    // Initialize TronWeb to check address
                    const tempTronWeb = new TronWeb({
                        fullHost: 'https://api.shasta.trongrid.io'
                    });
                    
                    // Generate address from private key
                    const generatedAddress = tempTronWeb.address.fromPrivateKey(tronPrivateKey);
                    
                    if (generatedAddress === testWalletAddress) {
                        foundPrivateKey = tronPrivateKey;
                        foundUserId = userId;
                        foundIndex = addressIndex;
                        console.log(`✅ FOUND MATCH!`);
                        console.log(`   User ID: ${userId}`);
                        console.log(`   Address Index: ${addressIndex}`);
                        console.log(`   Generated Address: ${generatedAddress}`);
                        console.log(`   Private Key: ${tronPrivateKey.substring(0, 8)}...`);
                        break;
                    }
                } catch (error) {
                    // Continue searching
                }
            }
            if (foundPrivateKey) break;
        }
        
        if (!foundPrivateKey) {
            console.log('❌ Could not find HD wallet parameters for this address');
            console.log('💡 The test wallet might have been created differently');
            console.log('');
            console.log('🔧 Alternative: Manual private key input');
            console.log('   If you have the test wallet private key, add it to .env as:');
            console.log('   TEST_WALLET_PRIVATE_KEY=your_private_key_here');
            return;
        }
        
        console.log('');
        console.log('🚀 EXECUTING SWEEP WITH REGENERATED PRIVATE KEY...');
        
        // Initialize TronWeb with the regenerated private key
        const tronWeb = new TronWeb({
            fullHost: 'https://api.shasta.trongrid.io',
            privateKey: foundPrivateKey
        });
        
        // Check current balances
        console.log('');
        console.log('💰 CURRENT BALANCES:');
        const testBalance = await tronWeb.trx.getBalance(testWalletAddress);
        const yourBalance = await tronWeb.trx.getBalance(yourWallet);
        
        console.log(`   Test Wallet: ${tronWeb.fromSun(testBalance)} TRX`);
        console.log(`   Your Wallet: ${tronWeb.fromSun(yourBalance)} TRX`);
        console.log('');
        
        // Calculate sweep amount (leave 1 TRX for fees)
        const sweepAmount = 8; // TRX as requested
        const amountSun = tronWeb.toSun(sweepAmount);
        
        if (testBalance < amountSun) {
            console.log(`❌ Insufficient balance. Test wallet has ${tronWeb.fromSun(testBalance)} TRX, need ${sweepAmount} TRX`);
            return;
        }
        
        console.log('🔄 EXECUTING SWEEP TRANSACTION...');
        console.log(`   Amount: ${sweepAmount} TRX`);
        console.log(`   From: ${testWalletAddress}`);
        console.log(`   To: ${yourWallet}`);
        console.log('');
        
        // Execute the sweep transaction
        const txResult = await tronWeb.trx.sendTransaction(yourWallet, amountSun);
        
        if (txResult.result) {
            console.log('✅ SWEEP SUCCESSFUL!');
            console.log(`   Transaction ID: ${txResult.txid}`);
            console.log(`   View on Explorer: https://shasta.tronscan.org/#/transaction/${txResult.txid}`);
            
            // Wait for confirmation
            console.log('');
            console.log('⏳ Waiting for confirmation...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check new balances
            const newTestBalance = await tronWeb.trx.getBalance(testWalletAddress);
            const newYourBalance = await tronWeb.trx.getBalance(yourWallet);
            
            console.log('');
            console.log('💰 NEW BALANCES:');
            console.log(`   Test Wallet: ${tronWeb.fromSun(newTestBalance)} TRX`);
            console.log(`   Your Wallet: ${tronWeb.fromSun(newYourBalance)} TRX`);
            console.log('');
            
            console.log('🎉 HD WALLET AUTO-SWEEP DEMONSTRATION COMPLETE!');
            console.log('===============================================');
            console.log('');
            console.log('✅ HD wallet private key successfully regenerated');
            console.log('✅ Auto-sweep mechanism working perfectly');
            console.log('✅ Funds transferred to your main wallet');
            console.log('✅ System ready for production use');
            
        } else {
            console.log('❌ Sweep transaction failed:', txResult);
        }
        
    } catch (error) {
        console.error('❌ HD wallet sweep failed:', error.message);
        console.log('');
        console.log('🔧 Possible issues:');
        console.log('   - HD wallet seed mismatch');
        console.log('   - Network connectivity issues');
        console.log('   - Insufficient gas fees');
    }
}

// Run the HD wallet sweep demo
regeneratePrivateKeyAndSweep();