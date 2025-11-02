require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Transaction = require('./src/models/Transaction');

mongoose.connect(process.env.MONGODB_URI);

async function checkSpookyTransactions() {
  try {
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log('\n=== USER INFO ===');
    console.log('Email:', user.email);
    console.log('User ID:', user._id);
    console.log('Wallet Balance:', user.walletBalance);
    console.log('Total Deposit:', user.totalDeposit);
    console.log('Account Created:', user.createdAt);
    
    // Check ALL transactions
    console.log('\n=== ALL TRANSACTIONS ===');
    const allTxs = await Transaction.find({ userId: user._id }).sort({ createdAt: 1 });
    
    console.log('Total transactions:', allTxs.length);
    
    if (allTxs.length === 0) {
      console.log('\n❌ NO TRANSACTIONS FOUND!');
    } else {
      console.log('\nAll transactions:');
      allTxs.forEach((tx, idx) => {
        console.log(`\n--- Transaction ${idx + 1} ---`);
        console.log('Type:', tx.type);
        console.log('Amount:', tx.amount);
        console.log('Status:', tx.status);
        console.log('Created:', tx.createdAt);
        console.log('Description:', tx.description || 'N/A');
        if (tx.metadata) {
          console.log('Metadata:', JSON.stringify(tx.metadata));
        }
      });
    }
    
    // Filter for DEPOSIT type transactions that credited balance
    console.log('\n=== DEPOSIT TRANSACTIONS (COMPLETED) ===');
    const depositTxs = await Transaction.find({
      userId: user._id,
      type: 'DEPOSIT',
      status: 'COMPLETED'
    }).sort({ createdAt: 1 });
    
    console.log('DEPOSIT transactions (COMPLETED):', depositTxs.length);
    let totalFromDeposits = 0;
    
    depositTxs.forEach((tx, idx) => {
      const daysSince = (Date.now() - tx.createdAt) / (1000 * 60 * 60 * 24);
      console.log(`\n${idx + 1}. $${tx.amount} - ${daysSince.toFixed(2)} days ago (${tx.createdAt.toISOString()})`);
      console.log('   Description:', tx.description || 'N/A');
      totalFromDeposits += tx.amount;
    });
    
    console.log('\n=== ANALYSIS ===');
    console.log('Sum of DEPOSIT transactions:', totalFromDeposits);
    console.log('User totalDeposit field:', user.totalDeposit);
    console.log('User walletBalance field:', user.walletBalance);
    console.log('Match:', Math.abs(totalFromDeposits - user.totalDeposit) < 0.01 ? '✅' : '❌');
    
    if (depositTxs.length > 0) {
      console.log('\n✅ DEPOSIT transactions found! These should be used for per-deposit earnings calculation.');
      console.log('The system should calculate earnings from each transaction\'s createdAt timestamp.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkSpookyTransactions();
