const crypto = require('crypto');
const { ethers } = require('ethers');

// Current implementation (INVALID)
function generateCurrentTronAddress(userId, addressIndex) {
    const tronSeed = crypto.createHash('sha256')
        .update(`tron-${userId}-${addressIndex}`)
        .digest('hex');
    
    // This is WRONG - just concatenating T + hex
    const tronAddress = 'T' + tronSeed.substring(0, 33);
    return tronAddress;
}

// Proper Tron address validation
function isValidTronAddress(address) {
    // Tron mainnet addresses:
    // - Start with 'T' 
    // - Are 34 characters long
    // - Use base58 encoding
    // - Have proper checksum
    
    if (!address || typeof address !== 'string') return false;
    if (!address.startsWith('T')) return false;
    if (address.length !== 34) return false;
    
    // Basic pattern check for base58
    const base58Pattern = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    return base58Pattern.test(address);
}

// Test current implementation
console.log('=== Testing Current Implementation ===');
const testUserId = '68e1b096353558ddf63ea70d';
const testAddress = generateCurrentTronAddress(testUserId, 12345);

console.log('Generated address:', testAddress);
console.log('Address length:', testAddress.length);
console.log('Is valid Tron format?', isValidTronAddress(testAddress));

// Test some real Tron addresses for comparison
console.log('\n=== Testing Real Tron Addresses ===');
const realAddresses = [
    'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu', // Your owner wallet
    'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT contract
    'TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH'  // Random valid address
];

realAddresses.forEach(addr => {
    console.log(`${addr}: Valid = ${isValidTronAddress(addr)}`);
});

console.log('\n=== Analysis ===');
console.log('PROBLEM: Current implementation generates invalid addresses');
console.log('- Uses hex characters (0-9, a-f) instead of base58');
console.log('- Wrong length (34 vs proper 34 base58 chars)');
console.log('- No proper checksum validation');
console.log('- Just concatenation, not proper address derivation');