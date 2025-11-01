const { default: TronWeb } = require('tronweb');

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY || '' }
});

const MAIN_WALLET = 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu';
const FUEL_WALLET = 'T9yPwwZiMbcLuhKWUtHwqLEoqqvm4S9mYJ';
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

async function checkWallets() {
  try {
    console.log('🔍 MAIN WALLET CHECK');
    console.log('━'.repeat(60));
    console.log('📍 Address:', MAIN_WALLET);
    console.log('');
    
    const mainTrxBalance = await tronWeb.trx.getBalance(MAIN_WALLET);
    const mainTrxAmount = tronWeb.fromSun(mainTrxBalance);
    console.log('💰 TRX Balance:', mainTrxAmount, 'TRX');
    
    try {
      const contract = await tronWeb.contract().at(USDT_CONTRACT);
      const mainUsdtBalance = await contract.balanceOf(MAIN_WALLET).call();
      const mainUsdtAmount = tronWeb.fromSun(mainUsdtBalance);
      console.log('💵 USDT Balance:', mainUsdtAmount, 'USDT');
    } catch (err) {
      console.log('💵 USDT Balance: 0 USDT (API error)');
    }
    
    console.log('');
    console.log('🔍 FUEL WALLET CHECK');
    console.log('━'.repeat(60));
    console.log('📍 Address:', FUEL_WALLET);
    console.log('');
    
    const fuelTrxBalance = await tronWeb.trx.getBalance(FUEL_WALLET);
    const fuelTrxAmount = tronWeb.fromSun(fuelTrxBalance);
    console.log('💰 TRX Balance:', fuelTrxAmount, 'TRX');
    
    try {
      const contract = await tronWeb.contract().at(USDT_CONTRACT);
      const fuelUsdtBalance = await contract.balanceOf(FUEL_WALLET).call();
      const fuelUsdtAmount = tronWeb.fromSun(fuelUsdtBalance);
      console.log('💵 USDT Balance:', fuelUsdtAmount, 'USDT');
    } catch (err) {
      console.log('💵 USDT Balance: 0 USDT (API error)');
    }
    
    console.log('');
    console.log('✅ Wallet check complete');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkWallets();
