require('dotenv').config();
const { TronWeb } = require('tronweb');

const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io'
});

const walletAddress = 'TSf6zjTxDDWkh45jQKdLbgNBWmH1DKKbZa';

async function checkBalances() {
  console.log('\n📊 WALLET STATUS CHECK');
  console.log('═══════════════════════════════════════════════════════');
  console.log('Wallet:', walletAddress);
  
  // Check TRX balance
  try {
    const trxBalance = await tronWeb.trx.getBalance(walletAddress);
    const trxAmount = parseFloat(tronWeb.fromSun(trxBalance));
    console.log('\n💵 TRX Balance:', trxAmount.toFixed(6), 'TRX');
  } catch (error) {
    console.log('\n❌ TRX Balance Error:', error.message);
  }
  
  // Check USDT balance
  try {
    const usdtContractAddress = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    
    // Method 1: Direct API call
    const parameter = [{type:'address',value:walletAddress}];
    const options = {
      feeLimit: 100000000,
      callValue: 0
    };
    
    const result = await tronWeb.transactionBuilder.triggerConstantContract(
      usdtContractAddress,
      'balanceOf(address)',
      options,
      parameter
    );
    
    if (result && result.constant_result && result.constant_result[0]) {
      const balanceHex = result.constant_result[0];
      const balance = tronWeb.toBigNumber('0x' + balanceHex);
      const usdtAmount = balance.dividedBy(1000000).toNumber();
      console.log('💵 USDT Balance:', usdtAmount.toFixed(2), 'USDT');
    }
  } catch (error) {
    console.log('❌ USDT Balance Error:', error.message);
  }
  
  // Get account info
  try {
    const account = await tronWeb.trx.getAccount(walletAddress);
    console.log('\n📋 Account Info:');
    console.log('Account exists:', !!account.address);
    if (account.balance) {
      console.log('Balance (sun):', account.balance);
    }
  } catch (error) {
    console.log('\n❌ Account Info Error:', error.message);
  }
  
  console.log('\n═══════════════════════════════════════════════════════');
}

checkBalances().catch(console.error);
