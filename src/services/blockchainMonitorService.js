const axios = require('axios');
const WalletService = require('./walletService');

class BlockchainMonitorService {
    constructor() {
        this.walletService = new WalletService();
        this.etherscanApiKey = process.env.ethscan || null;
        this.tronApiKey = process.env.tron_api_key || null;
        
        // API endpoints for different networks
        this.apiEndpoints = {
            ethereum: 'https://api.etherscan.io/api',
            bsc: 'https://api.bscscan.com/api',
            polygon: 'https://api.polygonscan.com/api',
            tron: 'https://api.trongrid.io'
        };

        // Rate limiting: 5 requests per second for free tier
        this.rateLimitDelay = 200; // 200ms between requests
        this.lastRequestTime = 0;
    }

    /**
     * Rate limiting helper
     */
    async rateLimitedRequest() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.rateLimitDelay) {
            await new Promise(resolve => 
                setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest)
            );
        }
        
        this.lastRequestTime = Date.now();
    }

    /**
     * Get transaction history for an address
     * @param {string} address - Wallet address
     * @param {string} network - Network (ethereum, bsc, polygon)
     * @param {number} startBlock - Starting block number
     * @returns {Array} Transaction list
     */
    async getAddressTransactions(address, network = 'bsc', startBlock = 0) {
        try {
            await this.rateLimitedRequest();
            
            const apiUrl = this.apiEndpoints[network];
            if (!apiUrl) {
                throw new Error(`Unsupported network: ${network}`);
            }

            const params = {
                module: 'account',
                action: 'txlist',
                address: address,
                startblock: startBlock,
                endblock: 99999999,
                sort: 'desc',
                apikey: this.etherscanApiKey
            };

            const response = await axios.get(apiUrl, { params });
            
            if (response.data.status !== '1') {
                throw new Error(`API Error: ${response.data.message}`);
            }

            return response.data.result || [];
        } catch (error) {
            console.error(`Error fetching transactions for ${address}:`, error.message);
            return [];
        }
    }

    /**
     * Get USDT token transfers for an address
     * @param {string} address - Wallet address
     * @param {string} network - Network
     * @param {number} startBlock - Starting block
     * @returns {Array} Token transfer list
     */
    async getUSDTTransfers(address, network = 'bsc', startBlock = 0) {
        try {
            // Handle Tron network separately
            if (network === 'tron') {
                return await this.getTronUSDTTransfers(address);
            }

            await this.rateLimitedRequest();
            
            const apiUrl = this.apiEndpoints[network];
            const contractAddress = this.walletService.usdtContracts[network];
            
            if (!apiUrl || !contractAddress) {
                throw new Error(`Unsupported network or contract: ${network}`);
            }

            const params = {
                module: 'account',
                action: 'tokentx',
                contractaddress: contractAddress,
                address: address,
                startblock: startBlock,
                endblock: 99999999,
                sort: 'desc',
                apikey: this.etherscanApiKey
            };

            const response = await axios.get(apiUrl, { params });
            
            if (response.data.status !== '1') {
                // No transactions found is not an error
                if (response.data.message === 'No transactions found') {
                    return [];
                }
                throw new Error(`API Error: ${response.data.message}`);
            }

            return response.data.result || [];
        } catch (error) {
            console.error(`Error fetching USDT transfers for ${address}:`, error.message);
            return [];
        }
    }

    /**
     * Get current block number for a network
     * @param {string} network - Network
     * @returns {number} Current block number
     */
    async getCurrentBlockNumber(network = 'bsc') {
        try {
            await this.rateLimitedRequest();
            
            const apiUrl = this.apiEndpoints[network];
            
            const params = {
                module: 'proxy',
                action: 'eth_blockNumber',
                apikey: this.etherscanApiKey
            };

            const response = await axios.get(apiUrl, { params });
            
            if (response.data.error) {
                throw new Error(`API Error: ${response.data.error.message}`);
            }

            return parseInt(response.data.result, 16);
        } catch (error) {
            console.error(`Error fetching current block number:`, error.message);
            return 0;
        }
    }

    /**
     * Check if a transaction has enough confirmations
     * @param {Object} transaction - Transaction object
     * @param {string} network - Network
     * @param {number} requiredConfirmations - Required confirmations
     * @returns {Object} Confirmation status
     */
    async checkTransactionConfirmations(transaction, network, requiredConfirmations = 15) {
        try {
            const currentBlock = await this.getCurrentBlockNumber(network);
            const txBlock = parseInt(transaction.blockNumber);
            const confirmations = currentBlock - txBlock + 1;

            return {
                confirmations,
                requiredConfirmations,
                isConfirmed: confirmations >= requiredConfirmations,
                blockNumber: txBlock,
                currentBlock
            };
        } catch (error) {
            console.error(`Error checking confirmations:`, error.message);
            return {
                confirmations: 0,
                requiredConfirmations,
                isConfirmed: false,
                blockNumber: 0,
                currentBlock: 0
            };
        }
    }

    /**
     * Monitor a specific address for deposits
     * @param {Object} depositRequest - Deposit request details
     * @returns {Object} Monitoring result
     */
    async monitorDepositAddress(depositRequest) {
        try {
            const { address, network, amount, userId } = depositRequest;
            
            // Handle Tron network separately
            if (network === 'tron') {
                return await this.monitorTronDepositAddress(depositRequest);
            }
            
            // Get USDT transfers to this address
            const transfers = await this.getUSDTTransfers(address, network);
            
            // Filter transfers that match our criteria
            const relevantTransfers = transfers.filter(tx => {
                const transferAmount = parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal));
                return tx.to.toLowerCase() === address.toLowerCase() && 
                       transferAmount >= amount * 0.99; // Allow 1% tolerance
            });

            if (relevantTransfers.length === 0) {
                return {
                    status: 'PENDING',
                    message: 'No matching deposits found',
                    address,
                    expectedAmount: amount
                };
            }

            // Check the most recent matching transfer
            const latestTransfer = relevantTransfers[0];
            const confirmationStatus = await this.checkTransactionConfirmations(
                latestTransfer, 
                network, 
                depositRequest.requiredConfirmations
            );

            const transferAmount = parseFloat(latestTransfer.value) / Math.pow(10, parseInt(latestTransfer.tokenDecimal));

            return {
                status: confirmationStatus.isConfirmed ? 'CONFIRMED' : 'PENDING_CONFIRMATIONS',
                transactionHash: latestTransfer.hash,
                amount: transferAmount,
                fromAddress: latestTransfer.from,
                blockNumber: latestTransfer.blockNumber,
                timestamp: new Date(parseInt(latestTransfer.timeStamp) * 1000),
                confirmations: confirmationStatus.confirmations,
                requiredConfirmations: confirmationStatus.requiredConfirmations,
                isConfirmed: confirmationStatus.isConfirmed,
                gasUsed: latestTransfer.gasUsed,
                gasPrice: latestTransfer.gasPrice
            };
        } catch (error) {
            console.error(`Error monitoring deposit address ${depositRequest.address}:`, error.message);
            return {
                status: 'ERROR',
                message: error.message,
                address: depositRequest.address
            };
        }
    }

    /**
     * Batch monitor multiple deposit addresses
     * @param {Array} depositRequests - Array of deposit requests
     * @returns {Array} Monitoring results
     */
    async batchMonitorDeposits(depositRequests) {
        const results = [];
        
        for (const depositRequest of depositRequests) {
            try {
                const result = await this.monitorDepositAddress(depositRequest);
                results.push({
                    userId: depositRequest.userId,
                    depositId: depositRequest.id || depositRequest._id,
                    ...result
                });
                
                // Add delay between requests to respect rate limits
                await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
            } catch (error) {
                results.push({
                    userId: depositRequest.userId,
                    depositId: depositRequest.id || depositRequest._id,
                    status: 'ERROR',
                    message: error.message
                });
            }
        }
        
        return results;
    }

    /**
     * Verify a withdrawal transaction was broadcasted successfully
     * @param {string} transactionHash - Transaction hash
     * @param {string} network - Network
     * @returns {Object} Transaction verification
     */
    async verifyWithdrawalTransaction(transactionHash, network) {
        try {
            await this.rateLimitedRequest();
            
            const apiUrl = this.apiEndpoints[network];
            
            const params = {
                module: 'proxy',
                action: 'eth_getTransactionByHash',
                txhash: transactionHash,
                apikey: this.etherscanApiKey
            };

            const response = await axios.get(apiUrl, { params });
            
            if (response.data.error) {
                throw new Error(`API Error: ${response.data.error.message}`);
            }

            const tx = response.data.result;
            
            if (!tx) {
                return {
                    status: 'NOT_FOUND',
                    message: 'Transaction not found on blockchain'
                };
            }

            // Get transaction receipt for status
            const receiptParams = {
                module: 'proxy',
                action: 'eth_getTransactionReceipt',
                txhash: transactionHash,
                apikey: this.etherscanApiKey
            };

            await this.rateLimitedRequest();
            const receiptResponse = await axios.get(apiUrl, { params: receiptParams });
            const receipt = receiptResponse.data.result;

            return {
                status: receipt?.status === '0x1' ? 'SUCCESS' : 'FAILED',
                transactionHash,
                blockNumber: parseInt(tx.blockNumber, 16),
                gasUsed: receipt ? parseInt(receipt.gasUsed, 16) : null,
                gasPrice: parseInt(tx.gasPrice, 16),
                from: tx.from,
                to: tx.to,
                value: tx.value,
                nonce: parseInt(tx.nonce, 16)
            };
        } catch (error) {
            console.error(`Error verifying withdrawal transaction:`, error.message);
            return {
                status: 'ERROR',
                message: error.message
            };
        }
    }

    /**
     * Get USDT transfers for Tron network
     * @param {string} address - Tron address
     * @param {number} limit - Limit of transactions
     * @returns {Array} Array of USDT transfers
     */
    async getTronUSDTTransfers(address, limit = 50) {
        try {
            await this.rateLimitedRequest();
            
            const apiUrl = `${this.apiEndpoints.tron}/v1/accounts/${address}/transactions/trc20`;
            
            const params = {
                limit,
                contract_address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT TRC20 contract
                order_by: 'timestamp,desc'
            };

            const response = await axios.get(apiUrl, { 
                params,
                headers: {
                    'TRON-PRO-API-KEY': this.tronApiKey
                }
            });
            
            if (!response.data.success) {
                throw new Error(`Tron API Error: ${response.data.error || 'Unknown error'}`);
            }

            return response.data.data || [];
        } catch (error) {
            console.error(`Error fetching Tron USDT transfers for ${address}:`, error.message);
            return [];
        }
    }

    /**
     * Monitor Tron address for USDT deposits
     * @param {Object} depositRequest - Deposit request details
     * @returns {Object} Monitoring result
     */
    async monitorTronDepositAddress(depositRequest) {
        try {
            const { address, amount, userId } = depositRequest;
            
            // Get USDT transfers to this address
            const transfers = await this.getTronUSDTTransfers(address);
            
            // Filter transfers that match our criteria
            const relevantTransfers = transfers.filter(tx => {
                const transferAmount = parseFloat(tx.value) / 1000000; // USDT has 6 decimals on Tron
                return tx.to === address && 
                       tx.type === 'Transfer' &&
                       transferAmount >= amount * 0.99; // Allow 1% tolerance
            });

            if (relevantTransfers.length === 0) {
                return {
                    status: 'PENDING',
                    message: 'No matching deposits found',
                    address,
                    expectedAmount: amount
                };
            }

            // Check the most recent matching transfer
            const latestTransfer = relevantTransfers[0];
            const transferAmount = parseFloat(latestTransfer.value) / 1000000;

            // For Tron, we'll consider transactions confirmed after 19 confirmations (about 1 minute)
            const blockInfo = await this.getTronBlockInfo(latestTransfer.block);
            const currentBlock = await this.getTronCurrentBlock();
            const confirmations = currentBlock - latestTransfer.block + 1;
            const isConfirmed = confirmations >= 19;

            return {
                status: isConfirmed ? 'CONFIRMED' : 'PENDING_CONFIRMATIONS',
                transactionHash: latestTransfer.transaction_id,
                amount: transferAmount,
                fromAddress: latestTransfer.from,
                blockNumber: latestTransfer.block,
                timestamp: new Date(latestTransfer.block_timestamp),
                confirmations,
                requiredConfirmations: 19,
                isConfirmed,
                network: 'tron'
            };
        } catch (error) {
            console.error(`Error monitoring Tron deposit address ${depositRequest.address}:`, error.message);
            return {
                status: 'ERROR',
                message: error.message,
                address: depositRequest.address
            };
        }
    }

    /**
     * Get current block number for Tron
     * @returns {number} Current block number
     */
    async getTronCurrentBlock() {
        try {
            await this.rateLimitedRequest();
            
            const apiUrl = `${this.apiEndpoints.tron}/wallet/getnowblock`;
            
            const response = await axios.post(apiUrl, {}, {
                headers: {
                    'TRON-PRO-API-KEY': this.tronApiKey
                }
            });
            
            return response.data.block_header.raw_data.number;
        } catch (error) {
            console.error(`Error fetching Tron current block:`, error.message);
            return 0;
        }
    }

    /**
     * Get block info for Tron
     * @param {number} blockNumber - Block number
     * @returns {Object} Block info
     */
    async getTronBlockInfo(blockNumber) {
        try {
            await this.rateLimitedRequest();
            
            const apiUrl = `${this.apiEndpoints.tron}/wallet/getblockbynum`;
            
            const response = await axios.post(apiUrl, {
                num: blockNumber
            }, {
                headers: {
                    'TRON-PRO-API-KEY': this.tronApiKey
                }
            });
            
            return response.data;
        } catch (error) {
            console.error(`Error fetching Tron block info:`, error.message);
            return null;
        }
    }
}

module.exports = BlockchainMonitorService;