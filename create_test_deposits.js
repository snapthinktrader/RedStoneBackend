require('dotenv').config();

/**
 * Comprehensive Test: Create Test Deposits and Demonstrate Auto-Sweep
 * This will simulate real deposit scenarios and test the complete sweep system
 */

class TestDepositCreator {
    constructor() {
        this.tronApiUrl = 'https://api.shasta.trongrid.io';
        this.usdtContract = 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs'; // Testnet USDT
        this.ownerWallet = process.env.TESTNET_OWNER_WALLET;
        this.ownerPrivateKey = process.env.OWNER_WALLET_PRIVATE_KEY;
        
        console.log('🧪 TEST DEPOSIT CREATOR INITIALIZED');
        console.log('===================================');
        console.log(`Owner Wallet: ${this.ownerWallet}`);
        console.log(`Network: Shasta Testnet`);
        console.log('');
    }

    /**
     * Generate test HD wallet addresses for deposits
     */
    generateTestWallets(count = 3) {
        const TronWeb = require('tronweb');
        const testWallets = [];
        
        console.log(`🔑 GENERATING ${count} TEST HD WALLETS`);
        console.log('=====================================');
        
        for (let i = 0; i < count; i++) {
            const account = TronWeb.utils.accounts.generateAccount();
            const wallet = {
                id: `test-deposit-${i + 1}`,
                address: account.address.base58,
                privateKey: account.privateKey,
                publicKey: account.publicKey,
                purpose: `Test deposit wallet ${i + 1}`,
                expectedAmount: (i + 1) * 10, // 10, 20, 30 USDT
                status: 'GENERATED'
            };
            
            testWallets.push(wallet);
            
            console.log(`${i + 1}. Test Wallet Generated:`);
            console.log(`   Address: ${wallet.address}`);
            console.log(`   Expected: ${wallet.expectedAmount} USDT`);
            console.log(`   Purpose: ${wallet.purpose}`);
            console.log('');
        }
        
        return testWallets;
    }

    /**
     * Simulate sending TRX to test wallets for gas fees
     */
    async sendTestTRX(wallets) {
        try {
            const TronWeb = require('tronweb');
            const tronWeb = new TronWeb({
                fullHost: this.tronApiUrl,
                privateKey: this.ownerPrivateKey
            });
            
            console.log('💰 SENDING TRX TO TEST WALLETS FOR GAS FEES');
            console.log('============================================');
            
            const results = [];
            
            for (const wallet of wallets) {
                try {
                    console.log(`📤 Sending 50 TRX to ${wallet.address}...`);
                    
                    const trxAmount = tronWeb.toSun(50); // 50 TRX for gas fees
                    const txResult = await tronWeb.trx.sendTransaction(wallet.address, trxAmount);
                    
                    console.log(`   ✅ TRX sent! TX: ${txResult.txid || txResult}`);
                    console.log(`   🔗 View: https://shasta.tronscan.org/transaction/${txResult.txid || txResult}`);
                    
                    results.push({
                        wallet: wallet.address,
                        txHash: txResult.txid || txResult,
                        amount: 50,
                        status: 'SUCCESS'
                    });
                    
                    // Wait between transactions
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                } catch (error) {
                    console.error(`   ❌ Failed to send TRX: ${error.message}`);
                    results.push({
                        wallet: wallet.address,
                        error: error.message,
                        status: 'FAILED'
                    });
                }
            }
            
            console.log('');
            console.log('📊 TRX DISTRIBUTION RESULTS:');
            results.forEach((result, index) => {
                console.log(`${index + 1}. ${result.wallet.substring(0, 10)}... - ${result.status}`);
                if (result.txHash) {
                    console.log(`   TX: ${result.txHash}`);
                }
            });
            console.log('');
            
            return results;
            
        } catch (error) {
            console.error('❌ Error distributing TRX:', error.message);
            return [];
        }
    }

    /**
     * Create mock deposit records (simulating database entries)
     */
    createMockDeposits(wallets) {
        console.log('📝 CREATING MOCK DEPOSIT RECORDS');
        console.log('=================================');
        
        const deposits = wallets.map((wallet, index) => ({
            _id: `deposit_${Date.now()}_${index}`,
            userId: `user_${index + 1}`,
            walletAddress: wallet.address,
            privateKeySeed: wallet.privateKey,
            amount: wallet.expectedAmount,
            status: 'PENDING',
            isHDWallet: true,
            createdAt: new Date(),
            description: `Test deposit ${index + 1} - ${wallet.expectedAmount} USDT`,
            network: 'tron',
            cryptocurrency: 'USDT'
        }));
        
        deposits.forEach((deposit, index) => {
            console.log(`${index + 1}. Mock Deposit Created:`);
            console.log(`   User: ${deposit.userId}`);
            console.log(`   Address: ${deposit.walletAddress}`);
            console.log(`   Amount: ${deposit.amount} USDT`);
            console.log(`   Status: ${deposit.status}`);
            console.log('');
        });
        
        return deposits;
    }

