const express = require('express');
const chunkedUploadRoutes = require('./src/routes/chunkedUpload');

const app = express();
app.use(express.json());

console.log('chunkedUploadRoutes type:', typeof chunkedUploadRoutes);
console.log('Has stack?', !!chunkedUploadRoutes.stack);
console.log('Stack length:', chunkedUploadRoutes.stack ? chunkedUploadRoutes.stack.length : 0);

app.use('/api/chunked-upload', chunkedUploadRoutes);

// List all registered routes
console.log('\nRegistered routes:');
app._router.stack.forEach((r) => {
  if (r.route) {
    console.log(`  ${Object.keys(r.route.methods)} ${r.route.path}`);
  } else if (r.name === 'router') {
    console.log(`  Router middleware at: ${r.regexp}`);
    if (r.handle.stack) {
      r.handle.stack.forEach((route) => {
        if (route.route) {
          console.log(`    ${Object.keys(route.route.methods)} ${route.route.path}`);
        }
      });
    }
  }
});

app.listen(4000, () => {
  console.log('\nTest server running on port 4000');
  console.log('Try: curl -X POST http://localhost:4000/api/chunked-upload/init -H "Content-Type: application/json" -d \'{"filename":"test.apk","totalChunks":2,"fileSize":2097152}\'');
});
