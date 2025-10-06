const cron = require('node-cron');
const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

/**
 * Daily Earnings Cron Job
 * Runs every day at 3:00 AM UTC
 * Calculates and awards 2% daily returns to all active users
 */
const dailyEarningsJob = cron.schedule('0 3 * * *', async () => {
  logger.info('Starting daily earnings calculation...');
  
  try {
    // Get all active users with wallet balance > 0
    const users = await User.find({
      isActive: true,
      walletBalance: { $gt: 0 },
    });

    logger.info(`Processing daily earnings for ${users.length} users`);

    const batchSize = 100;
    let processedCount = 0;
    let errorCount = 0;

    // Process users in batches to avoid memory issues
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (user) => {
          const session = await mongoose.startSession();
          try {
            await session.withTransaction(async () => {
              const dailyEarning = user.getDailyEarnings();
              
              if (dailyEarning > 0) {
                // Create transaction record
                await Transaction.create([{
                  userId: user._id,
                  type: 'DAILY_EARNING',
                  amount: dailyEarning,
                  status: 'COMPLETED',
                  description: `Daily earnings for ${new Date().toDateString()}`,
                  processedAt: new Date(),
                }], { session });

                // Update user wallet balance
                await User.findByIdAndUpdate(
                  user._id,
                  { $inc: { walletBalance: dailyEarning } },
                  { session }
                );
                
                processedCount++;
                logger.debug(`Daily earnings processed for user ${user._id}: $${dailyEarning}`);
              }
            });
          } catch (error) {
            errorCount++;
            logger.error(`Error processing daily earnings for user ${user._id}:`, error);
          } finally {
            await session.endSession();
          }
        })
      );
    }

    logger.info(`Daily earnings job completed. Processed: ${processedCount}, Errors: ${errorCount}`);
  } catch (error) {
    logger.error('Fatal error in daily earnings job:', error);
  }
}, {
  scheduled: false, // Don't start immediately
  timezone: 'UTC',
});

/**
 * Referral Commission Calculator
 * Calculates commissions when new deposits are made
 */
const calculateReferralCommissions = async (refereeId, depositAmount) => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      logger.info(`Calculating referral commissions for deposit: $${depositAmount}`);

      const referee = await User.findById(refereeId).session(session);
      if (!referee || !referee.referredBy) {
        return;
      }

      // Level 1 Referral (Direct)
      const level1Referrer = await User.findById(referee.referredBy).session(session);
      if (level1Referrer && level1Referrer.isActive) {
        const level1Commission = depositAmount * level1Referrer.getCommissionRate();
        
        await Transaction.create([{
          userId: level1Referrer._id,
          type: 'REFERRAL_COMMISSION',
          amount: level1Commission,
          status: 'COMPLETED',
          description: `Level 1 referral commission from ${referee.name}`,
          metadata: {
            refereeId: referee._id,
            refereeName: referee.name,
            depositAmount,
            level: 1,
          },
          processedAt: new Date(),
        }], { session });

        await User.findByIdAndUpdate(
          level1Referrer._id,
          { $inc: { walletBalance: level1Commission } },
          { session }
        );
        
        logger.info(`Level 1 commission paid: $${level1Commission} to user ${level1Referrer._id}`);

        // Level 2 Referral (Indirect) - 30% of level 1 commission
        if (level1Referrer.referredBy) {
          const level2Referrer = await User.findById(level1Referrer.referredBy).session(session);
          if (level2Referrer && level2Referrer.isActive) {
            const level2Commission = level1Commission * 0.3; // 30% of level 1
            
            await Transaction.create([{
              userId: level2Referrer._id,
              type: 'REFERRAL_COMMISSION',
              amount: level2Commission,
              status: 'COMPLETED',
              description: `Level 2 referral commission from ${referee.name}`,
              metadata: {
                refereeId: referee._id,
                refereeName: referee.name,
                depositAmount,
                level: 2,
              },
              processedAt: new Date(),
            }], { session });

            await User.findByIdAndUpdate(
              level2Referrer._id,
              { $inc: { walletBalance: level2Commission } },
              { session }
            );
            
            logger.info(`Level 2 commission paid: $${level2Commission} to user ${level2Referrer._id}`);
          }
        }

        // Check for milestone bonuses
        await checkMilestoneBonuses(level1Referrer._id, session);
      }
    });
  } catch (error) {
    logger.error('Error calculating referral commissions:', error);
  } finally {
    await session.endSession();
  }
};

/**
 * Milestone Bonus Calculator
 * Checks and awards milestone bonuses based on referral count
 */
const checkMilestoneBonuses = async (referrerId, session = null) => {
  try {
    const useSession = session || await mongoose.startSession();
    
    const processWithSession = async (session) => {
      const referrer = await User.findById(referrerId).session(session);
      if (!referrer) return;

      // Count direct referrals
      const directReferralCount = await User.countDocuments({
        referredBy: referrerId,
        isActive: true,
      }).session(session);

      const milestones = JSON.parse(process.env.MILESTONE_BONUSES || '{"10":100,"25":300,"50":750,"100":2000,"200":5000}');
      
      for (const [count, bonus] of Object.entries(milestones)) {
        const milestoneCount = parseInt(count);
        
        if (directReferralCount >= milestoneCount) {
          // Check if this milestone bonus was already awarded
          const existingBonus = await Transaction.findOne({
            userId: referrerId,
            type: 'MILESTONE_BONUS',
            'metadata.milestoneCount': milestoneCount,
          }).session(session);

          if (!existingBonus) {
            await Transaction.create([{
              userId: referrerId,
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

            await User.findByIdAndUpdate(
              referrerId,
              { $inc: { walletBalance: bonus } },
              { session }
            );
            
            logger.info(`Milestone bonus awarded: $${bonus} to user ${referrerId} for ${milestoneCount} referrals`);
          }
        }
      }
    };

    if (session) {
      await processWithSession(session);
    } else {
      await useSession.withTransaction(async () => {
        await processWithSession(useSession);
      });
      await useSession.endSession();
    }
  } catch (error) {
    logger.error('Error checking milestone bonuses:', error);
  }
};

/**
 * Cleanup Expired Transactions
 * Runs every hour to clean up expired pending transactions
 */
const cleanupExpiredTransactionsJob = cron.schedule('0 * * * *', async () => {
  try {
    logger.info('Starting cleanup of expired transactions...');
    
    const count = await Transaction.cleanupExpiredTransactions();
    
    if (count > 0) {
      logger.info(`Cleaned up ${count} expired transactions`);
    }
  } catch (error) {
    logger.error('Error in cleanup expired transactions job:', error);
  }
}, {
  scheduled: false,
  timezone: 'UTC',
});

/**
 * Initialize all cron jobs
 */
const initializeCronJobs = () => {
  logger.info('Initializing cron jobs...');
  
  // Start daily earnings job
  dailyEarningsJob.start();
  logger.info('Daily earnings job scheduled for 3:00 AM UTC');

  // Start cleanup job
  cleanupExpiredTransactionsJob.start();
  logger.info('Cleanup expired transactions job scheduled for every hour');

  // You can add more cron jobs here as needed
};

/**
 * Stop all cron jobs
 */
const stopCronJobs = () => {
  logger.info('Stopping cron jobs...');
  dailyEarningsJob.stop();
  cleanupExpiredTransactionsJob.stop();
};

module.exports = {
  initializeCronJobs,
  stopCronJobs,
  calculateReferralCommissions,
  checkMilestoneBonuses,
  dailyEarningsJob,
  cleanupExpiredTransactionsJob,
};