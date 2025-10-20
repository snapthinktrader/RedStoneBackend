const { TronWeb } = require('tronweb');

const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io'
});

const FUEL_WALLET = 'T9yPwwZiMbcLuhKWUtHwqLEoqqvm4S9mYJ';

async function analyzeFuelWalletTransactions() {
    console.log('\n💰 FUEL WALLET TRANSACTION ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Wallet:', FUEL_WALLET);
    console.log('═══════════════════════════════════════════════════════════\n');
    
    try {
        // Get transactions
        const response = await fetch(`https://api.trongrid.io/v1/accounts/${FUEL_WALLET}/transactions?limit=50`);
        const data = await response.json();
        
        const transactions = data.data || [];
        
        console.log(`Found ${transactions.length} recent transactions\n`);
        
        let totalSent = 0;
        let totalReceived = 0;
        
        console.log('📤 OUTGOING TRANSACTIONS (Sent):');
        console.log('─────────────────────────────────────────────────────────');
        
        transactions.forEach(tx => {
            if (tx.raw_data && tx.raw_data.contract && tx.raw_data.contract[0]) {
                const contract = tx.raw_data.contract[0];
                if (contract.type === 'TransferContract') {
                    const value = contract.parameter.value;
                    const fromAddress = tronWeb.address.fromHex(value.owner_address);
                    const toAddress = tronWeb.address.fromHex(value.to_address);
                    const amount = value.amount / 1000000;
                    const timestamp = new Date(tx.raw_data.timestamp);
                    
                    if (fromAddress === FUEL_WALLET) {
                        totalSent += amount;
                        console.log(`  ${timestamp.toISOString()}`);
                        console.log(`  To: ${toAddress}`);
                        console.log(`  Amount: ${amount.toFixed(6)} TRX`);
                        console.log(`  TX: ${tx.txID.substring(0, 20)}...`);
                        console.log('');
                    }
                }
            }
        });
        
        console.log(`  TOTAL SENT: ${totalSent.toFixed(6)} TRX\n`);
        
        console.log('📥 INCOMING TRANSACTIONS (Received):');
        console.log('─────────────────────────────────────────────────────────');
        
        transactions.forEach(tx => {
            if (tx.raw_data && tx.raw_data.contract && tx.raw_data.contract[0]) {
                const contract = tx.raw_data.contract[0];
                if (contract.type === 'TransferContract') {
                    const value = contract.parameter.value;
                    const fromAddress = tronWeb.address.fromHex(value.owner_address);
                    const toAddress = tronWeb.address.fromHex(value.to_address);
                    const amount = value.amount / 1000000;
                    const timestamp = new Date(tx.raw_data.timestamp);
                    
                    if (toAddress === FUEL_WALLET) {
                        totalReceived += amount;
                        console.log(`  ${timestamp.toISOString()}`);
                        console.log(`  From: ${fromAddress}`);
                        console.log(`  Amount: ${amount.toFixed(6)} TRX`);
                        console.log(`  TX: ${tx.txID.substring(0, 20)}...`);
                        console.log('');
                    }
                }
            }
        });
        
        console.log(`  TOTAL RECEIVED: ${totalReceived.toFixed(6)} TRX\n`);
        
        // Get current balance
        const balance = await tronWeb.trx.getBalance(FUEL_WALLET);
        const currentTrx = parseFloat(tronWeb.fromSun(balance));
        
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📊 SUMMARY');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`Total Sent:     ${totalSent.toFixed(6)} TRX`);
        console.log(`Total Received: ${totalReceived.toFixed(6)} TRX`);
        console.log(`Net Change:     ${(totalReceived - totalSent).toFixed(6)} TRX`);
        console.log(`Current Balance: ${currentTrx.toFixed(6)} TRX`);
        console.log('═══════════════════════════════════════════════════════════\n');
        
        // Identify the big transaction
        console.log('🔍 LARGEST TRANSACTIONS:');
        console.log('─────────────────────────────────────────────────────────');
        
        const allTransfers = [];
        transactions.forEach(tx => {
            if (tx.raw_data && tx.raw_data.contract && tx.raw_data.contract[0]) {
                const contract = tx.raw_data.contract[0];
                if (contract.type === 'TransferContract') {
                    const value = contract.parameter.value;
                    const fromAddress = tronWeb.address.fromHex(value.owner_address);
                    const toAddress = tronWeb.address.fromHex(value.to_address);
                    const amount = value.amount / 1000000;
                    const timestamp = new Date(tx.raw_data.timestamp);
                    
                    if (fromAddress === FUEL_WALLET) {
                        allTransfers.push({
                            type: 'SENT',
                            to: toAddress,
                            amount,
                            timestamp,
                            txid: tx.txID
                        });
                    }
                }
            }
        });
        
        allTransfers.sort((a, b) => b.amount - a.amount);
        
        allTransfers.slice(0, 5).forEach((tx, index) => {
            console.log(`${index + 1}. ${tx.amount.toFixed(6)} TRX`);
            console.log(`   Type: ${tx.type}`);
            console.log(`   To: ${tx.to}`);
            console.log(`   Time: ${tx.timestamp.toISOString()}`);
            console.log(`   TX: ${tx.txid.substring(0, 40)}...`);
            console.log('');
        });
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

analyzeFuelWalletTransactions();
