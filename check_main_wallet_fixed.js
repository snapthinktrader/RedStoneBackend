const { TronWeb } = require('tronweb');
require('dotenv').config();

const MAIN_WALLET = 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu';
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': process.env.tron_api_key || '' }
});

async function checkMainWallet() {
  try {
    console.log('🔍 MAIN WALLET CHECK');
    console.log('━'.repeat(60));
    console.log('📍 Address:', MAIN_WALLET);
    console.log('');
    
    // Get TRX balance
    const trxBalance = await tronWeb.trx.getBalance(MAIN_WALLET);
    const trxAmount = tronWeb.fromSun(trxBalance);
    console.log('💰 TRX Balance:', trxAmount, 'TRX');
    
    // Get USDT balance using TronScan API (more reliable)
    console.log('🔍 Checking USDT balance...');
    try {
      const response = await fetch(`https://apilist.tronscan.org/api/account?address=${MAIN_WALLET}`);
      if (response.ok) {
        const data = await response.json();
        const usdtToken = data.trc20token_balances?.find(token => token.tokenId === USDT_CONTRACT);
        if (usdtToken) {
          const usdtAmount = (parseFloat(usdtToken.balance) / 1000000).toString();
          console.log('💵 USDT Balance:', usdtAmount, 'USDT');
        } else {
          console.log('💵 USDT Balance: 0 USDT');
        }
      } else {
        console.log('💵 USDT Balance: 0 USDT (TronScan API error)');
      }
    } catch (err) {
      console.log('💵 USDT Balance: 0 USDT (API unavailable)');
    }
    
    // Get account info
    console.log('');
    console.log('📊 Account Information:');
    const account = await tronWeb.trx.getAccount(MAIN_WALLET);
    
    if (account && account.address) {
      console.log('✅ Account exists on blockchain');
      console.log('🏷️  Account Type:', account.type || 'Normal');
      
      if (account.account_resource) {
        console.log('⚡ Energy:', account.account_resource.energy_usage || 0);
        console.log('📡 Bandwidth:', account.account_resource.net_usage || 0);
      }
    } else {
      console.log('❌ Account not found or inactive');
    }
    
    // Get recent transactions using TronScan API
    console.log('');
    console.log('📋 Recent Transactions:');
    try {
      const response = await fetch(`https://apilist.tronscan.org/api/transaction?sort=-timestamp&count=true&limit=5&start=0&address=${MAIN_WALLET}`);
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          data.data.forEach((tx, index) => {
            console.log(`${index + 1}. TX ID: ${tx.hash}`);
            console.log(`   Type: ${tx.contractType || 'Transfer'}`);
            console.log(`   Timestamp: ${new Date(tx.timestamp).toLocaleString()}`);
            console.log(`   Amount: ${tx.amount ? (tx.amount / 1000000) + ' USDT' : 'N/A'}`);
            console.log('');
          });
        } else {
          console.log('✅ No recent transactions found (wallet clean)');
        }
      } else {
        console.log('⚠️  Could not fetch transactions (TronScan API unavailable)');
      }
    } catch (txError) {
      console.log('⚠️  Could not fetch transactions:', txError.message);
    }
    
    console.log('');
    console.log('🌐 Network: Mainnet');
    console.log('🔗 API Key:', process.env.tron_api_key ? 'Configured ✅' : 'Missing ❌');
    console.log('✅ Main wallet check complete');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkMainWallet();