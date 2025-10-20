const express = require('express');
const cors = require('cors');
const { connectDB } = require('../src/config/database');
const authRoutes = require('../src/routes/authRoutes');
const adminAuthRoutes = require('../src/routes/adminAuth');
const userRoutes = require('../src/routes/userRoutes');
const transactionRoutes = require('../src/routes/transactionRoutes');
const referralRoutes = require('../src/routes/referralRoutes');
const referralFingerprintRoutes = require('../src/routes/referral'); // Fingerprint-based referral
const paymentRoutes = require('../src/routes/payment');
const adminRoutes = require('../src/routes/adminRoutes');
const adminPaymentRoutes = require('../src/routes/adminPayment');
const adminSettingsRoutes = require('../src/routes/adminSettings');
const appRoutes = require('../src/routes/appRoutes'); // App version management
const uploadRoutes = require('../src/routes/uploadRoutes'); // File upload
const chunkedUploadRoutes = require('../src/routes/chunkedUpload'); // Chunked file upload
const apkManagementRoutes = require('../src/routes/apkManagement'); // APK version management
console.log('🟢 chunkedUploadRoutes type:', typeof chunkedUploadRoutes);
console.log('🟢 chunkedUploadRoutes is Router?', chunkedUploadRoutes && chunkedUploadRoutes.stack);
const CompleteAutoSweepService = require('../src/services/CompleteAutoSweepService');
const { initializeCronJobs } = require('../src/jobs/cronJobs');

// Initialize Express app
const app = express();

// Initialize Auto-Sweep Service
let autoSweepService = null;

// Initialize auto-sweep service after database connection
const initializeAutoSweep = () => {
  try {
    // Disable auto-sweep in Vercel serverless environment
    if (process.env.VERCEL === '1') {
      console.log('⏸️ Auto-sweep service disabled in Vercel serverless environment.');
      return;
    }
    
    if (process.env.AUTO_SWEEP_ENABLED === 'true') {
      autoSweepService = new CompleteAutoSweepService();
      autoSweepService.start();
      console.log('🔄 Complete Auto-sweep service started successfully for Vercel deployment.');
    } else {
      console.log('⏸️ Auto-sweep service is disabled in Vercel deployment.');
    }
  } catch (error) {
    console.error('❌ Failed to initialize auto-sweep service:', error.message);
  }
};

// CORS configuration - Allow all origins for now
app.use(cors({
  origin: '*', // Allow all origins
  credentials: false, // Set to false when using wildcard origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Connect to MongoDB and initialize auto-sweep
connectDB().then(() => {
  console.log('✅ Database connected in Vercel deployment');
  
  // Disable background processes in Vercel serverless environment
  if (process.env.VERCEL !== '1') {
    initializeAutoSweep();
    // Initialize cron jobs for daily earnings, cleanup, etc.
    initializeCronJobs();
    console.log('✅ Cron jobs initialized (Daily Earnings at 3:00 AM UTC)');
  } else {
    console.log('⏸️ Background processes disabled in Vercel serverless environment');
  }
}).catch(error => {
  console.error('❌ Database connection failed in Vercel:', error);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth/admin', adminAuthRoutes); // Admin authentication (no auth required) - MUST be before /api/admin
app.use('/api/users', userRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/referral', referralRoutes); // Existing referral endpoints
app.use('/api/referral', referralFingerprintRoutes); // Fingerprint matching endpoints
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/payment', adminPaymentRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/app', appRoutes); // App version management (public + admin)
app.use('/api/upload', uploadRoutes); // File upload (admin only)
console.log('🟢 Registering chunked-upload routes at /api/chunked-upload');
app.use('/api/chunked-upload', chunkedUploadRoutes); // Chunked file upload
console.log('🟢 Chunked-upload routes registered successfully');
app.use('/api/apk-management', apkManagementRoutes); // APK version management
app.use('/api/download', uploadRoutes); // File download (public)

// Health check route
app.get('/api/health', (req, res) => {
  const autoSweepStatus = autoSweepService ? 'RUNNING' : 'STOPPED';
  res.status(200).json({ 
    message: 'RedStone API is running with Enhanced Auto-Sweep',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    autoSweep: autoSweepStatus,
    fuelWallet: process.env.FUEL_WALLET_ADDRESS || 'Not configured',
    mainWallet: process.env.MAINNET_OWNER_WALLET || 'Not configured',
    network: process.env.TRON_NETWORK || 'mainnet'
  });
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.originalUrl 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Export for Vercel
module.exports = app;