require('dotenv').config();
const TronWeb = require('tronweb');
const mongoose = require('mongoose');
const Deposit = require('./src/models/Deposit');

// Initialize TronWeb
const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: { "TRON-PRO-API-KEY": process.env.tron_api_key }
});

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const MAIN_WALLET = process.env.MAINNET_OWNER_WALLET;
const FUEL_WALLET_PRIVATE_KEY = process.env.FUEL_WALLET_PRIVATE_KEY;

async function recoverStuckDeposit() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to database\n');
        
        // Get the stuck deposit
        const deposit = await Deposit.findById('68ea4394dd04208fb3feadd3');
        
        if (!deposit) {
            console.log('❌ Deposit not found');
            process.exit(1);
        }
        
        const depositWalletAddress = deposit.walletBackup?.address;
        
        if (!depositWalletAddress) {
            console.log('❌ Deposit wallet address not found');
            process.exit(1);
        }
        
        console.log('📦 Deposit Information:');
        console.log('Deposit ID:', deposit._id);
        console.log('Amount:', deposit.amount, 'USDT');
        console.log('Deposit Wallet:', depositWalletAddress);
        console.log('Main Wallet:', MAIN_WALLET);
        console.log('');
        
        // Check current balances
        console.log('🔍 Checking current balances...\n');
        
        // Check TRX balance
        const trxBalance = await tronWeb.trx.getBalance(depositWalletAddress);
        const trxBalanceInTRX = trxBalance / 1e6;
        console.log('TRX Balance:', trxBalanceInTRX, 'TRX');
        
        // Check USDT balance
        const usdtContract = await tronWeb.contract().at(USDT_CONTRACT);
        const usdtBalance = await usdtContract.balanceOf(depositWalletAddress).call();
        const usdtBalanceFormatted = usdtBalance / 1e6;
        console.log('USDT Balance:', usdtBalanceFormatted, 'USDT');
        console.log('');
        
        if (usdtBalanceFormatted === 0) {
            console.log('✅ No USDT to recover - wallet is empty');
            process.exit(0);
        }
        
        // Calculate required gas
        console.log('⛽ Calculating required gas fees...\n');
        
        // Use the real triggerConstantContract method to get accurate gas
        const parameter = [
            { type: 'address', value: MAIN_WALLET },
            { type: 'uint256', value: usdtBalance }
        ];
        
        const transaction = await tronWeb.transactionBuilder.triggerConstantContract(
            USDT_CONTRACT,
            'transfer(address,uint256)',
            {},
            parameter,
            depositWalletAddress
        );
        
        const energyRequired = transaction.energy_used || 0;
        const energyCost = (energyRequired * 420) / 1e9; // 420 sun per energy unit
        const bandwidthCost = 350 / 1e6; // ~350 bandwidth
        const totalGasNeeded = energyCost + bandwidthCost + 3; // Add 3 TRX buffer
        
        console.log('Energy Required:', energyRequired, 'units');
        console.log('Energy Cost:', energyCost.toFixed(6), 'TRX');
        console.log('Bandwidth Cost:', bandwidthCost.toFixed(6), 'TRX');
        console.log('Buffer:', '3.000000 TRX');
        console.log('Total Gas Needed:', totalGasNeeded.toFixed(6), 'TRX');
        console.log('');
        
        const gasToSend = totalGasNeeded - trxBalanceInTRX;
        
        if (gasToSend > 0) {
            console.log('💸 Need to send additional:', gasToSend.toFixed(6), 'TRX\n');
            console.log('Would you like to proceed? (Y/N)');
            console.log('This will:');
            console.log(`1. Send ${gasToSend.toFixed(2)} TRX from fuel wallet to deposit wallet`);
            console.log(`2. Sweep ${usdtBalanceFormatted} USDT from deposit wallet to main wallet`);
            console.log('');
            console.log('⚠️  Run this script with --execute flag to proceed');
            console.log('Example: node recover_stuck_deposit.js --execute');
        } else {
            console.log('✅ Sufficient TRX available. Ready to sweep!\n');
            console.log('Current TRX:', trxBalanceInTRX.toFixed(6), 'TRX');
            console.log('Required:', totalGasNeeded.toFixed(6), 'TRX');
            console.log('');
            console.log('⚠️  Run this script with --execute flag to proceed with sweep');
            console.log('Example: node recover_stuck_deposit.js --execute');
        }
        
        // If --execute flag is provided, actually perform the recovery
        if (process.argv.includes('--execute')) {
            console.log('\n🚀 Starting recovery process...\n');
            
            // Step 1: Send additional TRX if needed
            if (gasToSend > 0) {
                console.log('Step 1: Sending TRX for gas...');
                tronWeb.setPrivateKey(FUEL_WALLET_PRIVATE_KEY);
                
                const trxAmount = Math.ceil(gasToSend * 1e6);
                const gasTransaction = await tronWeb.transactionBuilder.sendTrx(
                    depositWalletAddress,
                    trxAmount
                );
                
                const signedGasTransaction = await tronWeb.trx.sign(gasTransaction);
                const gasResult = await tronWeb.trx.sendRawTransaction(signedGasTransaction);
                
                console.log('✅ Gas TRX sent!');
                console.log('TX Hash:', gasResult.txid);
                console.log('Waiting 5 seconds for confirmation...\n');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            // Step 2: Decrypt private key and sweep USDT
            console.log('Step 2: Sweeping USDT to main wallet...');
            
            const crypto = require('crypto');
            const algorithm = 'aes-256-cbc';
            const encryptionKey = Buffer.from(process.env.HD_WALLET_SEED || 'redstone-hd-seed-secure-2024', 'utf8').slice(0, 32);
            
            function decrypt(encrypted) {
                const parts = encrypted.split(':');
                const iv = Buffer.from(parts[0], 'hex');
                const encryptedText = Buffer.from(parts[1], 'hex');
                const decipher = crypto.createDecipheriv(algorithm, encryptionKey, iv);
                let decrypted = decipher.update(encryptedText);
                decrypted = Buffer.concat([decrypted, decipher.final()]);
                return decrypted.toString();
            }
            
            const depositPrivateKey = decrypt(deposit.walletPrivateKey);
            tronWeb.setPrivateKey(depositPrivateKey);
            
            // Create USDT transfer transaction
            const sweepParameter = [
                { type: 'address', value: MAIN_WALLET },
                { type: 'uint256', value: usdtBalance }
            ];
            
            const sweepTransaction = await tronWeb.transactionBuilder.triggerSmartContract(
                USDT_CONTRACT,
                'transfer(address,uint256)',
                { feeLimit: 100000000 },
                sweepParameter,
                depositWalletAddress
            );
            
            const signedSweepTransaction = await tronWeb.trx.sign(sweepTransaction.transaction);
            const sweepResult = await tronWeb.trx.sendRawTransaction(signedSweepTransaction);
            
            console.log('✅ USDT swept successfully!');
            console.log('TX Hash:', sweepResult.txid);
            console.log('Amount:', usdtBalanceFormatted, 'USDT');
            console.log('From:', depositWalletAddress);
            console.log('To:', MAIN_WALLET);
            console.log('');
            
            // Update deposit record
            deposit.sweepTxHash = sweepResult.txid;
            deposit.sweepStatus = 'SWEPT';
            deposit.depositAddress = depositWalletAddress;
            await deposit.save();
            
            console.log('✅ Database updated with sweep transaction hash\n');
        }
        
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

recoverStuckDeposit();
