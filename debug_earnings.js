const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    const earnings = await user.calculateRealTimeEarnings();
    
    console.log('\n=== BACKEND CALCULATION ===');
    console.log('Own Earnings:', earnings.ownEarnings?.toFixed(2) || 'N/A');
    console.log('Referral Commission:', earnings.referralCommission?.toFixed(2) || 'N/A');
    console.log('Total Pending Earnings:', earnings.pendingEarnings.toFixed(2));
    console.log('Calculated Balance:', earnings.calculatedBalance.toFixed(2));
    console.log('Commission Per Second:', earnings.commissionPerSecond?.toFixed(8) || 'N/A');
    
    console.log('\n=== COMPARISON ===');
    console.log('Expected Balance: $6,114.60');
    console.log('Actual Balance: $' + earnings.calculatedBalance.toFixed(2));
    console.log('Difference: $' + (earnings.calculatedBalance - 6114.60).toFixed(2));
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
