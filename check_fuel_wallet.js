const { TronWeb } = require('tronweb');

// Fuel wallet private key
const fuelPrivateKey = '3431d2938e26b4ed7208fdd613371d5b7ef83368099d5c0ee45f732ce5123059';

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: fuelPrivateKey
});

async function checkFuelWalletData() {
  try {
    console.log('🔍 Checking fuel wallet data...\n');
    
    // Derive wallet address from private key
    const walletAddress = tronWeb.address.fromPrivateKey(fuelPrivateKey);
    console.log('📍 Wallet Address:', walletAddress);
    
    // Get TRX balance
    const balance = await tronWeb.trx.getBalance(walletAddress);
    const balanceTRX = tronWeb.fromSun(balance);
    console.log('💰 TRX Balance:', balanceTRX, 'TRX');
    
    // Get account information
    console.log('\n📊 Account Information:');
    const account = await tronWeb.trx.getAccount(walletAddress);
    
    if (account && account.address) {
      console.log('✅ Account exists on blockchain');
      console.log('🏷️  Account Type:', account.type || 'Normal');
      
      // Account resources
      if (account.account_resource) {
        console.log('⚡ Energy:', account.account_resource.energy_usage || 0);
        console.log('📡 Bandwidth:', account.account_resource.net_usage || 0);
      }
      
      // Frozen balance info
      if (account.frozen) {
        console.log('🧊 Frozen Balance:', account.frozen.map(f => `${tronWeb.fromSun(f.frozen_balance)} TRX`).join(', '));
      }
    } else {
      console.log('❌ Account not found or inactive');
    }
    
    // Check USDT (TRC20) balance
    console.log('\n💵 USDT Balance:');
    try {
      const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // USDT TRC20 contract
      const contract = await tronWeb.contract().at(usdtContract);
      const usdtBalance = await contract.balanceOf(walletAddress).call();
      const usdtAmount = tronWeb.toBigNumber(usdtBalance).div(1000000).toString();
      console.log('💰 USDT Balance:', usdtAmount, 'USDT');
    } catch (usdtError) {
      console.log('❌ Could not fetch USDT balance:', usdtError.message);
    }
    
    // Get recent transactions using TronScan API (alternative)
    console.log('\n📋 Recent Transactions:');
    try {
      const response = await fetch(`https://apilist.tronscan.org/api/transaction?sort=-timestamp&count=true&limit=5&start=0&address=${walletAddress}`);
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
    
    // Network status
    console.log('🌐 Network: Mainnet');
    console.log('🔗 TronGrid API: Connected');
    
  } catch (error) {
    console.error('❌ Error checking wallet data:', error.message);
  }
}

checkFuelWalletData();