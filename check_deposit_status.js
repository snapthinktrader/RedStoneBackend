const mongoose = require('mongoose');
const Deposit = require('./src/models/Deposit');
require('dotenv').config();

async function checkDepositStatus() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📊 Connected to database');
        
        const address = 'TSf6zjTxDDWkh45jQKdLbgNBWmH1DKKbZa';
        console.log('🔍 Searching for deposit with address:', address);
        
        const deposit = await Deposit.findOne({ address: address });
        
        if (!deposit) {
            console.log('❌ No deposit found with that address');
            return;
        }
        
        console.log('✅ Deposit found!');
        console.log('📋 Deposit Details:');
        console.log('  ID:', deposit._id.toString());
        console.log('  Address:', deposit.address);
        console.log('  Amount:', deposit.amount, 'USDT');
        console.log('  Status:', deposit.status);
        console.log('  Network:', deposit.network);
        console.log('  Created:', deposit.createdAt);
        console.log('  User ID:', deposit.userId);
        
        console.log('\n🔐 Wallet Security Info:');
        console.log('  Has Public Key:', !!deposit.publicKey);
        console.log('  Has Private Key (encrypted):', !!deposit.walletPrivateKey);
        console.log('  Has Emergency Backup:', !!deposit.emergencyPrivateKey);
        console.log('  Has Wallet Backup:', !!deposit.walletBackup);
        
        console.log('\n🔄 Auto-Sweep Status:');
        console.log('  Sweep Status:', deposit.sweepStatus);
        console.log('  Auto-Sweep Processed:', deposit.autoSweepProcessed);
        console.log('  Sweep Attempts:', deposit.sweepAttempts || 0);
        console.log('  Last Sweep Attempt:', deposit.lastSweepAttempt || 'None');
        console.log('  Sweep Error:', deposit.sweepError || 'None');
        console.log('  Gas Fees Calculated:', deposit.gasFeesCalculated || 0);
        console.log('  Gas Fees Sent:', deposit.gasFeesSent || 0);
        console.log('  Gas TX Hash:', deposit.gasTxHash || 'None');
        console.log('  Sweep TX Hash:', deposit.sweepTransactionHash || 'None');
        
        console.log('\n⏰ Timing Info:');
        console.log('  Last Checked:', deposit.lastCheckedAt);
        console.log('  Expires At:', deposit.expiresAt);
        console.log('  Is Expired:', deposit.isExpired());
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
}

checkDepositStatus();