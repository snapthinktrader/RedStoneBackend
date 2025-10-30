const mongoose = require('mongoose');
require('dotenv').config();

async function cleanupOldAPKs() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Find the active APK from the old collection
    const activeAPK = await db.collection('apkmanagement').findOne({ isActive: true });
    
    if (!activeAPK) {
      console.log('❌ No active APK found!');
      await mongoose.disconnect();
      return;
    }
    
    console.log('=== Active APK (Will Keep) ===');
    console.log(`Version: ${activeAPK.version}`);
    console.log(`File ID: ${activeAPK.fileId}`);
    console.log(`Uploaded: ${activeAPK.createdAt}\n`);
    
    const activeFileId = new mongoose.Types.ObjectId(activeAPK.fileId);
    
    // Get all APK files
    const allFiles = await db.collection('apk_files.files').find({}).toArray();
    const filesToDelete = allFiles.filter(file => !file._id.equals(activeFileId));
    
    console.log('=== APK Files to Delete ===');
    let totalSizeToFree = 0;
    const fileIdsToDelete = [];
    
    for (const file of filesToDelete) {
      console.log(`${file.filename}`);
      console.log(`  ID: ${file._id}`);
      console.log(`  Size: ${(file.length / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Upload Date: ${file.uploadDate}`);
      totalSizeToFree += file.length;
      fileIdsToDelete.push(file._id);
    }
    
    console.log(`\nTotal files to delete: ${filesToDelete.length}`);
    console.log(`Space to free: ${(totalSizeToFree / 1024 / 1024).toFixed(2)} MB\n`);
    
    if (filesToDelete.length === 0) {
      console.log('✅ No old APKs to delete. Database is clean!');
      await mongoose.disconnect();
      return;
    }
    
    // Start deletion
    console.log('Starting cleanup...\n');
    
    // 1. Delete chunks from GridFS
    console.log('Step 1: Deleting APK file chunks...');
    const chunksResult = await db.collection('apk_files.chunks').deleteMany({
      files_id: { $in: fileIdsToDelete }
    });
    console.log(`  ✅ Deleted ${chunksResult.deletedCount} chunks\n`);
    
    // 2. Delete file records from GridFS
    console.log('Step 2: Deleting APK file records...');
    const filesResult = await db.collection('apk_files.files').deleteMany({
      _id: { $in: fileIdsToDelete }
    });
    console.log(`  ✅ Deleted ${filesResult.deletedCount} file records\n`);
    
    // 3. Delete inactive APK management records from old collection
    console.log('Step 3: Deleting inactive APK management records...');
    const oldManagementResult = await db.collection('apkmanagement').deleteMany({
      isActive: { $ne: true }
    });
    console.log(`  ✅ Deleted ${oldManagementResult.deletedCount} old management records\n`);
    
    // 4. Clean up the new apkmanagements collection (keep it clean)
    console.log('Step 4: Cleaning up new apkmanagements collection...');
    const newManagementResult = await db.collection('apkmanagements').deleteMany({});
    console.log(`  ✅ Deleted ${newManagementResult.deletedCount} records\n`);
    
    // 5. Clean up completed upload chunks
    console.log('Step 5: Cleaning up completed upload chunks...');
    const uploadChunksResult = await db.collection('uploadchunks').deleteMany({
      status: 'completed'
    });
    console.log(`  ✅ Deleted ${uploadChunksResult.deletedCount} completed upload chunks\n`);
    
    // Get updated stats
    console.log('=== Updated Database Statistics ===');
    const stats = await db.stats();
    const totalSize = (stats.dataSize + stats.indexSize) / 1024 / 1024;
    const usedPercentage = (totalSize / 512 * 100).toFixed(2);
    const remaining = 512 - totalSize;
    
    console.log(`Total Size: ${totalSize.toFixed(2)} MB`);
    console.log(`Free Tier Used: ${usedPercentage}%`);
    console.log(`Remaining: ${remaining.toFixed(2)} MB`);
    
    console.log('\n✅ Cleanup completed successfully!');
    console.log(`Estimated space freed: ${(totalSizeToFree / 1024 / 1024).toFixed(2)} MB`);
    console.log(`\n💡 Note: MongoDB may take a few minutes to reclaim the actual disk space.\n`);
    
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

cleanupOldAPKs();
