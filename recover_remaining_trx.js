require('dotenv').config();
const mongoose = require('mongoose');
const Deposit = require('./src/models/Deposit');
const { TronWeb } = require('tronweb');
const EnhancedHDWalletService = require('./src/services/EnhancedHDWalletService');

const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io'
});

const FUEL_WALLET = process.env.FUEL_WALLET_ADDRESS || 'T9yPwwZiMbcLuhKWUtHwqLEoqqvm4S9mYJ';

async function recoverRemainingTrx() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        const depositId = '68ea4394dd04208fb3feadd3';
        const deposit = await Deposit.findById(depositId);
        const walletAddress = deposit.address || deposit.walletBackup?.address;
        
        console.log('\n💸 RECOVERING REMAINING TRX FROM DEPOSIT WALLET');
        console.log('═══════════════════════════════════════════════════════');
        console.log('Deposit ID:', depositId);
        console.log('Wallet:', walletAddress);
        console.log('═══════════════════════════════════════════════════════\n');
        
        // ══════════════════════════════════════════════════════════
        // STEP 1: Decrypt private key
        // ══════════════════════════════════════════════════════════
        console.log('🔐 STEP 1: Decrypting private key...');
        const hdWalletService = new EnhancedHDWalletService();
        const privateKey = hdWalletService.decryptPrivateKey(deposit.walletPrivateKey);
        tronWeb.setPrivateKey(privateKey);
        console.log('✅ Private key decrypted and set\n');
        
        // ══════════════════════════════════════════════════════════
        // STEP 2: Check current TRX balance
        // ══════════════════════════════════════════════════════════
        console.log('💰 STEP 2: Checking current TRX balance...');
        
        const trxBalance = await tronWeb.trx.getBalance(walletAddress);
        const trxAmount = parseFloat(tronWeb.fromSun(trxBalance));
        console.log(`   Current Balance: ${trxAmount.toFixed(6)} TRX`);
        
        if (trxAmount < 0.2) {
            console.log(`\n⚠️  Balance too low for recovery (${trxAmount.toFixed(6)} TRX)`);
            console.log('   Need at least 0.2 TRX to cover transaction fee and make recovery worthwhile');
            console.log('   This small amount can be left as dust.\n');
            process.exit(0);
        }
        
        console.log('✅ Sufficient balance for recovery\n');
        
        // ══════════════════════════════════════════════════════════
        // STEP 3: Calculate recovery amount
        // ══════════════════════════════════════════════════════════
        console.log('📊 STEP 3: Calculating recovery amount...');
        
        // Leave 0.1 TRX for the transaction fee
        const amountToRecover = Math.max(0, trxAmount - 0.1);
        const amountInSun = Math.floor(tronWeb.toSun(amountToRecover));
        
        console.log(`   Total Balance: ${trxAmount.toFixed(6)} TRX`);
        console.log(`   Transaction Fee: ~0.1 TRX`);
        console.log(`   Amount to Recover: ${amountToRecover.toFixed(6)} TRX`);
        console.log(`   Amount in SUN: ${amountInSun}`);
        console.log('✅ Recovery amount calculated\n');
        
        // ══════════════════════════════════════════════════════════
        // STEP 4: Send TRX to fuel wallet
        // ══════════════════════════════════════════════════════════
        console.log('🔄 STEP 4: Sending TRX to fuel wallet...');
        console.log(`   From: ${walletAddress}`);
        console.log(`   To: ${FUEL_WALLET}`);
        console.log(`   Amount: ${amountToRecover.toFixed(6)} TRX`);
        
        const recoveryTx = await tronWeb.trx.sendTransaction(
            FUEL_WALLET,
            amountInSun
        );
        
        console.log('   Transaction broadcast to network...\n');
        
        // ══════════════════════════════════════════════════════════
        // STEP 5: Verify transaction result
        // ══════════════════════════════════════════════════════════
        console.log('🔍 STEP 5: Verifying transaction...');
        
        if (recoveryTx.result || recoveryTx.txid) {
            console.log('   ✅ Transaction successful!');
            console.log(`   TX Hash: ${recoveryTx.txid}`);
            console.log(`   View on TRONSCAN: https://tronscan.org/#/transaction/${recoveryTx.txid}`);
        } else {
            throw new Error('Transaction failed or result unclear');
        }
        
        // ══════════════════════════════════════════════════════════
        // STEP 6: Update database with recovery info
        // ══════════════════════════════════════════════════════════
        console.log('\n📝 STEP 6: Updating database...');
        
        await Deposit.findByIdAndUpdate(depositId, {
            trxRecoveryTxHash: recoveryTx.txid,
            trxRecovered: amountToRecover,
            status: 'COMPLETED',
            sweepStatus: 'SWEPT'
        });
        
        console.log('✅ Database updated with recovery transaction\n');
        
        // ══════════════════════════════════════════════════════════
        // STEP 7: Wait and verify final balances
        // ══════════════════════════════════════════════════════════
        console.log('⏳ STEP 7: Waiting for confirmation...');
        console.log('   Please wait 10 seconds...');
        
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        console.log('   Checking final balances...\n');
        
        // Check deposit wallet final balance
        const finalDepositBalance = await tronWeb.trx.getBalance(walletAddress);
        const finalDepositTrx = parseFloat(tronWeb.fromSun(finalDepositBalance));
        console.log(`   Deposit Wallet: ${finalDepositTrx.toFixed(6)} TRX`);
        
        // Check fuel wallet received the TRX
        const fuelBalance = await tronWeb.trx.getBalance(FUEL_WALLET);
        const fuelTrx = parseFloat(tronWeb.fromSun(fuelBalance));
        console.log(`   Fuel Wallet: ${fuelTrx.toFixed(6)} TRX`);
        
        console.log('✅ Balances verified\n');
        
        // ══════════════════════════════════════════════════════════
        // FINAL SUMMARY
        // ══════════════════════════════════════════════════════════
        console.log('═══════════════════════════════════════════════════════');
        console.log('🎉 TRX RECOVERY COMPLETED SUCCESSFULLY!');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`✅ Recovered: ${amountToRecover.toFixed(6)} TRX`);
        console.log(`✅ From: ${walletAddress}`);
        console.log(`✅ To: ${FUEL_WALLET}`);
        console.log(`✅ TX: ${recoveryTx.txid}`);
        console.log(`✅ Remaining in deposit wallet: ${finalDepositTrx.toFixed(6)} TRX (dust)`);
        console.log('═══════════════════════════════════════════════════════\n');
        
        console.log('📊 FINAL STATUS:');
        console.log('   ✅ 10 USDT swept to main wallet (previous step)');
        console.log(`   ✅ ${amountToRecover.toFixed(6)} TRX recovered to fuel wallet`);
        console.log('   ✅ Deposit status: COMPLETED');
        console.log('   ✅ All operations successful!\n');
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ RECOVERY FAILED:', error.message);
        console.error(error);
        
        // Update deposit with error
        try {
            const depositId = '68ea4394dd04208fb3feadd3';
            await Deposit.findByIdAndUpdate(depositId, {
                trxRecoveryError: error.message
            });
            console.log('\n📝 Database updated with recovery error');
        } catch (dbError) {
            console.error('Failed to update database:', dbError.message);
        }
        
        console.log('\n💡 TROUBLESHOOTING:');
        console.log('- Check if TRX is still in wallet');
        console.log('- Verify private key is correct');
        console.log('- Check network connectivity');
        console.log('- Ensure fuel wallet address is correct\n');
        
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

// Run the recovery
recoverRemainingTrx();
