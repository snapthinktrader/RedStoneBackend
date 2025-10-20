const crypto = require('crypto');
const { TronWeb } = require('tronweb');

class EnhancedHDWalletService {
    constructor() {
        this.tronWeb = new TronWeb({
            fullHost: process.env.TRON_NETWORK === 'mainnet' 
                ? 'https://api.trongrid.io'
                : 'https://api.shasta.trongrid.io'
        });
        
        // Encryption key for private key storage
        this.encryptionKey = process.env.HD_WALLET_SEED || 'redstone-hd-seed-secure-2024';
    }

    /**
     * Generate a new Tron wallet with private key
     * @returns {Object} { address, privateKey, publicKey }
     */
    generateNewWallet() {
        try {
            // Generate random private key (32 bytes)
            const privateKeyBuffer = crypto.randomBytes(32);
            const privateKey = privateKeyBuffer.toString('hex');
            
            // Derive address using TronWeb
            const address = this.tronWeb.address.fromPrivateKey(privateKey);
            
            // Get public key from private key
            const publicKeyBuffer = this.tronWeb.utils.crypto.getPubKeyFromPriKey(privateKeyBuffer);
            const publicKey = publicKeyBuffer.toString('hex');
            
            return {
                address,
                privateKey,
                publicKey
            };
        } catch (error) {
            throw new Error(`Failed to generate wallet: ${error.message}`);
        }
    }

    /**
     * Encrypt private key for secure storage
     * @param {string} privateKey - The private key to encrypt
     * @returns {string} Encrypted private key with IV
     */
    encryptPrivateKey(privateKey) {
        try {
            // Generate a random IV
            const iv = crypto.randomBytes(16);
            
            // Create key from the encryption key
            const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
            
            // Create cipher
            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
            
            // Encrypt the private key
            let encrypted = cipher.update(privateKey, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Combine IV and encrypted data
            return iv.toString('hex') + ':' + encrypted;
        } catch (error) {
            throw new Error(`Failed to encrypt private key: ${error.message}`);
        }
    }

    /**
     * Decrypt private key for use
     * @param {string} encryptedPrivateKey - The encrypted private key with IV
     * @returns {string} Decrypted private key
     */
    decryptPrivateKey(encryptedPrivateKey) {
        try {
            // Split IV and encrypted data
            const parts = encryptedPrivateKey.split(':');
            if (parts.length !== 2) {
                throw new Error('Invalid encrypted private key format');
            }
            
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            
            // Create key from the encryption key
            const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
            
            // Create decipher
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            
            // Decrypt the private key
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error(`Failed to decrypt private key: ${error.message}`);
        }
    }

    /**
     * Create a complete deposit wallet with encrypted private key storage
     * @param {number} addressIndex - Index for derivation path
     * @returns {Object} Complete wallet info for deposit
     */
    createDepositWallet(addressIndex) {
        try {
            // Generate new wallet
            const wallet = this.generateNewWallet();
            
            // Encrypt the private key
            const encryptedPrivateKey = this.encryptPrivateKey(wallet.privateKey);
            
            // Create derivation path (for compatibility)
            const derivationPath = `m/44'/195'/0'/0/${addressIndex}`;
            
            return {
                address: wallet.address,
                privateKey: wallet.privateKey, // For immediate use
                encryptedPrivateKey: encryptedPrivateKey, // For storage
                publicKey: wallet.publicKey,
                derivationPath: derivationPath,
                addressIndex: addressIndex,
                isHDWallet: true
            };
        } catch (error) {
            throw new Error(`Failed to create deposit wallet: ${error.message}`);
        }
    }

    /**
     * Get wallet instance for transactions
     * @param {string} privateKey - The private key
     * @returns {TronWeb} TronWeb instance with private key
     */
    getWalletInstance(privateKey) {
        return new TronWeb({
            fullHost: process.env.TRON_NETWORK === 'mainnet' 
                ? 'https://api.trongrid.io'
                : 'https://api.shasta.trongrid.io',
            privateKey: privateKey
        });
    }

    /**
     * Validate if address is valid Tron address
     * @param {string} address - Address to validate
     * @returns {boolean} Is valid address
     */
    isValidAddress(address) {
        return this.tronWeb.isAddress(address);
    }

    /**
     * Get balance of address
     * @param {string} address - Wallet address
     * @param {string} privateKey - Optional private key for better USDT balance checking
     * @returns {Object} { trx, usdt }
     */
    async getWalletBalance(address, privateKey = null) {
        try {
            // Use specific TronWeb instance if private key provided
            const tronWebInstance = privateKey ? this.getWalletInstance(privateKey) : this.tronWeb;
            
            // Get TRX balance
            const trxBalance = await tronWebInstance.trx.getBalance(address);
            const trxAmount = tronWebInstance.fromSun(trxBalance);

            // Get USDT balance
            let usdtAmount = 0;
            try {
                const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
                const contract = await tronWebInstance.contract().at(usdtContract);
                const usdtBalance = await contract.balanceOf(address).call();
                usdtAmount = tronWebInstance.toBigNumber(usdtBalance).div(1000000).toNumber();
            } catch (usdtError) {
                console.log(`Could not fetch USDT balance for ${address}:`, usdtError.message);
            }

            return {
                trx: parseFloat(trxAmount),
                usdt: usdtAmount
            };
        } catch (error) {
            throw new Error(`Failed to get wallet balance: ${error.message}`);
        }
    }

    /**
     * Check if wallet has received any transactions
     * @param {string} address - Wallet address
     * @returns {boolean} Has transactions
     */
    async hasTransactions(address) {
        try {
            const account = await this.tronWeb.trx.getAccount(address);
            return account && account.address && account.address === address;
        } catch (error) {
            return false;
        }
    }
}

module.exports = EnhancedHDWalletService;