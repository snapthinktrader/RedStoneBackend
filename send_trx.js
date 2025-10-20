const { TronWeb } = require('tronweb');
require('dotenv').config();

const privateKey = process.env.OWNER_WALLET_PRIVATE_KEY;
const fromAddress = 'T9yPwwZiMbcLuhKWUtHwqLEoqqvm4S9mYJ'; // Current wallet

// You need to provide your main wallet address
const toAddress = process.argv[2]; // Will be passed as command line argument

if (!toAddress) {
  console.log('❌ Please provide your main wallet address as an argument');
  console.log('Usage: node send_trx.js <your_main_wallet_address>');
  console.log('Example: node send_trx.js TYourMainWalletAddressHere');
  process.exit(1);
}

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: privateKey
});

async function sendTRX() {
  try {
    console.log('🚀 Preparing TRX transfer...');
    console.log('From:', fromAddress);
    console.log('To:', toAddress);
    console.log('Amount: 5 TRX');
    
    // Check current balance
    const balance = await tronWeb.trx.getBalance(fromAddress);
    const balanceTRX = tronWeb.fromSun(balance);
    console.log(`\n💰 Current balance: ${balanceTRX} TRX`);
    
    if (balanceTRX < 5) {
      console.log('❌ Insufficient balance to send 5 TRX');
      return;
    }
    
    // Validate destination address
    if (!tronWeb.isAddress(toAddress)) {
      console.log('❌ Invalid destination address');
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
          console.log(`\n💰 New balance: ${newBalanceTRX} TRX`);
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

sendTRX();