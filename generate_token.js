const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User');
const jwt = require('jsonwebtoken');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    // Generate a token directly
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log('Token for spookymoments62:');
    console.log(token);
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
})();
