require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');

mongoose.connect(process.env.MONGODB_URI);

async function testSpooky() {
  try {
    const email = 'spookymoments62@gmail.com';
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found:', email);
      return;
    }
    const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

    console.log('\n=== PROFILE ===');
    console.log('Email:', user.email);
    console.log('Stored walletBalance:', user.walletBalance);
    console.log('Stored lifetimeReferralEarnings:', user.lifetimeReferralEarnings);
    console.log('Stored pendingCommission:', user.pendingCommission);

    // Call profile endpoint
    const profileResp = await axios.get('https://redstonebackend.onrender.com/api/users/profile', { headers: { Authorization: `Bearer ${token}` } });
    console.log('\nAPI /api/users/profile success:', profileResp.data.success);
    const u = profileResp.data.data.user;
    console.log('walletBalance:', u.walletBalance);
    console.log('storedBalance:', u.storedBalance);
    console.log('pendingOwnEarnings:', u.pendingOwnEarnings);
    console.log('pendingReferralCommission:', u.pendingReferralCommission);

    // Try to fetch recent transactions (common route)
    console.log('\n=== Recent transactions (attempt) ===');
    try {
      const txResp = await axios.get('https://redstonebackend.onrender.com/api/transactions/user-transactions?page=1&limit=10', { headers: { Authorization: `Bearer ${token}` } });
      if (txResp.data && txResp.data.data && Array.isArray(txResp.data.data.transactions)) {
        console.log('Returned', txResp.data.data.transactions.length, 'transactions:');
        txResp.data.data.transactions.forEach(tx => {
          console.log(`- ${tx.type} | ${tx.status} | $${tx.amount} | ${tx.createdAt}`);
        });
      } else {
        console.log('No transactions array returned, response keys:', Object.keys(txResp.data));
      }
    } catch (err) {
      console.log('Could not fetch transactions route (may differ). Error:', err.response ? err.response.data : err.message);
    }

  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testSpooky();
