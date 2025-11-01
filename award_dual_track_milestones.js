const mongoose = require('mongoose');
const User = require('./src/models/User');
const Transaction = require('./src/models/Transaction');
require('dotenv').config();

/**
 * DUAL-TRACK MILESTONE BONUS AWARD SYSTEM
 * 
 * This script implements the proper dual-track milestone system:
 * - Lower Track: Based on referral deposits $0-$49
 * - Upper Track: Based on referral deposits $50+
 * 
 * Key Rules:
 * 1. Lower track available to ALL users (Basic and above)
 * 2. Upper track available only to Bronze+ users (Level 2+)
 * 3. Each deposit counts in only ONE track based on amount
 * 4. Upper track bonuses are approximately 2x lower track
 */

async function awardDualTrackMilestoneBonuses(userEmail) {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`🎯 DUAL-TRACK MILESTONE BONUS SYSTEM`);
    console.log(`📧 User: ${userEmail}`);
    console.log('===========================================');
    console.log('');
    
    // Get milestone configurations
    const lowerTrackBonuses = JSON.parse(process.env.MILESTONE_BONUSES_LOWER || '{"3":50,"10":100,"15":150,"25":250,"50":750,"100":1000,"500":5000,"1000":25000}');
    const upperTrackBonuses = JSON.parse(process.env.MILESTONE_BONUSES_UPPER || '{"3":100,"10":200,"15":300,"25":500,"50":1500,"100":3000,"500":10000,"1000":50000}');
    
    console.log('📋 MILESTONE CONFIGURATION:');
    console.log('Lower Track ($0-$49 deposits):');
    Object.entries(lowerTrackBonuses).forEach(([count, bonus]) => {
      console.log(`   ${count} deposits → $${bonus}`);
    });
    console.log('Upper Track ($50+ deposits):');
    Object.entries(upperTrackBonuses).forEach(([count, bonus]) => {
      console.log(`   ${count} deposits → $${bonus}`);
    });
    console.log('');
    
    // Find user
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.log('❌ User not found!');
      return;
    }
    
    console.log(`👤 User: ${user.name}`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`🏆 Current Level: ${user.currentLevel} (${user.levelName})`);
    console.log(`💰 Current Balance: $${user.walletBalance}`);
    console.log('');
    
    // Initialize milestone tracking if it doesn't exist
    if (!user.milestoneTracking) {
      user.milestoneTracking = {
        lowerTrack: { count: 0, lastMilestoneClaimed: 0, claimedMilestones: [] },
        upperTrack: { count: 0, lastMilestoneClaimed: 0, claimedMilestones: [] }
      };
    }
    
    // Count referral deposits by track
    const referrals = await User.find({ referredBy: user._id, isActive: true });
    
    console.log(`👥 REFERRAL ANALYSIS (${referrals.length} total referrals):`);
    console.log('--------------------------------------------------');
    
    let lowerTrackCount = 0;
    let upperTrackCount = 0;
    
    for (let i = 0; i < referrals.length; i++) {
      const referral = referrals[i];
      
      // Get all deposits from this referral
      const deposits = await Transaction.find({
        userId: referral._id,
        type: 'DEPOSIT',
        status: 'COMPLETED'
      });
      
      console.log(`${i + 1}. ${referral.name} (${referral.email}):`);
      
      let referralLowerCount = 0;
      let referralUpperCount = 0;
      
      deposits.forEach(deposit => {
        if (deposit.amount < 50) {
          referralLowerCount++;
          lowerTrackCount++;
          console.log(`   💵 $${deposit.amount} → Lower Track (+1)`);
        } else {
          referralUpperCount++;
          upperTrackCount++;
          console.log(`   💰 $${deposit.amount} → Upper Track (+1)`);
        }
      });
      
      console.log(`   📊 Lower: ${referralLowerCount}, Upper: ${referralUpperCount}`);
      console.log('');
    }
    
    console.log('📊 TRACK SUMMARY:');
    console.log(`Lower Track Total: ${lowerTrackCount} deposits`);
    console.log(`Upper Track Total: ${upperTrackCount} deposits`);
    console.log('');
    
    // Update user's milestone tracking
    user.milestoneTracking.lowerTrack.count = lowerTrackCount;
    user.milestoneTracking.upperTrack.count = upperTrackCount;
    
    // Check for available milestone bonuses
    console.log('🎁 MILESTONE BONUS ELIGIBILITY:');
    console.log('--------------------------------');
    
    const session = await mongoose.startSession();
    let totalBonusAwarded = 0;
    let bonusesAwarded = 0;
    
    try {
      await session.withTransaction(async () => {
        
        // Check Lower Track Milestones (available to all users)
        console.log('Lower Track ($0-$49 deposits):');
        const lowerClaimedMilestones = user.milestoneTracking.lowerTrack.claimedMilestones || [];
        
        for (const [countStr, bonus] of Object.entries(lowerTrackBonuses)) {
          const count = parseInt(countStr);
          const isEligible = lowerTrackCount >= count;
          const alreadyClaimed = lowerClaimedMilestones.includes(count);
          
          if (isEligible && !alreadyClaimed) {
            console.log(`🚨 AWARDING: ${count} deposits → $${bonus}`);
            
            // Create transaction
            await Transaction.create([{
              userId: user._id,
              type: 'MILESTONE_BONUS',
              subType: 'LOWER',
              amount: bonus,
              status: 'COMPLETED',
              description: `Lower track milestone bonus for ${count} referral deposits`,
              metadata: {
                track: 'lower',
                milestoneCount: count,
                currentCount: lowerTrackCount
              },
              processedAt: new Date()
            }], { session });
            
            // Update user balance
            await User.findByIdAndUpdate(
              user._id,
              { 
                $inc: { walletBalance: bonus },
                $push: { 'milestoneTracking.lowerTrack.claimedMilestones': count }
              },
              { session }
            );
            
            totalBonusAwarded += bonus;
            bonusesAwarded++;
            
          } else if (isEligible && alreadyClaimed) {
            console.log(`✅ Already claimed: ${count} deposits → $${bonus}`);
          } else {
            console.log(`⏳ Not eligible: ${count} deposits → $${bonus} (need ${count - lowerTrackCount} more)`);
          }
        }
        
        console.log('');
        
        // Check Upper Track Milestones (Bronze+ users only)
        console.log('Upper Track ($50+ deposits):');
        if (user.currentLevel >= 2) {
          console.log('🔓 Bronze+ user - Upper track UNLOCKED');
          
          const upperClaimedMilestones = user.milestoneTracking.upperTrack.claimedMilestones || [];
          
          for (const [countStr, bonus] of Object.entries(upperTrackBonuses)) {
            const count = parseInt(countStr);
            const isEligible = upperTrackCount >= count;
            const alreadyClaimed = upperClaimedMilestones.includes(count);
            
            if (isEligible && !alreadyClaimed) {
              console.log(`🚨 AWARDING: ${count} deposits → $${bonus}`);
              
              // Create transaction
              await Transaction.create([{
                userId: user._id,
                type: 'MILESTONE_BONUS',
                subType: 'UPPER',
                amount: bonus,
                status: 'COMPLETED',
                description: `Upper track milestone bonus for ${count} referral deposits`,
                metadata: {
                  track: 'upper',
                  milestoneCount: count,
                  currentCount: upperTrackCount
                },
                processedAt: new Date()
              }], { session });
              
              // Update user balance
              await User.findByIdAndUpdate(
                user._id,
                { 
                  $inc: { walletBalance: bonus },
                  $push: { 'milestoneTracking.upperTrack.claimedMilestones': count }
                },
                { session }
              );
              
              totalBonusAwarded += bonus;
              bonusesAwarded++;
              
            } else if (isEligible && alreadyClaimed) {
              console.log(`✅ Already claimed: ${count} deposits → $${bonus}`);
            } else {
              console.log(`⏳ Not eligible: ${count} deposits → $${bonus} (need ${count - upperTrackCount} more)`);
            }
          }
        } else {
          console.log('🔒 Basic user - Upper track LOCKED (upgrade to Bronze to unlock)');
          console.log('   Upper deposits are being tracked but bonuses are not claimable yet.');
        }
        
      });
    } finally {
      await session.endSession();
    }
    
    console.log('');
    console.log('🎉 MILESTONE BONUS SUMMARY:');
    console.log('============================');
    console.log(`🎁 Bonuses Awarded: ${bonusesAwarded}`);
    console.log(`💰 Total Bonus Amount: $${totalBonusAwarded}`);
    
    if (bonusesAwarded > 0) {
      const updatedUser = await User.findById(user._id);
      console.log(`💼 New Balance: $${updatedUser.walletBalance}`);
      console.log(`📈 Balance Increase: $${totalBonusAwarded}`);
    }
    
    console.log('');
    console.log('✅ Dual-track milestone system successfully applied!');
    
  } catch (error) {
    console.error('❌ Error in dual-track milestone system:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Get user email from command line argument
const userEmail = process.argv[2];

if (!userEmail) {
  console.log('Usage: node award_dual_track_milestones.js <user_email>');
  console.log('Example: node award_dual_track_milestones.js snapthinktrader@gmail.com');
  process.exit(1);
}

awardDualTrackMilestoneBonuses(userEmail);