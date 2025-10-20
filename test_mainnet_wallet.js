const { TronWeb } = require('tronweb');
require('dotenv').config();

const privateKey = process.env.OWNER_WALLET_PRIVATE_KEY;

console.log('=== MAINNET WALLET TEST ===');
console.log('Private Key Length:', privateKey?.length || 'Not found');

if (!privateKey || privateKey.length !== 64) {
  console.log('❌ Invalid private key format');
  process.exit(1);
}

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: privateKey
});

async function testMainnetWallet() {
  try {
    const walletAddress = tronWeb.address.fromPrivateKey(privateKey);
    console.log('\n--- WALLET INFORMATION ---');
    console.log('Wallet Address:', walletAddress);
    
    console.log('\n--- CHECKING BALANCES ---');
    
    // Get TRX balance
    const balance = await tronWeb.trx.getBalance(walletAddress);
    const trxBalance = tronWeb.fromSun(balance);
    console.log('TRX Balance:', trxBalance, 'TRX');
    
    // Check if account is active
    const account = await tronWeb.trx.getAccount(walletAddress);
    console.log('Account Active:', !!account.address);
    
    // Get USDT balance
    console.log('\n--- CHECKING USDT BALANCE ---');
    const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    try {
      const contract = await tronWeb.contract().at(usdtContract);
      const usdtBalance = await contract.balanceOf(walletAddress).call();
      const usdtAmount = tronWeb.toBigNumber(usdtBalance).div(1000000).toString();
      console.log('USDT Balance:', usdtAmount, 'USDT');
      
      console.log('\n--- SUMMARY ---');
      console.log('✅ Private key is valid and working!');
      console.log('✅ Can access wallet data on mainnet');
      console.log('✅ Wallet Address:', walletAddress);
      console.log('✅ TRX Balance:', trxBalance, 'TRX');
      console.log('✅ USDT Balance:', usdtAmount, 'USDT');
      
      // Check if wallet has enough TRX for transactions
      if (parseFloat(trxBalance) > 0.1) {
        console.log('✅ Sufficient TRX for transactions');
      } else {
        console.log('⚠️  Low TRX balance - may need more for transaction fees');
      }
      
    } catch (usdtError) {
      console.log('❌ Could not fetch USDT balance:', usdtError.message);
    }
    
  } catch (error) {
    console.error('❌ Error testing wallet:', error.message);
  }
}

testMainnetWallet();