const mongoose = require('mongoose');
const Deposit = require('./src/models/Deposit');
require('dotenv').config();

async function checkLatestDepositInfo() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📊 Connected to database');

        // Get the most recent deposit
        const latestDeposit = await Deposit.findOne().sort({ createdAt: -1 });
        
        if (!latestDeposit) {
            console.log('❌ No deposits found in database');
            return;
        }

        console.log('🔍 Latest Deposit Analysis:');
        console.log('='.repeat(50));
        console.log('📍 Deposit ID:', latestDeposit._id.toString());
        console.log('📍 Address:', latestDeposit.address);
        console.log('📅 Created:', latestDeposit.createdAt);
        console.log('💰 Amount:', latestDeposit.amount);
        console.log('🌐 Network:', latestDeposit.network);
        console.log('📊 Status:', latestDeposit.status);
        
        console.log('\n🔐 Wallet Security Information:');
        console.log('-'.repeat(30));
        console.log('✓ Has Public Key:', !!latestDeposit.publicKey);
        console.log('✓ Has Encrypted Private Key:', !!latestDeposit.walletPrivateKey);
        console.log('✓ Has Emergency Backup:', !!latestDeposit.emergencyPrivateKey);
        console.log('✓ Has Wallet Backup Info:', !!latestDeposit.walletBackup);
        
        if (latestDeposit.publicKey) {
            console.log('🔑 Public Key (first 20 chars):', latestDeposit.publicKey.substring(0, 20) + '...');
        }
        
        if (latestDeposit.walletPrivateKey) {
            console.log('🔒 Encrypted Private Key (first 20 chars):', latestDeposit.walletPrivateKey.substring(0, 20) + '...');
            console.log('🔒 Encrypted Key Format:', latestDeposit.walletPrivateKey.includes(':') ? 'NEW (with IV)' : 'OLD (deprecated)');
        }
        
        if (latestDeposit.emergencyPrivateKey) {
            console.log('🆘 Emergency Backup (first 20 chars):', latestDeposit.emergencyPrivateKey.substring(0, 20) + '...');
        }
        
        if (latestDeposit.walletBackup) {
            console.log('\n📋 Wallet Backup Details:');
            console.log('  - Address:', latestDeposit.walletBackup.address);
            console.log('  - Public Key:', latestDeposit.walletBackup.publicKey ? latestDeposit.walletBackup.publicKey.substring(0, 20) + '...' : 'N/A');
            console.log('  - Derivation Path:', latestDeposit.walletBackup.derivationPath);
            console.log('  - Created At:', latestDeposit.walletBackup.createdAt);
        }
        
        console.log('\n🔄 Auto-Sweep Information:');
        console.log('-'.repeat(30));
        console.log('📊 Sweep Status:', latestDeposit.sweepStatus);
        console.log('🔢 Address Index:', latestDeposit.addressIndex);
        console.log('📍 Derivation Path:', latestDeposit.derivationPath);
        console.log('🏦 Is HD Wallet:', latestDeposit.isHDWallet);
        
        console.log('\n✅ Database Storage Verification Complete!');
        
    } catch (error) {
        console.error('❌ Database check failed:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
}

checkLatestDepositInfo();