const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { connectDB, testConnection } = require('./config/database');
const logger = require('./utils/logger');
const { initializeCronJobs } = require('./jobs/cronJobs');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const referralRoutes = require('./routes/referralRoutes');
const referralFingerprintRoutes = require('./routes/referral'); // Fingerprint-based referral matching
const paymentRoutes = require('./routes/payment');
const adminPaymentRoutes = require('./routes/adminPayment');
const adminAuthRoutes = require('./routes/adminAuth');
const adminRoutes = require('./routes/adminRoutes');
const appRoutes = require('./routes/appRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const chunkedUploadRoutes = require('./routes/chunkedUpload');
const apkManagementRoutes = require('./routes/apkManagement');
console.log('🟢 Chunked upload routes loaded in server.js');
const { router: autoSweepRoutes } = require('./routes/autoSweepSimple');
const CompleteAutoSweepService = require('./services/CompleteAutoSweepService');
const keepAliveService = require('./services/keepAliveService');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3001',
    'http://localhost:8080', // Flutter web dev server
    'http://localhost:3000', // Alternative frontend port
    'https://redstoneadmin.vercel.app', // Admin panel
    'https://redstoneadmin.vercel.app/', // Admin panel with trailing slash
    'https://www.redstonne.com', // New production domain
    'https://redstonne.com', // Production domain without www
    '*', // Allow all origins for development - remove in production
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(limiter);
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth/admin', adminAuthRoutes); // Admin authentication (no auth required) - MUST be before /api/admin
app.use('/api/users', userRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/referral', referralRoutes); // Existing referral endpoints
app.use('/api/referral', referralFingerprintRoutes); // Fingerprint matching endpoints
app.use('/api/payment', paymentRoutes);
app.use('/api/admin/payment', adminPaymentRoutes);
app.use('/api/admin/settings', require('./routes/adminSettings'));
app.use('/api/admin/auto-sweep', autoSweepRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/app', appRoutes); // App version management (public + admin)
app.use('/api/upload', uploadRoutes); // File upload (admin only)
app.use('/api/chunked-upload', chunkedUploadRoutes); // Chunked file upload
app.use('/api/apk-management', apkManagementRoutes); // APK version management
app.use('/api/download', uploadRoutes); // File download (public)

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Global error handler:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // Don't expose stack trace in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(isDevelopment && { stack: err.stack }),
  });
});

// Database connection and server startup
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    logger.info('Database connection has been established successfully.');

    // Test database connection
    await testConnection();

    // Initialize cron jobs
    initializeCronJobs();
    logger.info('Cron jobs initialized successfully.');

    // Initialize Complete Auto-Sweep Service
    const completeAutoSweepService = new CompleteAutoSweepService();
    if (process.env.AUTO_SWEEP_ENABLED === 'true') {
      completeAutoSweepService.start();
      logger.info('🔄 Complete Auto-sweep service started successfully.');
    } else {
      logger.info('⏸️ Auto-sweep service is disabled.');
    }

    // Start Keep-Alive Service (prevents Render free tier from sleeping)
    if (process.env.NODE_ENV === 'production') {
      keepAliveService.start();
    } else {
      logger.info('⏸️ Keep-alive service disabled in development');
    }

    // Start server
    app.listen(PORT, () => {
      logger.info(`🚀 RedStone Backend Server is running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
      logger.info(`🔄 Auto-sweep: ${process.env.AUTO_SWEEP_ENABLED === 'true' ? 'RUNNING' : 'STOPPED'}`);
      logger.info(`⛽ Fuel Wallet: ${process.env.FUEL_WALLET_ADDRESS || 'Not configured'}`);
      logger.info(`🏦 Main Wallet: ${process.env.MAINNET_OWNER_WALLET || 'Not configured'}`);
    });
  } catch (error) {
    logger.error('Unable to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  keepAliveService.stop();
  const { mongoose } = require('./config/database');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  keepAliveService.stop();
  const { mongoose } = require('./config/database');
  await mongoose.connection.close();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer();

module.exports = app;