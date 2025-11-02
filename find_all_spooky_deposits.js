require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Deposit = require('./src/models/Deposit');

mongoose.connect(process.env.MONGODB_URI);

async function findAllDepositsForSpooky() {
  try {
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log('\n=== USER INFO ===');
    console.log('Email:', user.email);
    console.log('User ID:', user._id);
    console.log('Wallet Balance:', user.walletBalance);
    console.log('Total Deposit:', user.totalDeposit);
    
    // Check ALL deposits regardless of status
    console.log('\n=== SEARCHING ALL DEPOSITS (ANY STATUS) ===');
    const allDeposits = await Deposit.find({ userId: user._id }).sort({ createdAt: -1 });
    
    console.log('Total deposits found:', allDeposits.length);
    
    if (allDeposits.length === 0) {
      console.log('\n❌ NO DEPOSITS FOUND AT ALL!');
      console.log('This means admin deposit did NOT create a Deposit record.');
      console.log('Admin deposit might have only updated user.walletBalance directly.');
    } else {
      console.log('\nDeposit records:');
      allDeposits.forEach((dep, idx) => {
        console.log(`\n--- Deposit ${idx + 1} ---`);
        console.log('Amount:', dep.amount);
        console.log('Status:', dep.status);
        console.log('Balance Updated:', dep.balanceUpdated);
        console.log('Created At:', dep.createdAt);
        console.log('Processed At:', dep.processedAt);
        console.log('Payment Method:', dep.paymentMethod);
        console.log('Transaction ID:', dep.transactionId);
      });
      
      // Check which deposits are being excluded
      const confirmedDeposits = await Deposit.find({
        userId: user._id,
        status: 'CONFIRMED',
        balanceUpdated: true
      });
      
      console.log('\n=== FILTERING ANALYSIS ===');
      console.log('Total deposits:', allDeposits.length);
      console.log('CONFIRMED + balanceUpdated deposits:', confirmedDeposits.length);
      
      if (allDeposits.length > confirmedDeposits.length) {
        console.log('\n⚠️  Some deposits are being EXCLUDED from earnings calculation!');
        console.log('Excluded deposits:');
        allDeposits.forEach(dep => {
          if (dep.status !== 'CONFIRMED' || !dep.balanceUpdated) {
            console.log(`- $${dep.amount} | Status: ${dep.status} | BalanceUpdated: ${dep.balanceUpdated}`);
          }
        });
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

findAllDepositsForSpooky();
