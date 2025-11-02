const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const user = await User.findOne({ email: { $regex: /^spooky/i } });
    
    if (user) {
      console.log('Found user:');
      console.log('Email:', user.email);
      console.log('Username:', user.username);
      console.log('Has password:', !!user.password);
    } else {
      console.log('No user found starting with "spooky"');
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
})();
