require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

(async function(){
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const user = await User.findOne({ email: 'snapthinktrader@gmail.com' });
    if(!user) return console.log('User not found');

    const earningsData = user.calculateRealTimeEarnings();
    const referralCommissionData = await user.calculateRealTimeReferralCommission();

    const totalPendingEarnings = earningsData.pendingEarnings + referralCommissionData.pendingCommission;
    const totalCalculatedBalance = earningsData.calculatedBalance + referralCommissionData.pendingCommission;

    console.log('Simulated API response:');
    console.log(JSON.stringify({
      walletBalance: totalCalculatedBalance,
      storedBalance: user.walletBalance,
      pendingEarnings: totalPendingEarnings,
      pendingOwnEarnings: earningsData.pendingEarnings,
      pendingReferralCommission: referralCommissionData.pendingCommission,
      totalDeposit: user.totalDeposit,
      totalEarnings: user.totalEarnings || 0,
      directReferrals: user.directReferrals || 0
    }, null, 2));

    await mongoose.connection.close();
  } catch(e){
    console.error(e);
    process.exit(1);
  }
})();
