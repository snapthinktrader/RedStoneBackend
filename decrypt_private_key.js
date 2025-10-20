const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config();

async function decryptPrivateKey(walletAddress) {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📊 Connected to database\n');
        
        const depositSchema = new mongoose.Schema({}, { strict: false });
        const Deposit = mongoose.model('Deposit', depositSchema);
        
        const deposit = await Deposit.findOne({ walletAddress });
        
        if (!deposit) {
            console.log('❌ No deposit found for wallet:', walletAddress);
            process.exit(1);
        }
        
        console.log('✅ Deposit found!');
        console.log('📍 Wallet Address:', deposit.walletAddress);
        console.log('💰 Amount:', deposit.amount, 'USDT');
        console.log('');
        
        // Try to decrypt walletPrivateKey
        const encryptedKey = deposit.walletPrivateKey || deposit.emergencyPrivateKey;
        
        if (!encryptedKey) {
            console.log('❌ No encrypted private key found');
            process.exit(1);
        }
        
        const algorithm = 'aes-256-cbc';
        const encryptionSeed = process.env.HD_WALLET_SEED || 'redstone-hd-seed-secure-2024';
        const key = crypto.createHash('sha256').update(encryptionSeed).digest();
        
        try {
            const parts = encryptedKey.split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const encryptedText = parts[1];
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            console.log('🔓 Successfully decrypted private key!\n');
            console.log('🔑 PRIVATE KEY:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(decrypted);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            
            // Verify it generates the correct address
            const { TronWeb } = require('tronweb');
            const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });
            const derivedAddress = tronWeb.address.fromPrivateKey(decrypted);
            
            console.log('✅ Verification:');
            console.log('   Stored Address:', deposit.walletAddress);
            console.log('   Derived Address:', derivedAddress);
            console.log('   Match:', derivedAddress === deposit.walletAddress ? '✅ YES' : '❌ NO');
            
        } catch (decryptError) {
            console.log('❌ Failed to decrypt:', decryptError.message);
        }
        
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from database');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

const walletAddress = process.argv[2] || 'TSf6zjTxDDWkh45jQKdLbgNBWmH1DKKbZa';
decryptPrivateKey(walletAddress);
