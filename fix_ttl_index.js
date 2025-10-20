require('dotenv').config();
const mongoose = require('mongoose');

async function fixTTLIndex() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const collection = db.collection('uploadsessions');
    
    // Get all indexes
    console.log('\n📋 Current indexes:');
    const indexes = await collection.indexes();
    indexes.forEach(idx => {
      console.log(JSON.stringify(idx, null, 2));
    });
    
    // Drop the bad TTL index if it exists
    console.log('\n🗑️  Dropping expiresAt index...');
    try {
      await collection.dropIndex('expiresAt_1');
      console.log('✅ Dropped expiresAt_1 index');
    } catch (err) {
      console.log('ℹ️  Index might not exist:', err.message);
    }
    
    // Create correct TTL index (expires after 3600 seconds = 1 hour)
    console.log('\n🔨 Creating new TTL index...');
    await collection.createIndex(
      { expiresAt: 1 }, 
      { expireAfterSeconds: 3600 }
    );
    console.log('✅ Created TTL index with 1 hour expiration');
    
    // Show updated indexes
    console.log('\n📋 Updated indexes:');
    const newIndexes = await collection.indexes();
    newIndexes.forEach(idx => {
      console.log(JSON.stringify(idx, null, 2));
    });
    
    // Check existing sessions
    console.log('\n📊 Existing upload sessions:');
    const sessions = await collection.find({}).toArray();
    console.log(`Found ${sessions.length} sessions`);
    sessions.forEach(s => {
      console.log(`  - ${s.uploadId}: ${s.status} (${s.filename})`);
    });
    
    await mongoose.disconnect();
    console.log('\n✅ Done');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixTTLIndex();
