require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Transaction = require('./src/models/Transaction');

mongoose.connect(process.env.MONGODB_URI);

// Helper to get daily rate based on total deposit amount (from About Redstone page)
function getDailyRateForLevel(totalDeposit) {
  if (totalDeposit < 15) return 0; // No level yet
  if (totalDeposit < 50) return 0.02; // Basic: 2% daily
  if (totalDeposit < 300) return 0.02; // Bronze: 2% daily
  if (totalDeposit < 1000) return 0.025; // Silver: 2.5% daily
  if (totalDeposit < 2000) return 0.03; // Gold: 3% daily
  if (totalDeposit < 3500) return 0.035; // Platinum: 3.5% daily
  if (totalDeposit < 5000) return 0.04; // Diamond: 4% daily
  if (totalDeposit < 10000) return 0.045; // Ascendant: 4.5% daily
  return 0.05; // Radiant: 5% daily
}

async function calculatePreciseEarnings() {
  try {
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log('\n=== PRECISE EARNINGS CALCULATION ===');
    console.log('User:', user.email);
    console.log('Current Wallet Balance:', user.walletBalance);
    console.log('Current Total Deposit:', user.totalDeposit);
    console.log('Current Level Daily Rate:', user.dailyEarningRate);
    
    // Get ALL transactions sorted by time
    const allTxs = await Transaction.find({ 
      userId: user._id, 
      status: 'COMPLETED' 
    }).sort({ createdAt: 1 });
    
    console.log('\n=== TRANSACTION TIMELINE ===');
    
    const now = new Date();
    const SECONDS_PER_DAY = 86400;
    
    // Track balance changes over time
    let currentBalance = 0;
    let totalDeposits = 0;
    let currentDailyRate = 0;
    const events = [];
    
    allTxs.forEach(tx => {
      const event = {
        timestamp: tx.createdAt,
        type: tx.type,
        amount: tx.amount,
        balanceBefore: currentBalance,
        depositsBefore: totalDeposits,
        rateBefore: currentDailyRate
      };
      
      // Update balance
      currentBalance += tx.amount;
      
      // Update total deposits if this is a DEPOSIT transaction
      if (tx.type === 'DEPOSIT') {
        totalDeposits += tx.amount;
        // Recalculate rate based on new deposit level
        currentDailyRate = getDailyRateForLevel(totalDeposits);
      }
      
      event.balanceAfter = currentBalance;
      event.depositsAfter = totalDeposits;
      event.rateAfter = currentDailyRate;
      
      events.push(event);
    });
    
    console.log('\nTimeline of events:');
    events.forEach((e, idx) => {
      const daysAgo = (now - e.timestamp) / (1000 * 60 * 60 * 24);
      console.log(`\n${idx + 1}. ${e.timestamp.toISOString()} (${daysAgo.toFixed(2)} days ago)`);
      console.log(`   Type: ${e.type} | Amount: $${e.amount}`);
      console.log(`   Balance: $${e.balanceBefore} → $${e.balanceAfter}`);
      console.log(`   Total Deposits: $${e.depositsBefore} → $${e.depositsAfter}`);
      console.log(`   Daily Rate: ${(e.rateBefore * 100).toFixed(1)}% → ${(e.rateAfter * 100).toFixed(1)}%`);
    });
    
    // Now calculate compound earnings between each event
    console.log('\n=== COMPOUND EARNINGS CALCULATION (PER-SECOND) ===');
    console.log('Logic: Balance compounds PER SECOND at current rate until next event changes the rate');
    
    let runningBalance = 0;
    let totalEarnings = 0;
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const nextEvent = events[i + 1];
      const endTime = nextEvent ? nextEvent.timestamp : now;
      
      // Add the transaction amount to balance
      runningBalance += event.amount;
      
      // Calculate earnings from this event until next event (or now)
      const secondsInPeriod = Math.floor((endTime - event.timestamp) / 1000);
      const daysInPeriod = secondsInPeriod / SECONDS_PER_DAY;
      
      if (secondsInPeriod > 0 && event.rateAfter > 0) {
        const ratePerSecond = event.rateAfter / SECONDS_PER_DAY;
        // Compound per second: (1 + ratePerSecond)^seconds
        const compoundFactor = Math.pow(1 + ratePerSecond, secondsInPeriod);
        const earnings = runningBalance * (compoundFactor - 1);
        
        console.log(`\nPeriod ${i + 1}: ${event.timestamp.toISOString()} → ${endTime.toISOString()}`);
        console.log(`   Duration: ${daysInPeriod.toFixed(2)} days (${secondsInPeriod} seconds)`);
        console.log(`   Starting balance: $${runningBalance.toFixed(2)}`);
        console.log(`   Rate: ${(event.rateAfter * 100).toFixed(1)}% daily = ${(ratePerSecond * 100).toFixed(8)}% per second`);
        console.log(`   Compound factor: ${compoundFactor.toFixed(6)}`);
        console.log(`   Earnings: $${earnings.toFixed(2)}`);
        
        runningBalance += earnings;
        totalEarnings += earnings;
      }
    }
    
    console.log('\n=== FINAL RESULTS ===');
    console.log('Total deposits:', events.filter(e => e.type === 'DEPOSIT').reduce((sum, e) => sum + e.amount, 0));
    console.log('Total bonuses:', events.filter(e => e.type !== 'DEPOSIT').reduce((sum, e) => sum + e.amount, 0));
    console.log('Base wallet balance:', events.reduce((sum, e) => sum + e.amount, 0));
    console.log('Total compound earnings:', totalEarnings.toFixed(2));
    console.log('Final calculated balance:', runningBalance.toFixed(2));
    console.log('\nStored wallet balance:', user.walletBalance);
    console.log('Current API returns:', 12104.47);
    console.log('My calculation:', runningBalance.toFixed(2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

calculatePreciseEarnings();
