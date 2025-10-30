const { ethers } = require('ethers');
const crypto = require('crypto');
const { TronWeb } = require('tronweb');

class WalletService {
    constructor() {
        // Extended public key for generating deposit addresses (safe to store online)
        this.xpub = process.env.HD_WALLET_XPUB || null;
        
        // Initialize TronWeb for proper address generation
        try {
            this.tronWeb = new TronWeb({
                fullHost: 'https://api.trongrid.io'
            });
            this.tronWebAvailable = true;
            console.log('✅ TronWeb initialized successfully');
        } catch (error) {
            console.error('❌ TronWeb initialization failed:', error);
            this.tronWeb = null;
            this.tronWebAvailable = false;
        }
        
        // Networks configuration
        this.networks = {
            tron: {
                name: 'Tron Network',
                chainId: 728126428,
                rpcUrl: 'https://api.trongrid.io',
                blockExplorer: 'https://tronscan.org'
            },
            ethereum: {
                name: 'Ethereum',
                chainId: 1,
                rpcUrl: 'https://mainnet.infura.io/v3/your-api-key',
                blockExplorer: 'https://etherscan.io'
            },
            bsc: {
                name: 'Binance Smart Chain',
                chainId: 56,
                rpcUrl: 'https://bsc-dataseed.binance.org/'
            },
            polygon: {
                name: 'Polygon',
                chainId: 137,
                rpcUrl: 'https://polygon-rpc.com'
            }
        };

                // USDT contract addresses for different networks
        this.usdtContracts = {
            tron: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT-TRC20 on Tron
            ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT on Ethereum
            bsc: '0x55d398326f99059fF775485246999027B3197955', // USDT on BSC
            polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' // USDT on Polygon
        };
    }

    /**
     * Generate a new deposit address for a user
     * @param {string} userId - User ID
     * @param {string} network - Network (tron, bsc, ethereum, polygon)
     * @param {number} addressIndex - Address derivation index
     * @returns {Object} Address details
     */
    generateDepositAddress(userId, network = 'tron', addressIndex = 0) {
        try {
            // Generate unique HD wallet address for this user
            // Each user gets their own address for easy tracking
            
            // Create a deterministic seed from userId and addressIndex
            const seed = crypto.createHash('sha256')
                .update(`${userId}-${addressIndex}-${process.env.HD_WALLET_SEED || 'redstone-hd-seed'}`)
                .digest();
            
            // Generate private key from seed
            const privateKey = '0x' + seed.toString('hex');
            
            // For Tron network, generate proper Tron address
            if (network === 'tron') {
                // Check if TronWeb is available
                if (!this.tronWebAvailable || !this.tronWeb) {
                    throw new Error('TronWeb not available - cannot generate valid Tron addresses');
                }
                
                // Create deterministic private key for Tron
                const tronPrivateKey = crypto.createHash('sha256')
                    .update(`tron-mainnet-${userId}-${addressIndex}-${process.env.HD_WALLET_SEED || 'redstone-hd-seed'}`)
                    .digest('hex');
                
                console.log('🔐 Generated Tron private key for user:', userId);
                
                // Generate proper Tron address from private key
                const tronAddress = this.tronWeb.address.fromPrivateKey(tronPrivateKey);
                
                console.log('🏠 Generated Tron address:', tronAddress);
                
                // Validate the generated address
                if (!this.tronWeb.isAddress(tronAddress)) {
                    throw new Error(`Generated invalid Tron address: ${tronAddress}`);
                }
                
                if (!tronAddress.startsWith('T')) {
                    throw new Error(`Invalid Tron address format - does not start with T: ${tronAddress}`);
                }
                
                console.log('✅ Tron address validation passed');
                
                return {
                    address: tronAddress,
                    network,
                    userId,
                    addressIndex,
                    derivationPath: `m/44'/195'/${addressIndex}'/0/0`, // Tron derivation path
                    privateKeySeed: tronPrivateKey, // Store private key for later sweep
                    publicKey: tronPrivateKey.substring(0, 64), // Use first 64 chars as public key identifier
                    createdAt: new Date(),
                    isHDWallet: true,
                    ownerWallet: 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu' // Where funds will be swept
                };
            } else {
                // For Ethereum-compatible networks
                const wallet = new ethers.Wallet(privateKey);
                const address = wallet.address;
                
                return {
                    address,
                    network,
                    userId,
                    addressIndex,
                    derivationPath: `m/44'/60'/${addressIndex}'/0/0`, // ETH derivation path
                    privateKey: privateKey, // Store for sweep transactions
                    publicKey: wallet.publicKey, // Add required publicKey field
                    createdAt: new Date(),
                    isHDWallet: true,
                    ownerWallet: 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu' // Where funds will be swept
                };
            }
            
        } catch (error) {
            throw new Error(`Failed to generate deposit address: ${error.message}`);
        }
    }

