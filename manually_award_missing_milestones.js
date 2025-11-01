const mongoose = require('mongoose');
const User = require('./src/models/User');
const Transaction = require('./src/models/Transaction');
require('dotenv').config();

async function manuallyAwardMissingMilestones() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('🎯 MANUALLY AWARDING MISSING MILESTONE BONUSES');
    console.log('==============================================');
    console.log('');
    
    const users = [
      { email: 'snapthinktrader@gmail.com', name: 'Ajay Tiwari', referrals: 3 },
      { email: 'spookymoments62@gmail.com', name: 'Satyam Verma', referrals: 3 }
    ];
    
    for (const userData of users) {
      console.log(`👤 Processing: ${userData.name} (${userData.email})`);
      console.log('---------------------------------------------');
      
      const user = await User.findOne({ email: userData.email });
      if (!user) {
        console.log('❌ User not found!');
        continue;
      }
      
      console.log(`💰 Current Balance: $${user.walletBalance}`);
      console.log(`👥 Referrals: ${userData.referrals}`);
      console.log(`🏆 User Level: ${user.currentLevel} (${user.levelName})`);
      
      // Check if user already received 3-referral milestone bonus
      const existingMilestone = await Transaction.findOne({
        userId: user._id,
        type: 'MILESTONE_BONUS',
        $or: [
          { 'metadata.milestoneCount': 3 },
          { description: { $regex: '3 referrals', $options: 'i' } }
        ]
      });
      
      if (existingMilestone) {
        console.log('✅ User already received 3-referral milestone bonus');
        console.log(`   Amount: $${existingMilestone.amount}`);
        console.log(`   Date: ${existingMilestone.createdAt.toDateString()}`);
      } else {
        console.log('🚨 Missing 3-referral milestone bonus! Awarding now...');
        
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            // Award $50 bonus for 3 referrals (lower track)
            await Transaction.create([{
              userId: user._id,
              type: 'MILESTONE_BONUS',
              subType: 'LOWER',
              amount: 50,
              status: 'COMPLETED',
              description: 'Milestone bonus for 3 referrals (lower track)',
              metadata: {
                track: 'lower',
                milestoneCount: 3,
                currentReferralCount: userData.referrals,
                manuallyAwarded: true,
                awardedBy: 'system_correction'
              },
              processedAt: new Date()
            }], { session });
            
            // Update user balance
            await User.findByIdAndUpdate(
              user._id,
              { $inc: { walletBalance: 50 } },
              { session }
            );
            
            console.log('✅ Successfully awarded $50 milestone bonus');
          });
        } finally {
          await session.endSession();
        }
        
        // Verify the award
        const updatedUser = await User.findById(user._id);
        console.log(`💼 New Balance: $${updatedUser.walletBalance} (+$50)`);
      }
      
      console.log('');
    }
    
    console.log('✅ All missing milestone bonuses have been processed!');
    
  } catch (error) {
    console.error('❌ Error awarding milestone bonuses:', error);
  } finally {
    await mongoose.disconnect();
  }
}

manuallyAwardMissingMilestones();