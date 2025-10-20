// Complete USDT Auto-Sweep System - Two-Step Process
// 1. Detect USDT deposit in HD wallet
// 2. Send TRX for gas fees
// 3. Sweep USDT to main wallet

require('dotenv').config();
const crypto = require('crypto');

class USDTAutoSweepService {
    constructor() {
        this.usdtContract = 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs'; // USDT on Shasta testnet
        this.mainWallet = process.env.TESTNET_OWNER_WALLET;
        this.mainWalletPrivateKey = process.env.OWNER_WALLET_PRIVATE_KEY;
        this.gasAmount = 20; // TRX to send for gas fees
        this.minSweepAmount = 1; // Minimum USDT to trigger sweep
    }

    async initializeTronWeb(privateKey = null) {
        const TronWebModule = require('tronweb');
        const TronWeb = TronWebModule.TronWeb || TronWebModule.default.TronWeb;
        
        const config = {
            fullHost: 'https://api.shasta.trongrid.io'
        };
        
        if (privateKey) {
            config.privateKey = privateKey;
        }
        
        return new TronWeb(config);
    }

    generateHDWallet(userId, addressIndex) {
        // Generate HD wallet using same method as your system
        const tronPrivateKey = crypto.createHash('sha256')
            .update(`tron-mainnet-${userId}-${addressIndex}-${process.env.HD_WALLET_SEED || 'redstone-hd-seed'}`)
            .digest('hex');
        
        return {
            privateKey: tronPrivateKey,
            userId,
            addressIndex
        };
    }

    async getWalletAddress(privateKey) {
        const tronWeb = await this.initializeTronWeb();
        return tronWeb.address.fromPrivateKey(privateKey);
    }

    async checkUSDTBalance(walletAddress) {
        try {
            const tronWeb = await this.initializeTronWeb();
            const contract = await tronWeb.contract().at(this.usdtContract);
            const balance = await contract.balanceOf(walletAddress).call();
            
            // Convert from contract units (6 decimals) to USDT
            const usdtBalance = balance / 1000000;
            return usdtBalance;
        } catch (error) {
            console.log(`⚠️  Could not check USDT balance for ${walletAddress}:`, error.message);
            return 0;
        }
    }

    async checkTRXBalance(walletAddress) {
        const tronWeb = await this.initializeTronWeb();
        const balance = await tronWeb.trx.getBalance(walletAddress);
        return tronWeb.fromSun(balance);
    }

    async sendGasToHDWallet(hdWalletAddress) {
        console.log(`💨 STEP 2: Sending gas to HD wallet...`);
        
        try {
            const tronWeb = await this.initializeTronWeb(this.mainWalletPrivateKey);
            const gasAmountSun = tronWeb.toSun(this.gasAmount);
            
            console.log(`   From: ${this.mainWallet}`);
            console.log(`   To: ${hdWalletAddress}`);
            console.log(`   Amount: ${this.gasAmount} TRX`);
            
            const txResult = await tronWeb.trx.sendTransaction(hdWalletAddress, gasAmountSun);
            
            if (txResult.result) {
                console.log(`   ✅ Gas sent successfully!`);
                console.log(`   TX ID: ${txResult.txid}`);
                return true;
            } else {
                console.log(`   ❌ Gas transfer failed:`, txResult);
                return false;
            }
        } catch (error) {
            console.log(`   ❌ Gas transfer error:`, error.message);
            return false;
        }
    }

    async sweepUSDTFromHDWallet(hdWallet, usdtAmount) {
        console.log(`🔄 STEP 3: Sweeping USDT from HD wallet...`);
        
        try {
            const tronWeb = await this.initializeTronWeb(hdWallet.privateKey);
            const contract = await tronWeb.contract().at(this.usdtContract);
            
            // Convert USDT to contract units (6 decimals)
            const amountInContractUnits = Math.floor(usdtAmount * 1000000);
            
            console.log(`   From: ${await this.getWalletAddress(hdWallet.privateKey)}`);
            console.log(`   To: ${this.mainWallet}`);
            console.log(`   Amount: ${usdtAmount} USDT`);
            
            // Execute USDT transfer
            const txResult = await contract.transfer(this.mainWallet, amountInContractUnits).send();
            
            if (txResult) {
                console.log(`   ✅ USDT sweep successful!`);
                console.log(`   TX ID: ${txResult}`);
                console.log(`   Explorer: https://shasta.tronscan.org/#/transaction/${txResult}`);
                return true;
            } else {
                console.log(`   ❌ USDT sweep failed`);
                return false;
            }
        } catch (error) {
            console.log(`   ❌ USDT sweep error:`, error.message);
            return false;
        }
    }

