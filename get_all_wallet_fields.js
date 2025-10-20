const mongoose = require('mongoose');
require('dotenv').config();

async function getAllFields(walletAddress) {
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
        console.log('');
        console.log('📋 ALL FIELDS IN DATABASE:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const obj = deposit.toObject();
        Object.keys(obj).forEach(key => {
            if (key !== '_id' && key !== '__v') {
                const value = obj[key];
                if (typeof value === 'string' && value.length > 100) {
                    console.log(`${key}:`, value.substring(0, 100) + '...');
                } else if (typeof value === 'object') {
                    console.log(`${key}:`, JSON.stringify(value, null, 2));
                } else {
                    console.log(`${key}:`, value);
                }
            }
        });
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from database');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

const walletAddress = process.argv[2] || 'TSf6zjTxDDWkh45jQKdLbgNBWmH1DKKbZa';
getAllFields(walletAddress);
