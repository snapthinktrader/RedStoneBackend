require('dotenv').config();
const { TronWeb } = require('tronweb');

const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io'
});

const FUEL_WALLET = process.env.FUEL_WALLET_ADDRESS || 'T9yPwwZiMbcLuhKWUtHwqLEoqqvm4S9mYJ';
const FUEL_WALLET_KEY = process.env.FUEL_WALLET_PRIVATE_KEY;
const DEPOSIT_WALLET = 'TSf6zjTxDDWkh45jQKdLbgNBWmH1DKKbZa';
const AMOUNT_TO_SEND = 16.5; // TRX

async function sendTrxToDepositWallet() {
    try {
        console.log('\n💸 SENDING TRX TO STUCK DEPOSIT WALLET');
        console.log('═══════════════════════════════════════════════════════');
        
        // ══════════════════════════════════════════════════════════
        // STEP 1: Verify fuel wallet has sufficient balance
        // ══════════════════════════════════════════════════════════
        console.log('\n🔍 STEP 1: Checking fuel wallet balance...');
        
        if (!FUEL_WALLET_KEY) {
            throw new Error('FUEL_WALLET_PRIVATE_KEY not found in .env file');
        }
        
        const fuelBalance = await tronWeb.trx.getBalance(FUEL_WALLET);
        const fuelTrx = parseFloat(tronWeb.fromSun(fuelBalance));
        
        console.log(`   Fuel Wallet: ${FUEL_WALLET}`);
        console.log(`   Balance: ${fuelTrx.toFixed(6)} TRX`);
        
        if (fuelTrx < AMOUNT_TO_SEND) {
            throw new Error(`Insufficient balance in fuel wallet. Has ${fuelTrx} TRX, needs ${AMOUNT_TO_SEND} TRX`);
        }
        
        console.log(`   ✅ Sufficient balance (${fuelTrx.toFixed(6)} >= ${AMOUNT_TO_SEND})`);
        
        // ══════════════════════════════════════════════════════════
        // STEP 2: Verify destination wallet
        // ══════════════════════════════════════════════════════════
        console.log('\n🔍 STEP 2: Verifying destination wallet...');
        console.log(`   Deposit Wallet: ${DEPOSIT_WALLET}`);
        
        const depositBalance = await tronWeb.trx.getBalance(DEPOSIT_WALLET);
        const depositTrx = parseFloat(tronWeb.fromSun(depositBalance));
        console.log(`   Current Balance: ${depositTrx.toFixed(6)} TRX`);
        
        // Check if wallet exists
        try {
            const account = await tronWeb.trx.getAccount(DEPOSIT_WALLET);
            if (account.address) {
                console.log(`   ✅ Wallet exists and is active`);
            }
        } catch (error) {
            console.log(`   ⚠️  Wallet may be new (not activated yet)`);
        }
        
        // ══════════════════════════════════════════════════════════
        // STEP 3: Confirm transaction details
        // ══════════════════════════════════════════════════════════
        console.log('\n📋 STEP 3: Transaction details:');
        console.log(`   From: ${FUEL_WALLET}`);
        console.log(`   To: ${DEPOSIT_WALLET}`);
        console.log(`   Amount: ${AMOUNT_TO_SEND} TRX`);
        console.log(`   Amount (SUN): ${tronWeb.toSun(AMOUNT_TO_SEND)}`);
        console.log(`   Purpose: Gas fees for stuck deposit sweep`);
        
        console.log('\n⚠️  IMPORTANT: This transaction is irreversible!');
        console.log('   Proceeding in 3 seconds...\n');
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // ══════════════════════════════════════════════════════════
        // STEP 4: Set private key and send transaction
        // ══════════════════════════════════════════════════════════
        console.log('💸 STEP 4: Sending TRX transaction...');
        
        tronWeb.setPrivateKey(FUEL_WALLET_KEY);
        
        const amountInSun = tronWeb.toSun(AMOUNT_TO_SEND);
        const transaction = await tronWeb.trx.sendTransaction(
            DEPOSIT_WALLET,
            amountInSun,
            { privateKey: FUEL_WALLET_KEY }
        );
        
        console.log('   Transaction broadcast to network...');
        
        // ══════════════════════════════════════════════════════════
        // STEP 5: Verify transaction result
        // ══════════════════════════════════════════════════════════
        console.log('\n🔍 STEP 5: Verifying transaction...');
        
        if (transaction.result || transaction.txid) {
            console.log('   ✅ Transaction successful!');
            console.log(`   TX Hash: ${transaction.txid}`);
            console.log(`   View on TRONSCAN: https://tronscan.org/#/transaction/${transaction.txid}`);
        } else {
            throw new Error('Transaction failed or result unclear');
        }
        
        // ══════════════════════════════════════════════════════════
        // STEP 6: Wait for confirmation and verify balance
        // ══════════════════════════════════════════════════════════
        console.log('\n⏳ STEP 6: Waiting for blockchain confirmation...');
        console.log('   Please wait 30 seconds...');
        
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        console.log('   Checking new balance...');
        const newDepositBalance = await tronWeb.trx.getBalance(DEPOSIT_WALLET);
        const newDepositTrx = parseFloat(tronWeb.fromSun(newDepositBalance));
        
        console.log(`   New Balance: ${newDepositTrx.toFixed(6)} TRX`);
        
        if (newDepositTrx >= AMOUNT_TO_SEND) {
            console.log(`   ✅ Balance confirmed! (+${(newDepositTrx - depositTrx).toFixed(6)} TRX)`);
        } else {
            console.log(`   ⚠️  Balance updated but not full amount yet (${newDepositTrx.toFixed(6)} TRX)`);
            console.log(`   This is normal - blockchain may need more time to confirm`);
        }
        
        // ══════════════════════════════════════════════════════════
        // FINAL SUMMARY
        // ══════════════════════════════════════════════════════════
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('✅ TRX TRANSFER COMPLETED!');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`✅ Sent: ${AMOUNT_TO_SEND} TRX`);
        console.log(`✅ From: ${FUEL_WALLET}`);
        console.log(`✅ To: ${DEPOSIT_WALLET}`);
        console.log(`✅ TX: ${transaction.txid}`);
        console.log(`✅ New Balance: ${newDepositTrx.toFixed(6)} TRX`);
        console.log('═══════════════════════════════════════════════════════\n');
        
        console.log('🎯 NEXT STEPS:');
        console.log('1. Wait another 30 seconds for full confirmation');
        console.log('2. Run: node preflight_check.js');
        console.log('3. If all checks pass (7/7), run: node execute_sweep.js\n');
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error);
        
        console.log('\n💡 TROUBLESHOOTING:');
        console.log('- Verify FUEL_WALLET_PRIVATE_KEY is set in .env');
        console.log('- Check fuel wallet has sufficient balance');
        console.log('- Verify network connectivity');
        console.log('- Try again in a few minutes if network congestion\n');
        
        process.exit(1);
    }
}

// Execute the transfer
sendTrxToDepositWallet();
