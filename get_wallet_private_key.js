const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config();

async function getWalletPrivateKey(walletAddress) {
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
        console.log('📊 Status:', deposit.status);
        console.log('');
        
        // Check if encrypted private key exists
        if (!deposit.encryptedPrivateKey) {
            console.log('❌ No encrypted private key found in database');
            process.exit(1);
        }
        
        // Decrypt the private key
        const algorithm = 'aes-256-cbc';
        const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
        
        try {
            const parts = deposit.encryptedPrivateKey.split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const encryptedText = parts[1];
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            console.log('🔓 Successfully decrypted private key!');
            console.log('');
            console.log('🔑 PRIVATE KEY:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(decrypted);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('');
            
            // Verify it generates the correct address
            const { TronWeb } = require('tronweb');
            const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });
            const derivedAddress = tronWeb.address.fromPrivateKey(decrypted);
            
            console.log('✅ Verification:');
            console.log('   Stored Address:', deposit.walletAddress);
            console.log('   Derived Address:', derivedAddress);
            console.log('   Match:', derivedAddress === deposit.walletAddress ? '✅ YES' : '❌ NO');
            
        } catch (decryptError) {
            console.log('❌ Failed to decrypt private key:', decryptError.message);
        }
        
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from database');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Get wallet address from command line argument
const walletAddress = process.argv[2];

if (!walletAddress) {
    console.log('Usage: node get_wallet_private_key.js <wallet_address>');
    process.exit(1);
}

getWalletPrivateKey(walletAddress);
