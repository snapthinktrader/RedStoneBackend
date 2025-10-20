const { TronWeb } = require('tronweb');
require('dotenv').config();

// Use the fuel wallet private key directly
const fuelPrivateKey = '3431d2938e26b4ed7208fdd613371d5b7ef83368099d5c0ee45f732ce5123059';
const fromAddress = 'T9yPwwZiMbcLuhKWUtHwqLEoqqvm4S9mYJ'; // Fuel wallet
const toAddress = 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu'; // Main wallet

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: fuelPrivateKey
});

async function sendTRXToMainWallet() {
  try {
    console.log('🚀 Sending 5 TRX from fuel wallet to main wallet...');
    console.log('From (Fuel):', fromAddress);
    console.log('To (Main):', toAddress);
    console.log('Amount: 5 TRX');
    
    // Verify the private key matches the fuel wallet
    const derivedAddress = tronWeb.address.fromPrivateKey(fuelPrivateKey);
    console.log('Derived address from private key:', derivedAddress);
    console.log('Expected fuel wallet address:', fromAddress);
    console.log('Addresses match:', derivedAddress === fromAddress);
    
    if (derivedAddress !== fromAddress) {
      console.log('❌ Private key does not match fuel wallet address');
      return;
    }
    
    // Check current balance
    const balance = await tronWeb.trx.getBalance(fromAddress);
    const balanceTRX = tronWeb.fromSun(balance);
    console.log(`\n💰 Fuel wallet balance: ${balanceTRX} TRX`);
    
    if (balanceTRX < 5) {
      console.log('❌ Insufficient balance to send 5 TRX');
      return;
    }
    
    console.log('\n📝 Creating transaction...');
    
    // Send 5 TRX
    const transaction = await tronWeb.transactionBuilder.sendTrx(
      toAddress,
      tronWeb.toSun(5), // Convert 5 TRX to SUN units
      fromAddress
    );
    
    console.log('✏️ Signing transaction...');
    const signedTransaction = await tronWeb.trx.sign(transaction);
    
    console.log('📡 Broadcasting transaction...');
    const result = await tronWeb.trx.sendRawTransaction(signedTransaction);
    
    if (result.result) {
      console.log('✅ Transaction sent successfully!');
      console.log('Transaction ID:', result.txid);
      console.log('🔍 Check on TronScan:', `https://tronscan.org/#/transaction/${result.txid}`);
      
      // Check new balance after a moment
      setTimeout(async () => {
        try {
          const newBalance = await tronWeb.trx.getBalance(fromAddress);
          const newBalanceTRX = tronWeb.fromSun(newBalance);
          console.log(`\n💰 New fuel wallet balance: ${newBalanceTRX} TRX`);
        } catch (e) {
          console.log('Could not fetch updated balance');
        }
      }, 3000);
      
    } else {
      console.log('❌ Transaction failed');
      console.log('Error:', result);
    }
    
  } catch (error) {
    console.error('❌ Error sending TRX:', error.message);
  }
}

sendTRXToMainWallet();