const mongoose = require('mongoose');
const logger = require('../utils/logger');

// MongoDB connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    
    // Connection events
    mongoose.connection.on('connected', () => {
      logger.info('Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Mongoose disconnected from MongoDB');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};

// Test the connection
const testConnection = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      logger.info('Database connection is active');
      return true;
    } else {
      throw new Error('Database connection is not active');
    }
  } catch (error) {
    logger.error('Database connection test failed:', error);
    throw error;
  }
};

module.exports = {
  connectDB,
  testConnection,
  mongoose,
};