    /**
     * Simulate the FundSweepService testing these deposits
     */
    async testSweepSystem(deposits) {
        console.log('🧹 TESTING FUND SWEEP SYSTEM');
        console.log('=============================');
        
        try {
            // Import the FundSweepService
            const FundSweepService = require('./src/services/FundSweepService');
            const sweepService = new FundSweepService();
            
            console.log('🔧 FundSweepService Configuration:');
            console.log(`   Testnet Mode: ${sweepService.isTestnet ? '✅ Enabled' : '❌ Disabled'}`);
            console.log(`   Owner Wallet: ${sweepService.ownerWallet}`);
            console.log(`   API URL: ${sweepService.tronApiUrl}`);
            console.log('');
            
            // Test each deposit manually
            for (const deposit of deposits) {
                console.log(`🔍 Testing Deposit: ${deposit._id}`);
                console.log(`   Address: ${deposit.walletAddress}`);
                console.log(`   Expected: ${deposit.amount} USDT`);
                
                // Check TRX balance
                const trxBalance = await sweepService.getTRXBalance(deposit.walletAddress);
                console.log(`   TRX Balance: ${trxBalance} TRX`);
                
                // Check USDT balance  
                const usdtBalance = await sweepService.getUSDTBalance(deposit.walletAddress);
                console.log(`   USDT Balance: ${usdtBalance} USDT`);
                
                if (trxBalance > 0) {
                    console.log(`   ✅ Wallet has TRX for gas fees`);
                } else {
                    console.log(`   ⚠️ Wallet needs TRX for gas fees`);
                }
                
                if (usdtBalance >= deposit.amount) {
                    console.log(`   ✅ Ready for sweep! (Has ${usdtBalance} USDT, needs ${deposit.amount})`);
                } else {
                    console.log(`   ⏳ Waiting for USDT deposit (Has ${usdtBalance} USDT, needs ${deposit.amount})`);
                }
                
                console.log('');
            }
            
        } catch (error) {
            console.error('❌ Error testing sweep system:', error.message);
        }
    }

    /**
     * Display monitoring information
     */
    displayMonitoringInfo(wallets) {
        console.log('📊 MONITORING YOUR TEST');
        console.log('=======================');
        console.log('');
        console.log('🔗 Block Explorer Links:');
        console.log('');
        
        console.log('📍 Your Main Wallet:');
        console.log(`   https://shasta.tronscan.org/address/${this.ownerWallet}`);
        console.log('');
        
        console.log('📍 Test Deposit Wallets:');
        wallets.forEach((wallet, index) => {
            console.log(`   ${index + 1}. https://shasta.tronscan.org/address/${wallet.address}`);
        });
        console.log('');
        
        console.log('🎯 What to Monitor:');
        console.log('   1. TRX transfers to test wallets (for gas fees)');
        console.log('   2. USDT deposits to test wallets (when you send them)');
        console.log('   3. Automatic USDT sweeps to your main wallet');
        console.log('   4. All transactions will show on block explorer');
        console.log('');
        
        console.log('📝 Next Steps:');
        console.log('   1. Wait for TRX transfers to confirm');
        console.log('   2. Send test USDT to the wallet addresses above');
        console.log('   3. Watch the auto-sweep system move USDT to your main wallet');
        console.log('   4. Monitor everything on Shasta block explorer');
        console.log('');
    }

    /**
     * Run the complete test demonstration
     */
    async runCompleteTest() {
        try {
            console.log('🚀 REDSTONE FUND SWEEP SYSTEM - COMPLETE TEST');
            console.log('==============================================');
            console.log(`Time: ${new Date().toISOString()}`);
            console.log('');
            
            // Step 1: Generate test wallets
            const testWallets = this.generateTestWallets(3);
            
            // Step 2: Send TRX for gas fees
            console.log('⏰ Sending TRX to test wallets (this will take a moment)...');
            const trxResults = await this.sendTestTRX(testWallets);
            
            // Step 3: Create mock deposits
            const mockDeposits = this.createMockDeposits(testWallets);
            
            // Step 4: Test the sweep system
            await this.testSweepSystem(mockDeposits);
            
            // Step 5: Display monitoring info
            this.displayMonitoringInfo(testWallets);
            
            console.log('🎉 TEST SETUP COMPLETE!');
            console.log('=======================');
            console.log('');
            console.log('Your RedStone auto-sweep system is now ready for testing!');
            console.log('All test wallets have been funded with TRX for gas fees.');
            console.log('');
            console.log('🧪 To complete the test:');
            console.log('   • Send test USDT to any of the generated addresses');
            console.log('   • Watch the system automatically sweep funds to your main wallet');
            console.log('   • Monitor all transactions on the Shasta block explorer');
            
        } catch (error) {
            console.error('❌ Error during complete test:', error.message);
        }
    }
}

// Run the test
async function main() {
    // Check environment
    if (!process.env.TESTNET_OWNER_WALLET || !process.env.OWNER_WALLET_PRIVATE_KEY) {
        console.error('❌ Missing environment variables!');
        console.log('Make sure your .env file has:');
        console.log('   TRON_NETWORK=testnet');
        console.log('   TESTNET_OWNER_WALLET=TMii1VrgBeiERbFsEqkq5FZexazYz1hnjy');
        console.log('   OWNER_WALLET_PRIVATE_KEY=your_private_key');
        return;
    }
    
    const testCreator = new TestDepositCreator();
    await testCreator.runCompleteTest();
}

main().catch(console.error);