const mongoose = require('mongoose');
const User = require('./src/models/User');
const Transaction = require('./src/models/Transaction');
require('dotenv').config();

async function triggerMilestoneBonusCheck(userEmail) {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`🎯 TRIGGERING MILESTONE BONUS CHECK FOR: ${userEmail}`);
    console.log('================================================');
    
    // Find the user
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.log('❌ User not found!');
      return;
    }
    
    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`📧 User ID: ${user._id}`);
    console.log(`💰 Current Balance: $${user.walletBalance}`);
    console.log('');
    
    // Start a session for transaction
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Count direct referrals
        const directReferralCount = await User.countDocuments({
          referredBy: user._id,
          isActive: true,
        }).session(session);
        
        console.log(`👥 Direct Referrals: ${directReferralCount}`);
        console.log('');
        
        const milestones = JSON.parse(process.env.MILESTONE_BONUSES || '{"10":100,"25":300,"50":750,"100":2000,"200":5000}');
        
        console.log('🎯 Checking milestones...');
        console.log('');
        
        let bonusesAwarded = 0;
        let totalBonusAmount = 0;
        
        for (const [count, bonus] of Object.entries(milestones)) {
          const milestoneCount = parseInt(count);
          
          if (directReferralCount >= milestoneCount) {
            // Check if this milestone bonus was already awarded
            const existingBonus = await Transaction.findOne({
              userId: user._id,
              type: 'MILESTONE_BONUS',
              'metadata.milestoneCount': milestoneCount,
            }).session(session);
            
            if (!existingBonus) {
              console.log(`🚨 AWARDING MILESTONE BONUS: ${milestoneCount} referrals → $${bonus}`);
              
              // Create milestone bonus transaction
              await Transaction.create([{
                userId: user._id,
                type: 'MILESTONE_BONUS',
                amount: bonus,
                status: 'COMPLETED',
                description: `Milestone bonus for ${milestoneCount} referrals`,
                metadata: {
                  milestoneCount,
                  currentReferralCount: directReferralCount,
                },
                processedAt: new Date(),
              }], { session });
              
              // Update user balance
              await User.findByIdAndUpdate(
                user._id,
                { $inc: { walletBalance: bonus } },
                { session }
              );
              
              bonusesAwarded++;
              totalBonusAmount += bonus;
              
              console.log(`✅ Successfully awarded $${bonus} bonus`);
              console.log('');
            } else {
              console.log(`⏭️  Already awarded: ${milestoneCount} referrals → $${bonus}`);
            }
          } else {
            console.log(`⏳ Not eligible: ${milestoneCount} referrals → $${bonus} (need ${milestoneCount - directReferralCount} more)`);
          }
        }
        
        console.log('');
        console.log('📊 SUMMARY:');
        console.log('============');
        console.log(`🎁 Bonuses Awarded: ${bonusesAwarded}`);
        console.log(`💰 Total Bonus Amount: $${totalBonusAmount}`);
        
        if (bonusesAwarded > 0) {
          // Get updated user balance
          const updatedUser = await User.findById(user._id).session(session);
          console.log(`💼 New Balance: $${updatedUser.walletBalance}`);
        }
        
      });
    } catch (error) {
      console.error('❌ Error in transaction:', error);
    } finally {
      await session.endSession();
    }
    
  } catch (error) {
    console.error('❌ Error triggering milestone bonus check:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Get user email from command line argument
const userEmail = process.argv[2];

if (!userEmail) {
  console.log('Usage: node trigger_milestone_bonus.js <user_email>');
  console.log('Example: node trigger_milestone_bonus.js user@example.com');
  process.exit(1);
}

triggerMilestoneBonusCheck(userEmail);