    async performCompleteSweep(userId, addressIndex) {
        console.log('🚀 COMPLETE USDT AUTO-SWEEP PROCESS');
        console.log('===================================');
        console.log('');
        
        try {
            // Generate HD wallet
            const hdWallet = this.generateHDWallet(userId, addressIndex);
            const hdWalletAddress = await this.getWalletAddress(hdWallet.privateKey);
            
            console.log('📋 SWEEP CONFIGURATION:');
            console.log(`   HD Wallet: ${hdWalletAddress}`);
            console.log(`   User ID: ${userId}`);
            console.log(`   Address Index: ${addressIndex}`);
            console.log(`   Main Wallet: ${this.mainWallet}`);
            console.log('');
            
            // STEP 1: Check for USDT deposits
            console.log('🔍 STEP 1: Detecting USDT deposits...');
            const usdtBalance = await this.checkUSDTBalance(hdWalletAddress);
            const trxBalance = await this.checkTRXBalance(hdWalletAddress);
            
            console.log(`   USDT Balance: ${usdtBalance} USDT`);
            console.log(`   TRX Balance: ${trxBalance} TRX`);
            console.log('');
            
            if (usdtBalance < this.minSweepAmount) {
                console.log(`❌ Insufficient USDT balance (minimum: ${this.minSweepAmount} USDT)`);
                console.log('💡 Send some USDT to this HD wallet to test the sweep:');
                console.log(`   Address: ${hdWalletAddress}`);
                console.log(`   USDT Contract: ${this.usdtContract}`);
                return false;
            }
            
            console.log(`✅ USDT deposit detected: ${usdtBalance} USDT`);
            console.log('');
            
            // STEP 2: Send gas if needed
            if (trxBalance < 10) { // Need at least 10 TRX for USDT transfer
                console.log(`⛽ HD wallet needs gas (has ${trxBalance} TRX, need ~10 TRX)`);
                
                const gasSent = await this.sendGasToHDWallet(hdWalletAddress);
                if (!gasSent) {
                    console.log('❌ Failed to send gas, cannot proceed with sweep');
                    return false;
                }
                
                // Wait for gas transaction to confirm
                console.log('⏳ Waiting for gas transaction to confirm...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
                console.log(`✅ HD wallet has sufficient gas: ${trxBalance} TRX`);
            }
            
            console.log('');
            
            // STEP 3: Sweep USDT
            const sweepSuccess = await this.sweepUSDTFromHDWallet(hdWallet, usdtBalance);
            
            if (sweepSuccess) {
                console.log('');
                console.log('🎉 COMPLETE USDT AUTO-SWEEP SUCCESSFUL!');
                console.log('=======================================');
                console.log('');
                console.log('✅ USDT deposit detected automatically');
                console.log('✅ Gas fees provided from main wallet');
                console.log('✅ USDT swept to main wallet');
                console.log('✅ HD wallet system fully operational');
                console.log('');
                
                // Final balance check
                console.log('📊 FINAL BALANCES:');
                const finalUSDT = await this.checkUSDTBalance(hdWalletAddress);
                const finalTRX = await this.checkTRXBalance(hdWalletAddress);
                const mainUSDT = await this.checkUSDTBalance(this.mainWallet);
                
                console.log(`   HD Wallet USDT: ${finalUSDT} USDT`);
                console.log(`   HD Wallet TRX: ${finalTRX} TRX`);
                console.log(`   Main Wallet USDT: ${mainUSDT} USDT`);
                
                return true;
            } else {
                console.log('❌ USDT sweep failed');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Complete sweep failed:', error.message);
            return false;
        }
    }
}

// Demo function to test the complete USDT sweep
async function runUSDTSweepDemo() {
    console.log('🧪 USDT AUTO-SWEEP DEMONSTRATION');
    console.log('=================================');
    console.log('');
    
    const sweepService = new USDTAutoSweepService();
    
    // Test with HD wallet user 888, address index 0
    const testUserId = 888;
    const testAddressIndex = 0;
    
    // Generate the HD wallet for testing
    const hdWallet = sweepService.generateHDWallet(testUserId, testAddressIndex);
    const hdWalletAddress = await sweepService.getWalletAddress(hdWallet.privateKey);
    
    console.log('🎯 TEST WALLET CREATED:');
    console.log(`   Address: ${hdWalletAddress}`);
    console.log(`   User ID: ${testUserId}`);
    console.log(`   Address Index: ${testAddressIndex}`);
    console.log('');
    console.log('📤 TO TEST USDT SWEEP:');
    console.log('1. Send USDT to the address above');
    console.log(`2. USDT Contract: ${sweepService.usdtContract}`);
    console.log('3. Network: Shasta Testnet');
    console.log('4. Run the sweep process');
    console.log('');
    
    // Perform the complete sweep
    await sweepService.performCompleteSweep(testUserId, testAddressIndex);
}

// Run the demo
runUSDTSweepDemo();