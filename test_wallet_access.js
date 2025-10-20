const { TronWeb } = require('tronweb');
require('dotenv').config();

const privateKey = process.env.OWNER_WALLET_PRIVATE_KEY;
const walletAddress = process.env.MAINNET_OWNER_WALLET;

console.log('Testing wallet access...');
console.log('Private Key:', privateKey ? `Found (length: ${privateKey.length})` : 'Missing');
console.log('Wallet Address:', walletAddress);

if (!privateKey || !walletAddress) {
  console.log('Missing required environment variables');
  process.exit(1);
}

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: privateKey
});

async function testWallet() {
  try {
    console.log('\n--- Testing Private Key ---');
    const derivedAddress = tronWeb.address.fromPrivateKey(privateKey);
    console.log('Derived Address:', derivedAddress);
    console.log('Addresses Match:', derivedAddress === walletAddress);
    
    console.log('\n--- Getting Wallet Balance ---');
    const balance = await tronWeb.trx.getBalance(walletAddress);
    console.log('TRX Balance:', tronWeb.fromSun(balance), 'TRX');
    
    console.log('\n--- Getting Account Info ---');
    const account = await tronWeb.trx.getAccount(walletAddress);
    console.log('Account exists:', !!account.address);
    
    if (account.address) {
      console.log('Account Type:', account.type || 'Normal');
      console.log('Account Resources:', {
        bandwidth: account.bandwidth || 0,
        energy: account.energy || 0
      });
    }
    
    console.log('\n--- Testing USDT Balance ---');
    // USDT TRC20 contract address
    const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    try {
      const contract = await tronWeb.contract().at(usdtContract);
      const usdtBalance = await contract.balanceOf(walletAddress).call();
      console.log('USDT Balance:', tronWeb.toBigNumber(usdtBalance).div(1000000).toString(), 'USDT');
    } catch (usdtError) {
      console.log('Could not fetch USDT balance:', usdtError.message);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testWallet().catch(console.error);