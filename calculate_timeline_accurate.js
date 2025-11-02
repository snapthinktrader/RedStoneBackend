require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Transaction = require('./src/models/Transaction');

mongoose.connect(process.env.MONGODB_URI);

// Correct rates from About Redstone page
function getDailyRateForLevel(totalDeposit) {
  if (totalDeposit < 15) return 0;
  if (totalDeposit < 50) return 0.02;
  if (totalDeposit < 300) return 0.02;
  if (totalDeposit < 1000) return 0.025; // Silver
  if (totalDeposit < 2000) return 0.03; // Gold
  if (totalDeposit < 3500) return 0.035; // Platinum
  if (totalDeposit < 5000) return 0.04; // Diamond
  if (totalDeposit < 10000) return 0.045; // Ascendant
  return 0.05; // Radiant
}

async function calculateWithTimeline() {
  try {
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log('\n=== TIMELINE-BASED CALCULATION ===');
    console.log('User:', user.email);
    console.log('User Created:', user.createdAt.toISOString());
    
    // Get all transactions sorted by time
    const allTxs = await Transaction.find({ 
      userId: user._id, 
      status: 'COMPLETED' 
    }).sort({ createdAt: 1 });
    
    // Get referrals to calculate commission
    const referrals = await User.find({ 
      referredBy: user._id, 
      isActive: true 
    }).select('walletBalance totalDeposit createdAt');
    
    console.log('Total transactions:', allTxs.length);
    console.log('Total referrals:', referrals.length);
    
    const now = new Date();
    const SECONDS_PER_DAY = 86400;
    
    // Build timeline of ALL events
    const timeline = [];
    
    // Add transaction events
    allTxs.forEach(tx => {
      timeline.push({
        timestamp: tx.createdAt,
        type: 'TRANSACTION',
        subtype: tx.type,
        amount: tx.amount,
        description: tx.description
      });
    });
    
    // Sort timeline by timestamp
    timeline.sort((a, b) => a.timestamp - b.timestamp);
    
    console.log('\n=== COMPLETE TIMELINE ===');
    
    let balance = 0;
    let totalDeposits = 0;
    let dailyRate = 0;
    let commissionRate = user.getCommissionRate(); // 15% based on referral level
    
    // Calculate referral commission per second (constant throughout)
    let referralCommissionPerSecond = 0;
    for (const ref of referrals) {
      const refDailyRate = getDailyRateForLevel(ref.totalDeposit);
      const refEarningsPerDay = ref.walletBalance * refDailyRate;
      const myCommissionPerDay = refEarningsPerDay * commissionRate;
      referralCommissionPerSecond += myCommissionPerDay / SECONDS_PER_DAY;
    }
    
    console.log('\nReferral Commission Rate:', commissionRate * 100 + '%');
    console.log('Referral Commission Per Second: $' + referralCommissionPerSecond.toFixed(8));
    console.log('Referral Commission Per Day: $' + (referralCommissionPerSecond * SECONDS_PER_DAY).toFixed(2));
    
    // Process each event in timeline
    for (let i = 0; i < timeline.length; i++) {
      const event = timeline[i];
      const nextEvent = timeline[i + 1];
      const endTime = nextEvent ? nextEvent.timestamp : now;
      const secondsInPeriod = Math.floor((endTime - event.timestamp) / 1000);
      
      console.log(`\n--- Event ${i + 1}: ${event.timestamp.toISOString()} ---`);
      console.log(`Type: ${event.subtype} | Amount: $${event.amount}`);
      console.log(`Description: ${event.description || 'N/A'}`);
      
      // Update state based on transaction
      if (event.subtype === 'DEPOSIT') {
        totalDeposits += event.amount;
        dailyRate = getDailyRateForLevel(totalDeposits);
        console.log(`✓ Total deposits now: $${totalDeposits} → Rate: ${(dailyRate * 100).toFixed(1)}%`);
      }
      
      balance += event.amount;
      console.log(`✓ Balance after transaction: $${balance.toFixed(2)}`);
      
      // Calculate compound earnings + commission for this period
      if (secondsInPeriod > 0 && (dailyRate > 0 || referralCommissionPerSecond > 0)) {
        const daysInPeriod = secondsInPeriod / SECONDS_PER_DAY;
        console.log(`\n⏱️  Period until next event: ${daysInPeriod.toFixed(4)} days (${secondsInPeriod} seconds)`);
        
        // Method: Compound per-second with commission added each second
        // Formula: For each second, balance grows by (rate + commission)
        // Balance(t) = Balance(0) * (1 + (rate_per_sec))^seconds + commission_per_sec * sum of geometric series
        
        const ownRatePerSecond = dailyRate / SECONDS_PER_DAY;
        const totalRatePerSecond = ownRatePerSecond; // Own earnings rate
        
        // Calculate compound growth from own earnings
        let newBalance = balance;
        if (totalRatePerSecond > 0) {
          const compoundFactor = Math.pow(1 + totalRatePerSecond, secondsInPeriod);
          newBalance = balance * compoundFactor;
          const ownEarnings = newBalance - balance;
          console.log(`  Own earnings (compound): $${ownEarnings.toFixed(2)}`);
        }
        
        // Calculate commission earnings (adds linearly each second, then also compounds)
        // This is complex: commission adds each second, and that addition also earns
        // Simplified: treat commission as adding uniformly, then compounding on total
        const directCommission = referralCommissionPerSecond * secondsInPeriod;
        console.log(`  Referral commission (linear): $${directCommission.toFixed(2)}`);
        
        // The commission itself also compounds as it accumulates
        // More accurate: each second adds commission, which then also earns
        // For simplicity: add commission to balance and let it compound
        // Better approximation: commission stream compounds
        // Formula for continuous addition + compound: 
        // FV = P * (1+r)^n + C * [((1+r)^n - 1) / r]
        // Where C = commission per period
        
        let commissionWithCompound = 0;
        if (referralCommissionPerSecond > 0 && totalRatePerSecond > 0) {
          // Geometric series sum
          const geometricSum = (Math.pow(1 + totalRatePerSecond, secondsInPeriod) - 1) / totalRatePerSecond;
          commissionWithCompound = referralCommissionPerSecond * geometricSum;
          console.log(`  Referral commission (with compound on stream): $${commissionWithCompound.toFixed(2)}`);
        } else {
          commissionWithCompound = directCommission;
        }
        
        const totalEarningsThisPeriod = (newBalance - balance) + commissionWithCompound;
        balance = newBalance + commissionWithCompound;
        
        console.log(`  Total earnings this period: $${totalEarningsThisPeriod.toFixed(2)}`);
        console.log(`✓ Balance at end of period: $${balance.toFixed(2)}`);
      }
    }
    
    console.log('\n=== FINAL CALCULATION ===');
    console.log('Final balance (with all compound + commission): $' + balance.toFixed(2));
    console.log('Stored wallet balance (database): $' + user.walletBalance);
    console.log('Current API returns: $12,104.47');
    console.log('Difference from API: $' + (balance - 12104.47).toFixed(2));
    
    console.log('\n=== BREAKDOWN ===');
    console.log('Base from transactions:', allTxs.reduce((sum, tx) => sum + tx.amount, 0));
    console.log('Total earnings (compound + commission):', (balance - allTxs.reduce((sum, tx) => sum + tx.amount, 0)).toFixed(2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

calculateWithTimeline();
