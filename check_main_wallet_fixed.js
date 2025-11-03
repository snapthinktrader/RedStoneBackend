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
    
    // Get USDT balance using contract call
    console.log('🔍 Checking USDT balance...');
    try {
      const contract = await tronWeb.contract().at(USDT_CONTRACT);
      const usdtBalance = await contract.balanceOf(MAIN_WALLET).call();
      const usdtAmount = (parseFloat(usdtBalance.toString()) / 1000000).toFixed(2);
      console.log('💵 USDT Balance:', usdtAmount, 'USDT');
    } catch (err) {
      console.log('💵 USDT Balance: 0 USDT (Error:', err.message, ')');
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
    
    // Get recent TRX transactions
    console.log('');
    console.log('📋 Recent TRX Transactions:');
    try {
      const trxTxs = await tronWeb.trx.getTransactionsRelated(MAIN_WALLET, 'all', 5);
      if (trxTxs && trxTxs.length > 0) {
        trxTxs.forEach((tx, index) => {
          const type = tx.raw_data?.contract?.[0]?.type || 'Unknown';
          const timestamp = tx.raw_data?.timestamp || 0;
          console.log(`${index + 1}. Type: ${type}`);
          console.log(`   Time: ${new Date(timestamp).toLocaleString()}`);
          console.log(`   TX: ${tx.txID}`);
          console.log('');
        });
      } else {
        console.log('✅ No recent TRX transactions');
      }
    } catch (txError) {
      console.log('⚠️  Could not fetch TRX transactions:', txError.message);
    }
    
    // Get recent USDT (TRC20) transactions
    console.log('📋 Recent USDT (TRC20) Transactions:');
    try {
      const response = await fetch(`https://apilist.tronscan.org/api/token_trc20/transfers?limit=10&start=0&sort=-timestamp&count=true&relatedAddress=${MAIN_WALLET}&contract_address=${USDT_CONTRACT}`);
      if (response.ok) {
        const data = await response.json();
        if (data.token_transfers && data.token_transfers.length > 0) {
          let totalIn = 0;
          let totalOut = 0;
          
          data.token_transfers.forEach((tx, index) => {
            const amount = parseFloat(tx.quant) / 1000000;
            const isIncoming = tx.to_address === MAIN_WALLET;
            const direction = isIncoming ? '📥 IN' : '📤 OUT';
            
            if (isIncoming) {
              totalIn += amount;
            } else {
              totalOut += amount;
            }
            
            console.log(`${index + 1}. ${direction} ${amount.toFixed(2)} USDT`);
            console.log(`   From: ${tx.from_address.substring(0, 10)}...`);
            console.log(`   To: ${tx.to_address.substring(0, 10)}...`);
            console.log(`   Time: ${new Date(tx.block_timestamp).toLocaleString()}`);
            console.log('');
          });
          
          console.log('━'.repeat(60));
          console.log('📊 USDT Transaction Summary:');
          console.log(`   Total Received: ${totalIn.toFixed(2)} USDT`);
          console.log(`   Total Sent: ${totalOut.toFixed(2)} USDT`);
          console.log(`   Net Balance: ${(totalIn - totalOut).toFixed(2)} USDT`);
        } else {
          console.log('✅ No recent USDT transactions');
        }
      } else {
        console.log('⚠️  Could not fetch USDT transactions (TronScan API unavailable)');
      }
    } catch (txError) {
      console.log('⚠️  Could not fetch USDT transactions:', txError.message);
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