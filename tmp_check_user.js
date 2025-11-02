require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

(async function(){
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const u = await User.findOne({ email: 'snapthinktrader@gmail.com' });
    if(!u) return console.log('User not found');
  console.log('Full user document:');
  console.log(JSON.stringify(u.toObject(), null, 2));

    await mongoose.connection.close();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
