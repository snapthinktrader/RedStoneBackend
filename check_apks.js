const mongoose = require('mongoose');
require('dotenv').config();

async function checkAPKs() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Check apkmanagements collection
    console.log('=== APK Management Records ===');
    const apkManagements = await db.collection('apkmanagements').find({}).toArray();
    console.log(`Total records: ${apkManagements.length}\n`);
    
    apkManagements.forEach((apk, index) => {
      console.log(`APK ${index + 1}:`);
      console.log(`  ID: ${apk._id}`);
      console.log(`  Version: ${apk.version}`);
      console.log(`  File ID: ${apk.fileId}`);
      console.log(`  Is Active: ${apk.isActive}`);
      console.log(`  Size: ${apk.fileSize ? (apk.fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}`);
      console.log(`  Uploaded: ${apk.uploadedAt}`);
      console.log('');
    });
    
    // Check old apkmanagement collection (without 's')
    console.log('=== Old APK Management Collection ===');
    const oldAPKs = await db.collection('apkmanagement').find({}).toArray();
    console.log(`Total records: ${oldAPKs.length}\n`);
    
    oldAPKs.forEach((apk, index) => {
      console.log(`Old APK ${index + 1}:`);
      console.log(`  ID: ${apk._id}`);
      console.log(`  Version: ${apk.version}`);
      console.log(`  File ID: ${apk.fileId}`);
      console.log(`  Is Active: ${apk.isActive}`);
      console.log(`  Downloaded: ${apk.downloadCount || 0} times`);
      console.log(`  Uploaded: ${apk.createdAt}`);
      console.log('');
    });
    
    // Check GridFS files
    console.log('=== GridFS APK Files ===');
    const files = await db.collection('apk_files.files').find({}).toArray();
    console.log(`Total files: ${files.length}\n`);
    
    files.forEach((file, index) => {
      console.log(`File ${index + 1}:`);
      console.log(`  ID: ${file._id}`);
      console.log(`  Filename: ${file.filename}`);
      console.log(`  Size: ${(file.length / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Upload Date: ${file.uploadDate}`);
      console.log('');
    });
    
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkAPKs();
