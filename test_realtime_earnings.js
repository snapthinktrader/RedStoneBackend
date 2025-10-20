require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

async function testRealTimeEarnings() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to database\n');
        
        const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
        
        if (!user) {
            console.log('❌ User not found');
            process.exit(1);
        }
        
        const earnings = user.calculateRealTimeEarnings();
        
        console.log('📊 Real-Time Earnings Test');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('User:', user.email);
        console.log('');
        console.log('💰 Balance Information:');
        console.log('   Stored Balance:      $' + user.walletBalance.toFixed(2));
        console.log('   Real-Time Balance:   $' + earnings.calculatedBalance.toFixed(6));
        console.log('   Pending Earnings:    $' + earnings.pendingEarnings.toFixed(6));
        console.log('');
        console.log('⏱️  Time Information:');
        console.log('   Last Update:        ', earnings.lastUpdate);
        console.log('   Current Time:       ', earnings.currentTime);
        console.log('   Elapsed Time:       ', earnings.elapsedSeconds, 'seconds');
        console.log('   Elapsed Time:       ', (earnings.elapsedSeconds / 3600).toFixed(2), 'hours');
        console.log('');
        console.log('📈 Earning Rates:');
        console.log('   Daily Rate:          ' + (earnings.dailyRate * 100) + '%');
        console.log('   Per Second Rate:     ' + (earnings.ratePerSecond * 100).toFixed(9) + '%');
        console.log('');
        console.log('💡 Expected Earnings:');
        console.log('   Per Day:            $' + (user.walletBalance * earnings.dailyRate).toFixed(2));
        console.log('   Per Hour:           $' + (user.walletBalance * earnings.dailyRate / 24).toFixed(4));
        console.log('   Per Minute:         $' + (user.walletBalance * earnings.dailyRate / 1440).toFixed(6));
        console.log('   Per Second:         $' + (user.walletBalance * earnings.ratePerSecond).toFixed(8));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testRealTimeEarnings();