    /**
     * Create a unique deposit address for a transaction
     * @param {string} userId - User ID
     * @param {string} network - Network
     * @param {number} amount - Deposit amount
     * @returns {Object} Deposit details
     */
    async createDepositRequest(userId, network, amount) {
        try {
            // Generate unique reference code for this deposit
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
            const referenceCode = `RST${timestamp.toString().slice(-6)}${randomSuffix}`;
            
            // Create unique address index based on timestamp and user
            const addressIndex = parseInt(crypto
                .createHash('sha256')
                .update(`${userId}-${timestamp}`)
                .digest('hex')
                .substring(0, 8), 16) % 100000;

            const addressDetails = this.generateDepositAddress(userId, network, addressIndex);
            
            const depositRequest = {
                ...addressDetails,
                amount,
                referenceCode, // UNIQUE identifier for this deposit
                status: 'PENDING',
                transactionHash: null,
                confirmations: 0,
                requiredConfirmations: this.getRequiredConfirmations(network),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
                metadata: {
                    usdtContract: this.usdtContracts[network],
                    networkDetails: this.networks[network],
                    instructions: `Send exactly ${amount} USDT to the address above with memo/note: ${referenceCode}`
                }
            };

            return depositRequest;
        } catch (error) {
            throw new Error(`Failed to create deposit request: ${error.message}`);
        }
    }

    /**
     * Get required confirmations for a network
     * @param {string} network - Network name
     * @returns {number} Required confirmations
     */
    getRequiredConfirmations(network) {
        const confirmations = {
            ethereum: 12,
            bsc: 15,
            polygon: 20
        };
        return confirmations[network] || 12;
    }

    /**
     * Validate an address format
     * @param {string} address - Address to validate
     * @param {string} network - Network
     * @returns {boolean} Is valid
     */
    validateAddress(address, network) {
        try {
            if (network === 'tron') {
                // Use TronWeb's built-in validation if available
                if (this.tronWebAvailable && this.tronWeb) {
                    return this.tronWeb.isAddress(address);
                } else {
                    // Fallback validation - basic Tron format check
                    console.warn('⚠️ TronWeb not available, using basic validation');
                    return address && 
                           typeof address === 'string' && 
                           address.startsWith('T') && 
                           address.length === 34;
                }
            } else {
                // For Ethereum-compatible networks
                return ethers.utils.isAddress(address);
            }
        } catch (error) {
            console.error('Address validation error:', error);
            return false;
        }
    }

    /**
     * Calculate network fees (estimate)
     * @param {string} network - Network
     * @param {string} type - Transaction type (transfer, token)
     * @returns {Object} Fee estimation
     */
    async estimateNetworkFees(network, type = 'token') {
        // TRON network uses different fee structure
        if (network === 'tron') {
            return {
                bandwidth: 345,
                energy: 65000,
                estimatedFeeTRX: '15', // ~15 TRX for TRC-20 transfer
                estimatedFeeUSD: 5,
                network: 'tron',
                type
            };
        }

        // EVM networks (Ethereum, BSC, Polygon)
        const baseFees = {
            ethereum: {
                transfer: 21000,
                token: 65000
            },
            bsc: {
                transfer: 21000,
                token: 65000
            },
            polygon: {
                transfer: 21000,
                token: 65000
            }
        };

        const gasLimit = baseFees[network]?.[type] || 65000;
        
        // Return estimated fees (you would get real gas prices from network)
        return {
            gasLimit,
            estimatedGasPrice: '5000000000', // 5 gwei (placeholder)
            estimatedFeeETH: ethers.utils.formatEther((gasLimit * 5000000000).toString()),
            network,
            type
        };
    }

    /**
     * Create withdrawal request (for admin approval)
     * @param {string} userId - User ID
     * @param {string} toAddress - Destination address
     * @param {number} amount - Withdrawal amount
     * @param {string} network - Network
     * @returns {Object} Withdrawal request
     */
    async createWithdrawalRequest(userId, toAddress, amount, network = 'tron') {
        try {
            if (!this.validateAddress(toAddress, network)) {
                throw new Error('Invalid destination address');
            }

            const fees = await this.estimateNetworkFees(network, 'token');
            
            const withdrawalRequest = {
                id: crypto.randomUUID(),
                userId,
                toAddress,
                amount,
                network,
                status: 'PENDING_APPROVAL',
                fees,
                createdAt: new Date(),
                approvedAt: null,
                processedAt: null,
                transactionHash: null,
                approvedBy: null,
                metadata: {
                    usdtContract: this.usdtContracts[network],
                    networkDetails: this.networks[network]
                }
            };

            return withdrawalRequest;
        } catch (error) {
            throw new Error(`Failed to create withdrawal request: ${error.message}`);
        }
    }

    /**
     * Generate unsigned transaction for manual signing
     * @param {Object} withdrawalRequest - Withdrawal request details
     * @param {string} fromAddress - Source address (from hot wallet)
     * @returns {Object} Unsigned transaction
     */
    generateUnsignedTransaction(withdrawalRequest, fromAddress) {
        try {
            const { toAddress, amount, network } = withdrawalRequest;
            const usdtContract = this.usdtContracts[network];

            // Create USDT transfer transaction data
            const iface = new ethers.utils.Interface([
                'function transfer(address to, uint256 amount) returns (bool)'
            ]);

            // Convert amount to wei (USDT has 6 decimals)
            const amountWei = ethers.utils.parseUnits(amount.toString(), 6);
            
            const data = iface.encodeFunctionData('transfer', [toAddress, amountWei]);

            const unsignedTransaction = {
                to: usdtContract,
                from: fromAddress,
                data,
                value: '0x0',
                gasLimit: '0xFDE8', // 65000
                gasPrice: '0x12A05F200', // 5 gwei
                nonce: null, // To be filled when signing
                chainId: this.networks[network].chainId
            };

            return {
                unsignedTransaction,
                withdrawalId: withdrawalRequest.id,
                network,
                amount,
                toAddress,
                createdAt: new Date()
            };
        } catch (error) {
            throw new Error(`Failed to generate unsigned transaction: ${error.message}`);
        }
    }
}

module.exports = WalletService;