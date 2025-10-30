const mongoose = require('mongoose');
require('dotenv').config();

async function checkDBStats() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const stats = await db.stats();
    
    console.log('\n=== MongoDB Database Statistics ===\n');
    console.log(`Database: ${stats.db}`);
    console.log(`Collections: ${stats.collections}`);
    console.log(`Objects: ${stats.objects.toLocaleString()}`);
    console.log(`\nStorage (MB):`);
    console.log(`  Data Size: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Storage Size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Index Size: ${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Total Size: ${((stats.dataSize + stats.indexSize) / 1024 / 1024).toFixed(2)} MB`);
    
    if (stats.freeStorageSize) {
      console.log(`  Free Storage: ${(stats.freeStorageSize / 1024 / 1024).toFixed(2)} MB`);
    }
    
    console.log(`\nAverage Object Size: ${(stats.avgObjSize / 1024).toFixed(2)} KB`);
    console.log(`Indexes: ${stats.indexes}`);
    
    // Get collection details
    console.log('\n=== Collection Details ===\n');
    const collections = await db.listCollections().toArray();
    
    for (const coll of collections) {
      const collStats = await db.collection(coll.name).stats();
      console.log(`${coll.name}:`);
      console.log(`  Documents: ${collStats.count.toLocaleString()}`);
      console.log(`  Size: ${(collStats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Storage: ${(collStats.storageSize / 1024 / 1024).toFixed(2)} MB`);
    }
    
    // MongoDB Atlas Free Tier info
    console.log('\n=== MongoDB Atlas Free Tier Info ===');
    console.log('Free Tier Limit: 512 MB');
    const usedPercentage = ((stats.dataSize + stats.indexSize) / (512 * 1024 * 1024) * 100).toFixed(2);
    console.log(`Used: ${usedPercentage}%`);
    console.log(`Remaining: ${(512 - (stats.dataSize + stats.indexSize) / 1024 / 1024).toFixed(2)} MB`);
    
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkDBStats();
