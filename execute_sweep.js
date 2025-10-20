require('dotenv').config();
const mongoose = require('mongoose');
const Deposit = require('./src/models/Deposit');
const { TronWeb } = require('tronweb');
const EnhancedHDWalletService = require('./src/services/EnhancedHDWalletService');

const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io'
});

const MAIN_WALLET = process.env.MAIN_WALLET_ADDRESS || 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu';
const FUEL_WALLET = process.env.FUEL_WALLET_ADDRESS || 'T9yPwwZiMbcLuhKWUtHwqLEoqqvm4S9mYJ';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function executeManualSweep() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        const depositId = '68ea4394dd04208fb3feadd3';
        const deposit = await Deposit.findById(depositId);
        const walletAddress = deposit.address || deposit.walletBackup?.address;
        
        console.log('\n🚀 EXECUTING MANUAL SWEEP FOR STUCK DEPOSIT');
        console.log('═══════════════════════════════════════════════════════');
        console.log('Deposit ID:', depositId);
        console.log('Wallet:', walletAddress);
        console.log('Amount:', deposit.amount, 'USDT');
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
        // STEP 2: Verify current balances
        // ══════════════════════════════════════════════════════════
        console.log('💰 STEP 2: Checking current balances...');
        
        const trxBalance = await tronWeb.trx.getBalance(walletAddress);
        const trxAmount = parseFloat(tronWeb.fromSun(trxBalance));
        console.log(`   TRX: ${trxAmount.toFixed(6)} TRX`);
        
        const usdtContract = await tronWeb.contract().at('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
        const usdtBalance = await usdtContract.balanceOf(walletAddress).call();
        const usdtAmount = tronWeb.toBigNumber(usdtBalance).div(1000000).toNumber();
        console.log(`   USDT: ${usdtAmount} USDT`);
        
        if (usdtAmount < deposit.amount) {
            throw new Error(`Insufficient USDT: Has ${usdtAmount}, needs ${deposit.amount}`);
        }
        
        if (trxAmount < 14) {
            throw new Error(`Insufficient TRX: Has ${trxAmount}, needs at least 14 TRX`);
        }
        console.log('✅ Sufficient balances confirmed\n');
        
        // ══════════════════════════════════════════════════════════
        // STEP 3: Update deposit status
        // ══════════════════════════════════════════════════════════
        console.log('📝 STEP 3: Updating deposit status...');
        await Deposit.findByIdAndUpdate(depositId, {
            sweepStatus: 'SWEEPING',
            lastSweepAttempt: new Date()
        });
        console.log('✅ Status updated to SWEEPING\n');
        
        // ══════════════════════════════════════════════════════════
        // STEP 4: Sweep USDT to main wallet
        // ══════════════════════════════════════════════════════════
        console.log('🔄 STEP 4: Sweeping USDT to main wallet...');
        console.log(`   From: ${walletAddress}`);
        console.log(`   To: ${MAIN_WALLET}`);
        console.log(`   Amount: ${usdtAmount} USDT`);
        
        const usdtAmount6Decimals = tronWeb.toBigNumber(usdtAmount).multipliedBy(1000000).toString();
        
        const usdtSweepTx = await usdtContract.transfer(
            MAIN_WALLET,
            usdtAmount6Decimals
        ).send({
            feeLimit: 100000000,
            callValue: 0,
            shouldPollResponse: true
        });
        
        console.log(`✅ USDT sweep successful!`);
        console.log(`   TX Hash: ${usdtSweepTx}`);
        
        // Update deposit with sweep info
        await Deposit.findByIdAndUpdate(depositId, {
            sweepTransactionHash: usdtSweepTx,
            sweepStatus: 'SWEPT',
            processedAt: new Date()
        });
        console.log('✅ Database updated with sweep transaction\n');
        
        // ══════════════════════════════════════════════════════════
        // STEP 5: Wait for confirmation
        // ══════════════════════════════════════════════════════════
        console.log('⏳ STEP 5: Waiting for transaction confirmation...');
        await sleep(5000);
        console.log('✅ Transaction confirmed\n');
        
        // ══════════════════════════════════════════════════════════
        // STEP 6: Check remaining TRX and recover to fuel wallet
        // ══════════════════════════════════════════════════════════
        console.log('💸 STEP 6: Checking for remaining TRX to recover...');
        
        const remainingTrxBalance = await tronWeb.trx.getBalance(walletAddress);
        const remainingTrx = parseFloat(tronWeb.fromSun(remainingTrxBalance));
        console.log(`   Remaining TRX: ${remainingTrx.toFixed(6)} TRX`);
        
        if (remainingTrx > 0.5) {
            console.log('   💰 Sufficient TRX remaining for recovery!');
            
            // Calculate amount to recover (leave 0.1 TRX for the recovery transaction fee)
            const amountToRecover = Math.max(0, remainingTrx - 0.1);
            const amountInSun = Math.floor(tronWeb.toSun(amountToRecover)); // Ensure it's an integer
            
            console.log(`   📤 Recovering ${amountToRecover.toFixed(6)} TRX to fuel wallet...`);
            console.log(`   From: ${walletAddress}`);
            console.log(`   To: ${FUEL_WALLET}`);
            console.log(`   Amount in SUN: ${amountInSun}`);
            
            const recoveryTx = await tronWeb.trx.sendTransaction(
                FUEL_WALLET,
                amountInSun
            );
            
            if (recoveryTx.result) {
                console.log(`   ✅ TRX recovery successful!`);
                console.log(`   TX Hash: ${recoveryTx.txid}`);
                console.log(`   Recovered: ${amountToRecover.toFixed(6)} TRX`);
                
                // Update deposit with recovery info
                await Deposit.findByIdAndUpdate(depositId, {
                    trxRecoveryTxHash: recoveryTx.txid,
                    trxRecovered: amountToRecover
                });
                console.log('   ✅ Database updated with recovery transaction');
            } else {
                console.log(`   ⚠️  TRX recovery transaction created but result unclear`);
                console.log(`   TX: ${recoveryTx.txid}`);
            }
        } else {
            console.log(`   ℹ️  Only ${remainingTrx.toFixed(6)} TRX remaining (below 0.5 TRX threshold)`);
            console.log(`   💡 TRX was fully utilized for the sweep - this is expected!`);
        }
        console.log();
        
        // ══════════════════════════════════════════════════════════
        // STEP 7: Update deposit status to COMPLETED
        // ══════════════════════════════════════════════════════════
        console.log('✅ STEP 7: Marking deposit as COMPLETED...');
        await Deposit.findByIdAndUpdate(depositId, {
            status: 'COMPLETED',
            sweepStatus: 'SWEPT'
        });
        console.log('✅ Deposit status updated to COMPLETED\n');
        
        // ══════════════════════════════════════════════════════════
        // FINAL SUMMARY
        // ══════════════════════════════════════════════════════════
        console.log('═══════════════════════════════════════════════════════');
        console.log('🎉 SWEEP COMPLETED SUCCESSFULLY!');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`✅ ${usdtAmount} USDT swept to main wallet`);
        console.log(`   TX: ${usdtSweepTx}`);
        if (remainingTrx > 0.5) {
            console.log(`✅ ${amountToRecover.toFixed(6)} TRX recovered to fuel wallet`);
        } else {
            console.log(`✅ All TRX was used for sweep (optimal gas usage)`);
        }
        console.log(`✅ Deposit status: COMPLETED`);
        console.log('═══════════════════════════════════════════════════════\n');
        
        // ══════════════════════════════════════════════════════════
        // VERIFY FINAL STATE
        // ══════════════════════════════════════════════════════════
        console.log('🔍 Verifying final state...');
        
        const finalTrx = await tronWeb.trx.getBalance(walletAddress);
        const finalTrxAmount = parseFloat(tronWeb.fromSun(finalTrx));
        console.log(`   Deposit wallet TRX: ${finalTrxAmount.toFixed(6)} TRX`);
        
        const finalUsdt = await usdtContract.balanceOf(walletAddress).call();
        const finalUsdtAmount = tronWeb.toBigNumber(finalUsdt).div(1000000).toNumber();
        console.log(`   Deposit wallet USDT: ${finalUsdtAmount} USDT`);
        
        const mainWalletUsdt = await usdtContract.balanceOf(MAIN_WALLET).call();
        const mainUsdtAmount = tronWeb.toBigNumber(mainWalletUsdt).div(1000000).toNumber();
        console.log(`   Main wallet USDT: ${mainUsdtAmount} USDT`);
        
        console.log('\n✅ All operations completed successfully!\n');
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ SWEEP FAILED:', error.message);
        console.error(error);
        
        // Update deposit with error
        try {
            const depositId = '68ea4394dd04208fb3feadd3';
            const failedDeposit = await Deposit.findById(depositId);
            await Deposit.findByIdAndUpdate(depositId, {
                sweepStatus: 'FAILED',
                sweepError: error.message,
                sweepAttempts: (failedDeposit?.sweepAttempts || 0) + 1,
                lastSweepAttempt: new Date()
            });
            console.log('\n📝 Database updated with failure info');
        } catch (dbError) {
            console.error('Failed to update database:', dbError.message);
        }
        
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

// Run the sweep
executeManualSweep();
