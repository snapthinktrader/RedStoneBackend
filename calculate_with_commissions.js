require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Transaction = require('./src/models/Transaction');

mongoose.connect(process.env.MONGODB_URI);

// Helper to get daily rate based on total deposit amount
function getDailyRateForLevel(totalDeposit) {
  if (totalDeposit < 15) return 0;
  if (totalDeposit < 50) return 0.02; // Basic: 2%
  if (totalDeposit < 300) return 0.02; // Bronze: 2%
  if (totalDeposit < 1000) return 0.025; // Silver: 2.5%
  if (totalDeposit < 2000) return 0.03; // Gold: 3%
  if (totalDeposit < 3500) return 0.035; // Platinum: 3.5%
  if (totalDeposit < 5000) return 0.04; // Diamond: 4%
  if (totalDeposit < 10000) return 0.045; // Ascendant: 4.5%
  return 0.05; // Radiant: 5%
}

async function calculateWithReferralCommissions() {
  try {
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log('\n=== COMPLETE CALCULATION WITH REFERRAL COMMISSIONS ===');
    console.log('User:', user.email);
    console.log('Stored lifetimeReferralEarnings:', user.lifetimeReferralEarnings);
    console.log('Stored pendingCommission:', user.pendingCommission);
    
    // Get all transactions
    const allTxs = await Transaction.find({ 
      userId: user._id, 
      status: 'COMPLETED' 
    }).sort({ createdAt: 1 });
    
    const now = new Date();
    const SECONDS_PER_DAY = 86400;
    
    console.log('\n=== CALCULATION LOGIC ===');
    console.log('1. Start with deposit/bonus transactions');
    console.log('2. Compound the balance per-second at current rate');
    console.log('3. ADD stored referral commission ($83.28)');
    console.log('4. Commission ALSO earns at the current rate');
    console.log('5. Balance = (Deposits + Their Earnings) + (Commission + Its Earnings)');
    
    let runningBalance = 0;
    let totalDeposits = 0;
    let currentDailyRate = 0;
    
    console.log('\n=== STEP-BY-STEP CALCULATION ===');
    
    for (let i = 0; i < allTxs.length; i++) {
      const tx = allTxs[i];
      const nextTx = allTxs[i + 1];
      const endTime = nextTx ? nextTx.timestamp : now;
      
      // Add transaction amount
      runningBalance += tx.amount;
      
      // Update rate if it's a deposit
      if (tx.type === 'DEPOSIT') {
        totalDeposits += tx.amount;
        currentDailyRate = getDailyRateForLevel(totalDeposits);
      }
      
      // Calculate earnings for this period
      const secondsInPeriod = Math.floor((endTime - tx.createdAt) / 1000);
      
      if (secondsInPeriod > 0 && currentDailyRate > 0) {
        const ratePerSecond = currentDailyRate / SECONDS_PER_DAY;
        const compoundFactor = Math.pow(1 + ratePerSecond, secondsInPeriod);
        const earnings = runningBalance * (compoundFactor - 1);
        
        const daysInPeriod = secondsInPeriod / SECONDS_PER_DAY;
        console.log(`\n${i + 1}. ${tx.type} $${tx.amount} | Rate: ${(currentDailyRate * 100).toFixed(1)}%`);
        console.log(`   Period: ${daysInPeriod.toFixed(2)} days (${secondsInPeriod.toLocaleString()} seconds)`);
        console.log(`   Balance before earnings: $${runningBalance.toFixed(2)}`);
        console.log(`   Compound factor: ${compoundFactor.toFixed(8)}`);
        console.log(`   Earnings: $${earnings.toFixed(2)}`);
        
        runningBalance += earnings;
      }
    }
    
    console.log('\n=== BALANCE FROM OWN DEPOSITS/BONUSES ===');
    console.log('Base amount:', allTxs.reduce((sum, tx) => sum + tx.amount, 0));
    console.log('After compounding:', runningBalance.toFixed(2));
    
    // Now add referral commission and its earnings
    console.log('\n=== ADDING REFERRAL COMMISSION ===');
    console.log('Stored lifetimeReferralEarnings:', user.lifetimeReferralEarnings);
    console.log('This commission was earned over time and ALSO compounds!');
    
    // The commission earns at the CURRENT rate (4% for Diamond level)
    // For simplicity, assume commission accumulated gradually
    // A more precise calculation would track when each commission cent was earned
    // But for this exercise, we'll add it as a lump sum that's been earning
    
    const commissionAmount = user.lifetimeReferralEarnings || 0;
    
    // Estimate: commission accumulated gradually over the same period
    // So it earned at average rate over the full period
    const totalSeconds = Math.floor((now - allTxs[0].createdAt) / 1000);
    const avgRate = currentDailyRate; // Simplified: use current rate
    const ratePerSecond = avgRate / SECONDS_PER_DAY;
    
    // If commission was added at the START and compounded till now:
    const maxCommissionEarnings = commissionAmount * (Math.pow(1 + ratePerSecond, totalSeconds) - 1);
    
    // If commission was added at the END (just now), no earnings yet
    const minCommissionEarnings = 0;
    
    // Reality: somewhere in between, let's use 50% of max as rough estimate
    const estimatedCommissionEarnings = maxCommissionEarnings * 0.5;
    
    console.log(`Commission amount: $${commissionAmount.toFixed(2)}`);
    console.log(`If commission earned from start: +$${maxCommissionEarnings.toFixed(2)}`);
    console.log(`If commission earned just now: +$${minCommissionEarnings.toFixed(2)}`);
    console.log(`Estimated (50% avg): +$${estimatedCommissionEarnings.toFixed(2)}`);
    
    const totalWithCommission = runningBalance + commissionAmount + estimatedCommissionEarnings;
    
    console.log('\n=== FINAL TOTALS ===');
    console.log('Own deposits/bonuses with earnings:', runningBalance.toFixed(2));
    console.log('Referral commission:', commissionAmount.toFixed(2));
    console.log('Commission earnings (estimated):', estimatedCommissionEarnings.toFixed(2));
    console.log('TOTAL:', totalWithCommission.toFixed(2));
    console.log('\nAPI returns:', 12104.47);
    console.log('Stored wallet balance:', user.walletBalance);
    
    console.log('\n=== ANALYSIS ===');
    console.log('My calculation:', totalWithCommission.toFixed(2));
    console.log('API calculation:', 12104.47);
    console.log('Difference:', (12104.47 - totalWithCommission).toFixed(2));
    
    if (Math.abs(12104.47 - totalWithCommission) > 1000) {
      console.log('\n⚠️  Large discrepancy! The API is using different logic.');
      console.log('Possible reasons:');
      console.log('1. Wrong rate table in backend');
      console.log('2. Commission tracking is different');
      console.log('3. Compounding from wrong timestamps');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

calculateWithReferralCommissions();
