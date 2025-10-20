// HD Wallet Generator and Auto-Sweep Demo
// Creates a new wallet using HD system, then demonstrates auto-sweep

require('dotenv').config();
const crypto = require('crypto');

async function createHDWalletAndDemoSweep() {
    console.log('🏗️  HD WALLET CREATION & AUTO-SWEEP DEMO');
    console.log('=========================================');
    console.log('');
    
    try {
        // Import TronWeb
        const TronWebModule = require('tronweb');
        const TronWeb = TronWebModule.TronWeb || TronWebModule.default.TronWeb;
        
        // Create new HD wallet using your system's method
        const userId = 999; // Use a test user ID
        const addressIndex = 0; // First address for this user
        
        console.log('🔧 GENERATING NEW HD WALLET...');
        console.log(`   User ID: ${userId}`);
        console.log(`   Address Index: ${addressIndex}`);
        console.log('');
        
        // Generate private key using the same method as walletService.js
        const tronPrivateKey = crypto.createHash('sha256')
            .update(`tron-mainnet-${userId}-${addressIndex}-${process.env.HD_WALLET_SEED || 'redstone-hd-seed'}`)
            .digest('hex');
        
        console.log('✅ Private key generated using HD derivation');
        
        // Initialize TronWeb to generate address
        const tempTronWeb = new TronWeb({
            fullHost: 'https://api.shasta.trongrid.io'
        });
        
        // Generate Tron address from private key
        const newWalletAddress = tempTronWeb.address.fromPrivateKey(tronPrivateKey);
        
        console.log('');
        console.log('🎉 NEW HD WALLET CREATED!');
        console.log('=========================');
        console.log(`   Address: ${newWalletAddress}`);
        console.log(`   Private Key: ${tronPrivateKey.substring(0, 8)}...${tronPrivateKey.substring(-8)}`);
        console.log(`   Derivation: tron-mainnet-${userId}-${addressIndex}`);
        console.log(`   Network: Shasta Testnet`);
        console.log('');
        
        // Your main wallet for receiving swept funds
        const mainWallet = process.env.TESTNET_OWNER_WALLET;
        
        console.log('📋 SWEEP CONFIGURATION:');
        console.log(`   HD Wallet (Source): ${newWalletAddress}`);
        console.log(`   Main Wallet (Destination): ${mainWallet}`);
        console.log('');
        
        console.log('📤 READY FOR TESTING!');
        console.log('=====================');
        console.log('');
        console.log('🔹 STEP 1: Send TRX to the new HD wallet:');
        console.log(`   Address: ${newWalletAddress}`);
        console.log('   Amount: Any amount (e.g., 10 TRX)');
        console.log('   Network: Shasta Testnet');
        console.log('');
        console.log('🔹 STEP 2: Run the auto-sweep demo:');
        console.log('   Command: node hd_auto_sweep_demo.js');
        console.log('');
        
        // Save wallet info for the sweep demo
        const walletInfo = {
            address: newWalletAddress,
            privateKey: tronPrivateKey,
            userId: userId,
            addressIndex: addressIndex,
            mainWallet: mainWallet,
            createdAt: new Date().toISOString()
        };
        
        // Create the auto-sweep demo script
        const autoSweepScript = `// Auto-Sweep Demo for HD Wallet
require('dotenv').config();

async function performAutoSweep() {
    console.log('🔄 HD WALLET AUTO-SWEEP DEMONSTRATION');
    console.log('====================================');
    console.log('');
    
    try {
        const TronWebModule = require('tronweb');
        const TronWeb = TronWebModule.TronWeb || TronWebModule.default.TronWeb;
        
        // HD Wallet information
        const hdWallet = {
            address: '${newWalletAddress}',
            privateKey: '${tronPrivateKey}',
            userId: ${userId},
            addressIndex: ${addressIndex}
        };
        
        const mainWallet = '${mainWallet}';
        
        console.log('📋 WALLET INFORMATION:');
        console.log(\`   HD Wallet: \${hdWallet.address}\`);
        console.log(\`   Main Wallet: \${mainWallet}\`);
        console.log(\`   User ID: \${hdWallet.userId}\`);
        console.log(\`   Address Index: \${hdWallet.addressIndex}\`);
        console.log('');
        
        // Initialize TronWeb with HD wallet's private key
        const tronWeb = new TronWeb({
            fullHost: 'https://api.shasta.trongrid.io',
            privateKey: hdWallet.privateKey
        });
        
        console.log('✅ TronWeb initialized with HD wallet private key');
        
        // Check current balances
        console.log('');
        console.log('💰 CURRENT BALANCES:');
        const hdBalance = await tronWeb.trx.getBalance(hdWallet.address);
        const mainBalance = await tronWeb.trx.getBalance(mainWallet);
        
        console.log(\`   HD Wallet: \${tronWeb.fromSun(hdBalance)} TRX\`);
        console.log(\`   Main Wallet: \${tronWeb.fromSun(mainBalance)} TRX\`);
        console.log('');
        
        if (hdBalance <= 0) {
            console.log('❌ No funds in HD wallet to sweep');
            console.log('💡 Please send some TRX to the HD wallet first:');
            console.log(\`   Address: \${hdWallet.address}\`);
            return;
        }
        
        // Calculate sweep amount (leave some for gas fees)
        const gasReserve = tronWeb.toSun(1); // Reserve 1 TRX for gas
        const sweepAmount = hdBalance - gasReserve;
        
        if (sweepAmount <= 0) {
            console.log('❌ Insufficient balance for sweep (need at least 1 TRX for gas)');
            return;
        }
        
        console.log('🔄 EXECUTING AUTO-SWEEP...');
        console.log(\`   Sweep Amount: \${tronWeb.fromSun(sweepAmount)} TRX\`);
        console.log(\`   Gas Reserve: \${tronWeb.fromSun(gasReserve)} TRX\`);
        console.log('');
        
        // Execute the auto-sweep transaction
        const txResult = await tronWeb.trx.sendTransaction(mainWallet, sweepAmount);
        
        if (txResult.result) {
            console.log('✅ AUTO-SWEEP SUCCESSFUL!');
            console.log(\`   Transaction ID: \${txResult.txid}\`);
            console.log(\`   Explorer: https://shasta.tronscan.org/#/transaction/\${txResult.txid}\`);
            
            // Wait for confirmation
            console.log('');
            console.log('⏳ Waiting for confirmation...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check final balances
            const finalHdBalance = await tronWeb.trx.getBalance(hdWallet.address);
            const finalMainBalance = await tronWeb.trx.getBalance(mainWallet);
            
            console.log('');
            console.log('💰 FINAL BALANCES:');
            console.log(\`   HD Wallet: \${tronWeb.fromSun(finalHdBalance)} TRX\`);
            console.log(\`   Main Wallet: \${tronWeb.fromSun(finalMainBalance)} TRX\`);
            console.log('');
            
            console.log('🎉 HD WALLET AUTO-SWEEP COMPLETE!');
            console.log('=================================');
            console.log('');
            console.log('✅ HD wallet created using deterministic derivation');
            console.log('✅ Private key regenerated from HD seed');
            console.log('✅ Funds automatically swept to main wallet');
            console.log('✅ Auto-sweep system fully operational');
            
        } else {
            console.log('❌ Auto-sweep failed:', txResult);
        }
        
    } catch (error) {
        console.error('❌ Auto-sweep failed:', error.message);
    }
}

performAutoSweep();`;
        
        // Write the auto-sweep demo script
        require('fs').writeFileSync('hd_auto_sweep_demo.js', autoSweepScript);
        
        console.log('✅ Auto-sweep demo script created: hd_auto_sweep_demo.js');
        console.log('');
        console.log('🎯 NEXT STEPS:');
        console.log('1. Send TRX to the HD wallet address above');
        console.log('2. Run: PATH=$PATH:/usr/local/bin node hd_auto_sweep_demo.js');
        console.log('3. Watch the auto-sweep in action!');
        
    } catch (error) {
        console.error('❌ HD wallet creation failed:', error.message);
    }
}

createHDWalletAndDemoSweep();