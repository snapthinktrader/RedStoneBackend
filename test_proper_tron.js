const { TronWeb } = require('tronweb');
const crypto = require('crypto');

// Initialize TronWeb (we only need it for utilities, not API calls)
const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io'
});

// Proper Tron address generation
function generateValidTronAddress(userId, addressIndex) {
    try {
        // Create deterministic seed
        const seed = crypto.createHash('sha256')
            .update(`${userId}-${addressIndex}-redstone-hd-seed`)
            .digest();
        
        // Generate private key (32 bytes)
        const privateKey = seed.toString('hex');
        
        // Create Tron account from private key
        const account = tronWeb.utils.accounts.generateAccount();
        
        // For deterministic generation, we need to use the seed properly
        // This is a simplified approach - in production you'd use proper HD derivation
        const deterministicPrivateKey = crypto.createHash('sha256')
            .update(`tron-mainnet-${userId}-${addressIndex}`)
            .digest('hex');
        
        // Generate address from private key
        const address = tronWeb.address.fromPrivateKey(deterministicPrivateKey);
        
        return {
            address,
            privateKey: deterministicPrivateKey,
            isValid: tronWeb.isAddress(address)
        };
    } catch (error) {
        console.error('Error generating Tron address:', error);
        return null;
    }
}

// Test the new implementation
console.log('=== Testing Proper Tron Address Generation ===');

const testUserId = '68e1b096353558ddf63ea70d';
const result = generateValidTronAddress(testUserId, 12345);

if (result) {
    console.log('Generated address:', result.address);
    console.log('Address length:', result.address.length);
    console.log('Is valid Tron address?', result.isValid);
    console.log('Starts with T?', result.address.startsWith('T'));
    
    // Verify it's a mainnet address
    console.log('Is mainnet address?', result.address.startsWith('T') && result.address.length === 34);
    
    // Test multiple addresses to ensure uniqueness
    console.log('\n=== Testing Multiple Addresses ===');
    for (let i = 0; i < 5; i++) {
        const addr = generateValidTronAddress(testUserId, i);
        console.log(`Index ${i}: ${addr.address} (valid: ${addr.isValid})`);
    }
} else {
    console.log('Failed to generate address');
}