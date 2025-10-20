const cron = require('node-cron');
const FundSweepService = require('./FundSweepService');

/**
 * Automated USDT Sweep Scheduler
 * Runs the automated USDT sweep process at regular intervals
 */
class AutoSweepScheduler {
    constructor() {
        this.fundSweepService = new FundSweepService();
        this.isRunning = false;
        this.lastRun = null;
        this.cronJob = null;
        
        // Configuration
        this.scheduleInterval = process.env.SWEEP_SCHEDULE_INTERVAL || '*/5 * * * *'; // Every 5 minutes by default
        this.enabled = process.env.AUTO_SWEEP_ENABLED !== 'false'; // Enabled by default
        
        console.log(`🔄 AutoSweepScheduler initialized:`);
        console.log(`   Schedule: ${this.scheduleInterval}`);
        console.log(`   Enabled: ${this.enabled}`);
    }

    /**
     * Start the automated sweep scheduler
     */
    async start() {
        if (!this.enabled) {
            console.log('⏸️  Auto-sweep scheduler is disabled');
            return;
        }

        if (this.cronJob) {
            console.log('⚠️  Auto-sweep scheduler is already running');
            return;
        }

        try {
            // Initialize the fund sweep service
            await this.fundSweepService.initialize();
            
            console.log('🚀 Starting automated USDT sweep scheduler...');
            console.log(`   Schedule: ${this.scheduleInterval}`);
            
            // Create cron job
            this.cronJob = cron.schedule(this.scheduleInterval, async () => {
                await this.runSweepCycle();
            });

            // Run an initial sweep
            console.log('🔄 Running initial sweep cycle...');
            await this.runSweepCycle();
            
            console.log('✅ Automated USDT sweep scheduler started successfully');
            
        } catch (error) {
            console.error('❌ Failed to start auto-sweep scheduler:', error);
        }
    }

    /**
     * Stop the automated sweep scheduler
     */
    stop() {
        if (this.cronJob) {
            this.cronJob.destroy();
            this.cronJob = null;
            console.log('⏹️  Auto-sweep scheduler stopped');
        }
    }

    /**
     * Run a single sweep cycle
     */
    async runSweepCycle() {
        if (this.isRunning) {
            console.log('⏭️  Sweep cycle already running, skipping...');
            return;
        }

        try {
            this.isRunning = true;
            const startTime = new Date();
            
            console.log(`\n🔄 [${startTime.toISOString()}] AUTOMATED SWEEP CYCLE STARTING`);
            console.log('='.repeat(60));
            
            // Run the automated USDT sweep
            const result = await this.fundSweepService.performAutomatedUSDTSweep();
            
            const endTime = new Date();
            const duration = endTime - startTime;
            
            console.log(`\n📊 [${endTime.toISOString()}] SWEEP CYCLE COMPLETED`);
            console.log('='.repeat(60));
            console.log(`⏱️  Duration: ${duration}ms`);
            console.log(`📋 Processed: ${result.processed} deposits`);
            console.log(`✅ Successful: ${result.successful} sweeps`);
            console.log(`❌ Failed: ${result.failed} sweeps`);
            
            if (result.totalSwept > 0) {
                console.log(`💰 Total USDT swept: ${result.totalSwept} USDT`);
            }
            
            this.lastRun = endTime;
            
            // Log summary for monitoring
            if (result.successful > 0 || result.failed > 0) {
                console.log(`\n🎯 SWEEP SUMMARY: ${result.successful}/${result.processed} successful`);
                if (result.totalSwept > 0) {
                    console.log(`💵 Revenue: $${result.totalSwept} USDT swept to main wallet`);
                }
            }
            
        } catch (error) {
            console.error('❌ Sweep cycle failed:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Manual trigger for sweep cycle
     */
    async triggerManualSweep() {
        console.log('🔄 Manual sweep triggered...');
        await this.runSweepCycle();
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        return {
            enabled: this.enabled,
            running: this.isRunning,
            scheduled: !!this.cronJob,
            lastRun: this.lastRun,
            scheduleInterval: this.scheduleInterval,
            nextRun: this.cronJob ? 'Active cron job' : 'Not scheduled'
        };
    }

    /**
     * Update schedule interval
     */
    updateSchedule(newInterval) {
        this.scheduleInterval = newInterval;
        
        if (this.cronJob) {
            this.stop();
            this.start();
        }
        
        console.log(`📅 Schedule updated to: ${newInterval}`);
    }

    /**
     * Enable/disable auto-sweep
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        
        if (enabled && !this.cronJob) {
            this.start();
        } else if (!enabled && this.cronJob) {
            this.stop();
        }
        
        console.log(`🔄 Auto-sweep ${enabled ? 'enabled' : 'disabled'}`);
    }
}

module.exports = AutoSweepScheduler;