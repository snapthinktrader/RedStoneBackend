require('dotenv').config();
const mongoose = require('mongoose');
const Deposit = require('./src/models/Deposit');
const { TronWeb } = require('tronweb');
const GasFeeCalculatorService = require('./src/services/GasFeeCalculatorService');

const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io'
});

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const depositId = '68ea4394dd04208fb3feadd3';
  const deposit = await Deposit.findById(depositId);
  const walletAddress = deposit.address || deposit.walletBackup?.address;
  
  console.log('\n🔍 PRE-FLIGHT CHECK FOR SWEEP RETRY');
  console.log('═══════════════════════════════════════════════════════');
  console.log('Deposit ID:', depositId);
  console.log('Wallet:', walletAddress);
  console.log('Amount:', deposit.amount, 'USDT');
  console.log('═══════════════════════════════════════════════════════\n');
  
  let allChecksPassed = true;
  const issues = [];
  
  // ══════════════════════════════════════════════════════════
  // CHECK 1: Verify USDT is still in wallet
  // ══════════════════════════════════════════════════════════
  console.log('✓ CHECK 1: USDT Balance');
  console.log('─────────────────────────────────────────────────────');
  
  let usdtBalance = 0;
  try {
    const parameter = [{type:'address',value:walletAddress}];
    const options = {
      feeLimit: 100000000,
      callValue: 0
    };
    const result = await tronWeb.transactionBuilder.triggerConstantContract(
      'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      'balanceOf(address)',
      options,
      parameter,
      walletAddress // Set the caller address
    );
    
    if (result && result.constant_result && result.constant_result[0]) {
      const balanceHex = result.constant_result[0];
      const balance = tronWeb.toBigNumber('0x' + balanceHex);
      usdtBalance = balance.dividedBy(1000000).toNumber();
    }
    
    if (usdtBalance >= deposit.amount) {
      console.log(`✅ USDT Balance: ${usdtBalance} USDT (Expected: ${deposit.amount} USDT)`);
    } else {
      console.log(`❌ USDT Balance: ${usdtBalance} USDT (Expected: ${deposit.amount} USDT)`);
      allChecksPassed = false;
      issues.push(`Insufficient USDT: Has ${usdtBalance}, needs ${deposit.amount}`);
    }
  } catch (error) {
    console.log(`❌ Error checking USDT: ${error.message}`);
    allChecksPassed = false;
    issues.push('Cannot verify USDT balance');
  }
  
  // ══════════════════════════════════════════════════════════
  // CHECK 2: Calculate EXACT gas needed
  // ══════════════════════════════════════════════════════════
  console.log('\n✓ CHECK 2: Gas Fee Calculation');
  console.log('─────────────────────────────────────────────────────');
  
  let gasNeeded = 0;
  try {
    const gasCalc = new GasFeeCalculatorService();
    const result = await gasCalc.calculateSweepGasFees(
      walletAddress,
      'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu', // Main wallet
      deposit.amount
    );
    
    gasNeeded = result.trxNeeded;
    console.log(`✅ Gas calculation successful`);
    console.log(`   Energy required: ~130,285 units`);
    console.log(`   USDT transfer cost: ${result.breakdown.usdtTransferCost.toFixed(6)} TRX`);
    console.log(`   Buffer: ${result.breakdown.buffer} TRX`);
    console.log(`   TOTAL NEEDED: ${gasNeeded.toFixed(6)} TRX`);
  } catch (error) {
    console.log(`❌ Gas calculation error: ${error.message}`);
    allChecksPassed = false;
    issues.push('Cannot calculate gas fees');
  }
  
  // ══════════════════════════════════════════════════════════
  // CHECK 3: Verify current TRX balance
  // ══════════════════════════════════════════════════════════
  console.log('\n✓ CHECK 3: Current TRX Balance');
  console.log('─────────────────────────────────────────────────────');
  
  let currentTrx = 0;
  try {
    const trxBalance = await tronWeb.trx.getBalance(walletAddress);
    currentTrx = parseFloat(tronWeb.fromSun(trxBalance));
    console.log(`Current TRX: ${currentTrx.toFixed(6)} TRX`);
    
    if (currentTrx >= gasNeeded) {
      console.log(`✅ Sufficient TRX available (${currentTrx.toFixed(6)} >= ${gasNeeded.toFixed(6)})`);
    } else {
      console.log(`❌ Insufficient TRX`);
      console.log(`   Has: ${currentTrx.toFixed(6)} TRX`);
      console.log(`   Needs: ${gasNeeded.toFixed(6)} TRX`);
      console.log(`   MISSING: ${(gasNeeded - currentTrx).toFixed(6)} TRX`);
      allChecksPassed = false;
      issues.push(`Need to send ${(gasNeeded - currentTrx).toFixed(6)} more TRX`);
    }
  } catch (error) {
    console.log(`❌ Error checking TRX: ${error.message}`);
    allChecksPassed = false;
    issues.push('Cannot verify TRX balance');
  }
  
  // ══════════════════════════════════════════════════════════
  // CHECK 4: Verify private key exists and can be decrypted
  // ══════════════════════════════════════════════════════════
  console.log('\n✓ CHECK 4: Private Key Availability');
  console.log('─────────────────────────────────────────────────────');
  
  if (deposit.walletPrivateKey) {
    console.log(`✅ Encrypted private key exists in database`);
    
    // Try to decrypt
    try {
      const EnhancedHDWalletService = require('./src/services/EnhancedHDWalletService');
      const hdWalletService = new EnhancedHDWalletService();
      const privateKey = hdWalletService.decryptPrivateKey(deposit.walletPrivateKey);
      
      if (privateKey && privateKey.length === 64) {
        console.log(`✅ Private key successfully decrypted (length: ${privateKey.length})`);
        
        // Verify it matches the wallet address
        tronWeb.setPrivateKey(privateKey);
        const derivedAddress = tronWeb.address.fromPrivateKey(privateKey);
        
        if (derivedAddress === walletAddress) {
          console.log(`✅ Private key matches wallet address`);
        } else {
          console.log(`❌ Private key mismatch!`);
          console.log(`   Expected: ${walletAddress}`);
          console.log(`   Got: ${derivedAddress}`);
          allChecksPassed = false;
          issues.push('Private key does not match wallet address');
        }
      } else {
        console.log(`❌ Invalid private key after decryption`);
        allChecksPassed = false;
        issues.push('Private key invalid');
      }
    } catch (error) {
      console.log(`❌ Cannot decrypt private key: ${error.message}`);
      allChecksPassed = false;
      issues.push('Cannot decrypt private key');
    }
  } else {
    console.log(`❌ No encrypted private key found in database`);
    allChecksPassed = false;
    issues.push('Missing private key');
  }
  
  // ══════════════════════════════════════════════════════════
  // CHECK 5: Verify destination wallets are valid
  // ══════════════════════════════════════════════════════════
  console.log('\n✓ CHECK 5: Destination Wallet Verification');
  console.log('─────────────────────────────────────────────────────');
  
  const mainWallet = process.env.MAIN_WALLET_ADDRESS || 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu';
  const fuelWallet = process.env.FUEL_WALLET_ADDRESS || 'T9yPwwZiMbcLuhKWUtHwqLEoqqvm4S9mYJ';
  
  try {
    const mainAccount = await tronWeb.trx.getAccount(mainWallet);
    if (mainAccount.address) {
      console.log(`✅ Main wallet exists: ${mainWallet}`);
    } else {
      console.log(`❌ Main wallet not found: ${mainWallet}`);
      allChecksPassed = false;
      issues.push('Main wallet does not exist');
    }
  } catch (error) {
    console.log(`❌ Cannot verify main wallet: ${error.message}`);
    allChecksPassed = false;
    issues.push('Cannot verify main wallet');
  }
  
  try {
    const fuelAccount = await tronWeb.trx.getAccount(fuelWallet);
    if (fuelAccount.address) {
      console.log(`✅ Fuel wallet exists: ${fuelWallet}`);
    } else {
      console.log(`❌ Fuel wallet not found: ${fuelWallet}`);
      allChecksPassed = false;
      issues.push('Fuel wallet does not exist');
    }
  } catch (error) {
    console.log(`❌ Cannot verify fuel wallet: ${error.message}`);
    allChecksPassed = false;
    issues.push('Cannot verify fuel wallet');
  }
  
  // ══════════════════════════════════════════════════════════
  // CHECK 6: Verify network conditions
  // ══════════════════════════════════════════════════════════
  console.log('\n✓ CHECK 6: Network Status');
  console.log('─────────────────────────────────────────────────────');
  
  try {
    const chainParams = await tronWeb.trx.getChainParameters();
    const energyFee = chainParams.find(p => p.key === 'getEnergyFee');
    console.log(`✅ Network connected`);
    console.log(`   Current energy price: ${energyFee ? energyFee.value : 'unknown'} sun/unit`);
  } catch (error) {
    console.log(`❌ Network error: ${error.message}`);
    allChecksPassed = false;
    issues.push('Network connection issues');
  }
  
  // ══════════════════════════════════════════════════════════
  // CHECK 7: Database status check
  // ══════════════════════════════════════════════════════════
  console.log('\n✓ CHECK 7: Database Status');
  console.log('─────────────────────────────────────────────────────');
  
  console.log(`Current Status: ${deposit.status}`);
  console.log(`Current Sweep Status: ${deposit.sweepStatus}`);
  console.log(`Previous Attempts: ${deposit.sweepAttempts || 0}`);
  
  if (deposit.status === 'CONFIRMED') {
    console.log(`✅ Deposit status is CONFIRMED (ready for sweep)`);
  } else {
    console.log(`⚠️  Deposit status is ${deposit.status} (expected CONFIRMED)`);
  }
  
  // ══════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ══════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 FINAL PRE-FLIGHT SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');
  
  if (allChecksPassed) {
    console.log('✅ ✅ ✅ ALL CHECKS PASSED! ✅ ✅ ✅');
    console.log('\n🎯 Ready to proceed with sweep:');
    console.log(`   1. ${usdtBalance} USDT will be swept to main wallet`);
    console.log(`   2. Will use ${gasNeeded.toFixed(6)} TRX for gas`);
    console.log(`   3. Remaining TRX (~${(currentTrx - gasNeeded).toFixed(6)} TRX) will be recovered to fuel wallet`);
    console.log(`   4. Status will update to COMPLETED`);
    console.log('\n💡 To proceed, run: node execute_sweep.js');
  } else {
    console.log('❌ ❌ ❌ CHECKS FAILED! DO NOT PROCEED! ❌ ❌ ❌');
    console.log('\n🚫 Issues found:');
    issues.forEach((issue, index) => {
      console.log(`   ${index + 1}. ${issue}`);
    });
    console.log('\n⚠️  Fix all issues before retrying sweep!');
    
    if (issues.some(i => i.includes('Need to send'))) {
      const missingTrx = gasNeeded - currentTrx;
      console.log('\n💰 REQUIRED ACTION:');
      console.log(`   Send ${missingTrx.toFixed(6)} TRX to: ${walletAddress}`);
      console.log(`   Then run this check again.`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════\n');
  
  process.exit(allChecksPassed ? 0 : 1);
}).catch(err => {
  console.error('\n❌ FATAL ERROR:', err.message);
  console.error(err);
  process.exit(1);
});
