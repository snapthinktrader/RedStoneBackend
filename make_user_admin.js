require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

const MONGODB_URI = process.env.MONGODB_URI;

async function makeUserAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const email = 'snapthinktrader@gmail.com';
    
    console.log(`🔍 Finding user: ${email}`);
    const user = await User.findOne({ email });

    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }

    console.log('\n📊 Current User Status:');
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.firstName} ${user.lastName}`);
    console.log(`Current Role: ${user.role || 'user (default)'}`);
    console.log(`Is Admin: ${user.role === 'admin' ? 'YES ✅' : 'NO ❌'}`);

    // Set user as admin
    user.role = 'admin';
    await user.save();

    console.log('\n✅ User updated to ADMIN successfully!\n');
    console.log('📋 New User Status:');
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.firstName} ${user.lastName}`);
    console.log(`Role: ${user.role}`);
    console.log(`Is Admin: YES ✅`);

    console.log('\n🎉 You can now login to the admin panel with your regular credentials!');
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: (your regular password)`);
    console.log(`   URL: https://redstoneadmin.vercel.app/login`);

    await mongoose.disconnect();
    console.log('\n✅ Database disconnected');
    
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

makeUserAdmin();
