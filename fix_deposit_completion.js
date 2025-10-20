const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Script to fix deposit completion and update user balances
 * This script:
 * 1. Updates user balance when deposit is confirmed
 * 2. Updates user level based on total deposits
 * 3. Processes referral commissions according to Red Stone maths
 * 4. Updates recruitment bonuses
 */

async function fixDepositCompletion() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📊 Connected to database\n');
        
        // Import actual models
        const Deposit = require('./src/models/Deposit');
        const User = require('./src/models/User');
        const Transaction = require('./src/models/Transaction');
        
        const confirmedDeposits = await Deposit.find({
            status: 'CONFIRMED',
            $or: [
                { balanceUpdated: { $ne: true } },
                { balanceUpdated: { $exists: false } }
            ]
        }).populate('userId');
        
        console.log(`Found ${confirmedDeposits.length} confirmed deposits needing balance update\n`);
        
        for (const deposit of confirmedDeposits) {
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`Processing Deposit: ${deposit._id}`);
            console.log(`Amount: ${deposit.amount} USDT`);
            console.log(`User: ${deposit.userId?.email || 'Unknown'}`);
            
            if (!deposit.userId) {
                console.log('⚠️  Skipping - No user found');
                continue;
            }
            
            const user = await User.findById(deposit.userId._id);
            if (!user) {
                console.log('⚠️  Skipping - User not found in database');
                continue;
            }
            
            // 1. Update user balance (add to totalDeposit)
            const oldBalance = user.totalDeposit || 0;
            const newBalance = oldBalance + deposit.amount;
            
            user.totalDeposit = newBalance;
            console.log(`\n💰 Balance Update:`);
            console.log(`   Old: $${oldBalance}`);
            console.log(`   Deposit: $${deposit.amount}`);
            console.log(`   New: $${newBalance}`);
            
            // 2. Update user level based on Red Stone investment levels
            const levels = [
                { level: 1, required: 50, directRate: 0.40, indirectRate: 0.07 },
                { level: 2, required: 300, directRate: 0.40, indirectRate: 0.07 },
                { level: 3, required: 1000, directRate: 0.50, indirectRate: 0.09 },
                { level: 4, required: 2000, directRate: 0.60, indirectRate: 0.11 },
                { level: 5, required: 3000, directRate: 0.65, indirectRate: 0.12 },
                { level: 6, required: 5000, directRate: 0.70, indirectRate: 0.13 },
                { level: 7, required: 10000, directRate: 0.80, indirectRate: 0.15 },
                { level: 8, required: 35000, directRate: 0.90, indirectRate: 0.20 }
            ];
            
            let userLevel = 1;
            for (const lvl of levels.reverse()) {
                if (newBalance >= lvl.required) {
                    userLevel = lvl.level;
                    break;
                }
            }
            
            const oldLevel = user.currentLevel || 1;
            user.currentLevel = userLevel;
            console.log(`\n📊 Level Update:`);
            console.log(`   Old Level: ${oldLevel}`);
            console.log(`   New Level: ${userLevel}`);
            
            // 3. Process referral commissions if user was referred
            if (user.referredBy) {
                console.log(`\n🎁 Processing Referral Commissions...`);
                
                const referrer = await User.findById(user.referredBy);
                if (referrer) {
                    const referrerLevel = levels.find(l => l.level === (referrer.currentLevel || 1));
                    const directCommission = deposit.amount * referrerLevel.directRate;
                    
                    referrer.walletBalance = (referrer.walletBalance || 0) + directCommission;
                    referrer.totalEarnings = (referrer.totalEarnings || 0) + directCommission;
                    referrer.referralEarnings = (referrer.referralEarnings || 0) + directCommission;
                    
                    await referrer.save();
                    
                    console.log(`   Direct Referrer: ${referrer.email}`);
                    console.log(`   Level: ${referrer.level || 1} (${referrerLevel.directRate * 100}%)`);
                    console.log(`   Commission: $${directCommission.toFixed(2)}`);
                    
                    // Create transaction record
                    await Transaction.create({
                        userId: referrer._id,
                        type: 'REFERRAL_COMMISSION',
                        subType: 'DIRECT',
                        amount: directCommission,
                        status: 'COMPLETED',
                        description: `Direct referral commission from ${user.email || user.username}'s deposit`,
                        relatedDeposit: deposit._id,
                        createdAt: new Date()
                    });
                    
                    // Process indirect commission (2nd level)
                    if (referrer.referredBy) {
                        const indirectReferrer = await User.findById(referrer.referredBy);
                        if (indirectReferrer) {
                            const indirectLevel = levels.find(l => l.level === (indirectReferrer.currentLevel || 1));
                            const indirectCommission = deposit.amount * indirectLevel.indirectRate;
                            
                            indirectReferrer.walletBalance = (indirectReferrer.walletBalance || 0) + indirectCommission;
                            indirectReferrer.totalEarnings = (indirectReferrer.totalEarnings || 0) + indirectCommission;
                            indirectReferrer.referralEarnings = (indirectReferrer.referralEarnings || 0) + indirectCommission;
                            
                            await indirectReferrer.save();
                            
                            console.log(`   Indirect Referrer: ${indirectReferrer.email}`);
                            console.log(`   Level: ${indirectReferrer.level || 1} (${indirectLevel.indirectRate * 100}%)`);
                            console.log(`   Commission: $${indirectCommission.toFixed(2)}`);
                            
                            await Transaction.create({
                                userId: indirectReferrer._id,
                                type: 'REFERRAL_COMMISSION',
                                subType: 'INDIRECT',
                                amount: indirectCommission,
                                status: 'COMPLETED',
                                description: `Indirect referral commission from ${user.email || user.username}'s deposit`,
                                relatedDeposit: deposit._id,
                                createdAt: new Date()
                            });
                        }
                    }
                }
            }
            
            // 4. Check and process recruitment bonuses
            if (user.referredBy) {
                const referrer = await User.findById(user.referredBy);
                if (referrer) {
                    // Count referrals from user's referrals array
                    const referralCount = referrer.referrals ? referrer.referrals.length : 0;
                    
                    const bonusTiers = [
                        { count: 3, bonus: 50 },
                        { count: 10, bonus: 100 },
                        { count: 15, bonus: 150 },
                        { count: 25, bonus: 250 },
                        { count: 50, bonus: 750 },
                        { count: 100, bonus: 1000 },
                        { count: 500, bonus: 5000 },
                        { count: 1000, bonus: 25000 }
                    ];
                    
                    // Find highest tier achieved
                    const achievedTier = bonusTiers.reverse().find(tier => referralCount >= tier.count);
                    
                    if (achievedTier && !referrer.recruitmentBonusPaid) {
                        referrer.walletBalance = (referrer.walletBalance || 0) + achievedTier.bonus;
                        referrer.totalEarnings = (referrer.totalEarnings || 0) + achievedTier.bonus;
                        referrer.recruitmentBonusPaid = achievedTier.count;
                        
                        await referrer.save();
                        
                        console.log(`\n🎉 Recruitment Bonus Awarded!`);
                        console.log(`   Referrer: ${referrer.email}`);
                        console.log(`   Referrals: ${referralCount}`);
                        console.log(`   Bonus: $${achievedTier.bonus}`);
                        
                        await Transaction.create({
                            userId: referrer._id,
                            type: 'RECRUITMENT_BONUS',
                            amount: achievedTier.bonus,
                            status: 'COMPLETED',
                            description: `Recruitment bonus for ${referralCount} referrals`,
                            createdAt: new Date()
                        });
                    }
                }
            }
            
            // 5. Mark deposit as balance updated
            deposit.balanceUpdated = true;
            await deposit.save();
            
            // 6. Save user
            await user.save();
            
            console.log(`\n✅ Deposit processing completed!`);
        }
        
        console.log(`\n\n═══════════════════════════════════════════════════════`);
        console.log(`✅ Processed ${confirmedDeposits.length} deposits`);
        console.log(`═══════════════════════════════════════════════════════\n`);
        
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

fixDepositCompletion();
