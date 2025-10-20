const mongoose = require('mongoose');
const { TronWeb } = require('tronweb');
const Deposit = require('./src/models/Deposit');
const EnhancedHDWalletService = require('./src/services/EnhancedHDWalletService');
require('dotenv').config();

async function checkUSDTBalance() {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📊 Connected to database');

        const address = 'TSf6zjTxDDWkh45jQKdLbgNBWmH1DKKbZa';
        console.log('🔍 Checking USDT balance for:', address);

        // Find the deposit
        const deposit = await Deposit.findOne({ address });
        if (!deposit) {
            throw new Error('Deposit not found');
        }

        console.log('✅ Deposit found');

        // Initialize services
        const hdWalletService = new EnhancedHDWalletService();
        
        // Decrypt private key
        let privateKey = null;
        if (deposit.walletPrivateKey) {
            try {
                privateKey = hdWalletService.decryptPrivateKey(deposit.walletPrivateKey);
                console.log('🔓 Private key decrypted successfully');
            } catch (error) {
                console.log('❌ Failed to decrypt private key:', error.message);
            }
        }

        if (!privateKey) {
            throw new Error('Could not decrypt private key');
        }

        // Create TronWeb instance with private key
        const tronWeb = new TronWeb({
            fullHost: 'https://api.trongrid.io',
            privateKey: privateKey
        });

        console.log('🔗 Connected to Tron network with wallet');

        // Check TRX balance
        const trxBalance = await tronWeb.trx.getBalance(address);
        const trxAmount = tronWeb.fromSun(trxBalance);
        console.log('💰 TRX Balance:', trxAmount);

        // Check USDT balance using the wallet
        const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
        
        try {
            const contract = await tronWeb.contract().at(usdtContract);
            const usdtBalance = await contract.balanceOf(address).call();
            const usdtAmount = tronWeb.toBigNumber(usdtBalance).div(1000000).toNumber();
            
            console.log('💵 USDT Balance:', usdtAmount, 'USDT');
            
            if (usdtAmount > 0) {
                console.log('✅ USDT FOUND! Balance:', usdtAmount, 'USDT');
                console.log('🔄 Auto-sweep should process this soon...');
                
                // Update deposit status if needed
                if (deposit.status === 'PENDING') {
                    deposit.actualAmount = usdtAmount;
                    deposit.status = 'CONFIRMED';
                    await deposit.save();
                    console.log('📝 Updated deposit status to CONFIRMED');
                }
            } else {
                console.log('⚠️ No USDT found in wallet');
            }
        } catch (usdtError) {
            console.log('❌ Error checking USDT balance:', usdtError.message);
        }

        // Check account info
        const account = await tronWeb.trx.getAccount(address);
        console.log('🏦 Account activated:', !!account.address);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
}

checkUSDTBalance();