const mongoose = require('mongoose');
require('dotenv').config();

async function verifyTimelineCalculation() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    const Transaction = require('./src/models/Transaction');
    
    const user = await User.findOne({ email: 'snapthinktrader@gmail.com' });
    
    console.log('🔬 DETAILED TIMELINE CALCULATION (Per-Second Compounding)');
    console.log('═'.repeat(80));
    
    // Get all transactions
    const transactions = await Transaction.find({
      userId: user._id,
      type: { $in: ['DEPOSIT', 'PROMOTIONAL_BONUS', 'MILESTONE_BONUS'] },
      status: 'COMPLETED'
    }).select('type amount createdAt').sort({ createdAt: 1 });
    
    // Get referrals
    const refs = await User.find({ referredBy: user._id, isActive: true })
      .select('email totalDeposit');
    
    const firstRefDeposit = await Transaction.findOne({
      userId: { $in: refs.map(r => r._id) },
      type: 'DEPOSIT',
      status: 'COMPLETED'
    }).sort({ createdAt: 1 });
    
    const now = new Date();
    const SECONDS_PER_DAY = 86400;
    
    // Helper function to get earning rate based on deposits
    const getEarningRate = (totalDeposits) => {
      if (totalDeposits >= 10000) return 0.05;
      if (totalDeposits >= 5000) return 0.045;
      if (totalDeposits >= 3500) return 0.04;
      if (totalDeposits >= 2000) return 0.035;
      if (totalDeposits >= 1000) return 0.03;
      if (totalDeposits >= 300) return 0.025;
      if (totalDeposits >= 50) return 0.02;
      if (totalDeposits >= 15) return 0.02;
      return 0;
    };
    
    // Calculate commission per second
    const myCommissionRate = user.getCommissionRate();
    let commissionPerSecond = 0;
    let totalRefDailyEarnings = 0;
    
    console.log('\n👥 REFERRAL COMMISSION CALCULATION:');
    console.log('   My Commission Rate:', (myCommissionRate * 100) + '%');
    
    for (const ref of refs) {
      if (ref.totalDeposit > 0) {
        const refDailyRate = getEarningRate(ref.totalDeposit);
        const refEarningsPerDay = ref.totalDeposit * refDailyRate;
        const myCommissionPerDay = refEarningsPerDay * myCommissionRate;
        commissionPerSecond += myCommissionPerDay / SECONDS_PER_DAY;
        totalRefDailyEarnings += refEarningsPerDay;
        
        console.log(`\n   ${ref.email}:`);
        console.log(`   - Deposit: $${ref.totalDeposit}`);
        console.log(`   - Daily Rate: ${(refDailyRate * 100)}%`);
        console.log(`   - Their Daily Earnings: $${refEarningsPerDay.toFixed(2)}`);
        console.log(`   - My Commission: ${(myCommissionRate * 100)}% × $${refEarningsPerDay.toFixed(2)} = $${myCommissionPerDay.toFixed(2)}/day`);
        console.log(`   - Per Second: $${(myCommissionPerDay / SECONDS_PER_DAY).toFixed(8)}/sec`);
      }
    }
    
    console.log(`\n   📊 Total Commission Rate: $${(commissionPerSecond * SECONDS_PER_DAY).toFixed(2)}/day`);
    console.log(`   📊 Total Commission Rate: $${commissionPerSecond.toFixed(8)}/sec`);
    
    // Build timeline events
    const events = transactions.map(tx => ({
      time: new Date(tx.createdAt),
      type: tx.type,
      amount: tx.amount
    }));
    
    // Add commission start event
    const commissionStartTime = firstRefDeposit ? new Date(firstRefDeposit.createdAt) : null;
    if (commissionStartTime) {
      events.push({
        time: commissionStartTime,
        type: 'COMMISSION_START',
        amount: 0
      });
    }
    
    // Sort events by time
    events.sort((a, b) => a.time - b.time);
    
    console.log('\n\n📅 TIMELINE EVENTS:');
    console.log('═'.repeat(80));
    
    let balance = 0;
    let totalDeposits = 0;
    let totalOwnEarnings = 0;
    let totalCommissionEarnings = 0;
    let commissionActive = false;
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const nextEvent = events[i + 1];
      const eventTime = event.time;
      const nextTime = nextEvent ? nextEvent.time : now;
      
      console.log(`\n${i + 1}. ${eventTime.toLocaleString()} - ${event.type}`);
      
      // Process event
      if (event.type === 'COMMISSION_START') {
        commissionActive = true;
        console.log(`   ⚡ Commission activated! Rate: $${(commissionPerSecond * SECONDS_PER_DAY).toFixed(2)}/day`);
      } else {
        balance += event.amount;
        if (event.type === 'DEPOSIT') {
          totalDeposits += event.amount;
        }
        console.log(`   💰 Added $${event.amount} → Balance: $${balance.toFixed(2)}`);
      }
      
      // Calculate time until next event
      const elapsedSeconds = Math.floor((nextTime - eventTime) / 1000);
      const elapsedDays = (elapsedSeconds / SECONDS_PER_DAY).toFixed(2);
      
      if (elapsedSeconds > 0) {
        // Get current rate based on total deposits
        const currentRate = getEarningRate(totalDeposits);
        const ratePerSecond = currentRate / SECONDS_PER_DAY;
        
        console.log(`\n   ⏱️  Time until next event: ${elapsedDays} days (${elapsedSeconds.toLocaleString()} seconds)`);
        console.log(`   📊 Current State:`);
        console.log(`      Balance: $${balance.toFixed(2)}`);
        console.log(`      Total Deposits: $${totalDeposits}`);
        console.log(`      Daily Rate: ${(currentRate * 100)}%`);
        console.log(`      Rate/Second: ${(ratePerSecond * 100).toFixed(10)}%`);
        
        // Part 1: Compound own balance
        if (ratePerSecond > 0 && balance > 0) {
          const compoundFactor = Math.pow(1 + ratePerSecond, elapsedSeconds);
          const ownEarnings = balance * (compoundFactor - 1);
          balance = balance * compoundFactor;
          totalOwnEarnings += ownEarnings;
          
          console.log(`\n   💎 Own Earnings (Compound):`);
          console.log(`      Formula: $${balance.toFixed(2)} × (1 + ${ratePerSecond.toFixed(10)})^${elapsedSeconds} - 1`);
          console.log(`      Compound Factor: ${compoundFactor.toFixed(8)}`);
          console.log(`      Earnings: $${ownEarnings.toFixed(2)}`);
          console.log(`      New Balance: $${balance.toFixed(2)}`);
        }
        
        // Part 2: Commission stream (if active)
        if (commissionActive && commissionPerSecond > 0 && ratePerSecond > 0) {
          const overlapStart = eventTime > commissionStartTime ? eventTime : commissionStartTime;
          const overlapSeconds = Math.floor((nextTime - overlapStart) / 1000);
          
          if (overlapSeconds > 0) {
            const compoundFactor = Math.pow(1 + ratePerSecond, overlapSeconds);
            const commissionStreamValue = commissionPerSecond * (compoundFactor - 1) / ratePerSecond;
            balance += commissionStreamValue;
            totalCommissionEarnings += commissionStreamValue;
            
            console.log(`\n   👥 Commission Stream (Compound):`);
            console.log(`      Stream Rate: $${commissionPerSecond.toFixed(8)}/sec`);
            console.log(`      Time Period: ${overlapSeconds.toLocaleString()} seconds`);
            console.log(`      Formula: $${commissionPerSecond.toFixed(8)} × [(1 + ${ratePerSecond.toFixed(10)})^${overlapSeconds} - 1] / ${ratePerSecond.toFixed(10)}`);
            console.log(`      Compound Factor: ${compoundFactor.toFixed(8)}`);
            console.log(`      Commission Earned: $${commissionStreamValue.toFixed(2)}`);
            console.log(`      New Balance: $${balance.toFixed(2)}`);
          }
        }
        
        console.log(`\n   ✅ Balance after this period: $${balance.toFixed(2)}`);
      }
    }
    
    console.log('\n\n' + '═'.repeat(80));
    console.log('📊 FINAL CALCULATION SUMMARY:');
    console.log('═'.repeat(80));
    console.log(`\n💰 Starting Amount (Deposits + Bonuses): $700.00`);
    console.log(`📈 Own Earnings (Compounded): $${totalOwnEarnings.toFixed(2)}`);
    console.log(`👥 Commission Earnings (Compounded): $${totalCommissionEarnings.toFixed(2)}`);
    console.log(`━`.repeat(80));
    console.log(`✅ FINAL BALANCE: $${balance.toFixed(2)}`);
    
    // Compare with backend function
    console.log('\n\n🔍 VERIFICATION WITH BACKEND FUNCTION:');
    const backendCalc = await user.calculateRealTimeEarnings();
    console.log(`   Backend Calculated: $${backendCalc.calculatedBalance?.toFixed(2)}`);
    console.log(`   Manual Calculation: $${balance.toFixed(2)}`);
    console.log(`   Difference: $${Math.abs(backendCalc.calculatedBalance - balance).toFixed(2)}`);
    console.log(`   Match: ${Math.abs(backendCalc.calculatedBalance - balance) < 1 ? '✅ YES' : '❌ NO'}`);
    
    await mongoose.connection.close();
    console.log('\n✅ Verification complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

verifyTimelineCalculation();
