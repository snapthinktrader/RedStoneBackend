const mongoose = require('mongoose');
require('dotenv').config();

async function fixCorruptedDeposits() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    const Transaction = require('./src/models/Transaction');
    
    console.log('🔧 FIXING CORRUPTED DEPOSIT DATA');
    console.log('═'.repeat(60));
    
    // Find all users
    const allUsers = await User.find({ isActive: true });
    
    console.log(`\n📊 Checking ${allUsers.length} users...\n`);
    
    let fixedCount = 0;
    let corruptedUsers = [];
    
    for (const user of allUsers) {
      // Get actual deposits from transactions
      const deposits = await Transaction.find({
        userId: user._id,
        type: 'DEPOSIT',
        status: 'COMPLETED'
      });
      
      const actualDepositSum = deposits.reduce((sum, d) => sum + d.amount, 0);
      
      if (user.totalDeposit !== actualDepositSum) {
        corruptedUsers.push({
          email: user.email,
          storedTotal: user.totalDeposit,
          actualTotal: actualDepositSum,
          difference: user.totalDeposit - actualDepositSum,
          firstDeposit: deposits.length > 0 ? deposits[0].amount : null
        });
      }
    }
    
    if (corruptedUsers.length === 0) {
      console.log('✅ All users have correct totalDeposit values!');
    } else {
      console.log(`⚠️  FOUND ${corruptedUsers.length} CORRUPTED USERS:\n`);
      
      corruptedUsers.forEach((u, i) => {
        console.log(`${i+1}. ${u.email}`);
        console.log(`   Stored totalDeposit: $${u.storedTotal}`);
        console.log(`   Actual deposits: $${u.actualTotal}`);
        console.log(`   Difference: $${u.difference}`);
        if (u.firstDeposit) {
          console.log(`   First deposit: $${u.firstDeposit}`);
          if (u.firstDeposit >= 50) {
            console.log(`   → Should be in UPPER track`);
          } else if (u.firstDeposit >= 15) {
            console.log(`   → Should be in LOWER track`);
          }
        }
        console.log();
      });
      
      console.log('═'.repeat(60));
      console.log('💡 RECOMMENDATION:');
      console.log('   These users have manual/incorrect totalDeposit values.');
      console.log('   For milestone tracking, use FIRST TRANSACTION amount, not totalDeposit.');
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

fixCorruptedDeposits();
