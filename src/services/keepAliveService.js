const axios = require('axios');
const logger = require('../utils/logger');

class KeepAliveService {
  constructor() {
    this.interval = null;
    this.pingInterval = 12 * 60 * 1000; // 12 minutes in milliseconds
    this.baseUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:10000';
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      logger.warn('⚠️ Keep-alive service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('🔔 Keep-alive service starting...');
    logger.info(`📡 Ping interval: ${this.pingInterval / 1000 / 60} minutes`);
    logger.info(`🎯 Target URL: ${this.baseUrl}/health`);

    // Start pinging
    this.interval = setInterval(() => {
      this.ping();
    }, this.pingInterval);

    // Do an initial ping after 1 minute
    setTimeout(() => {
      this.ping();
    }, 60000);

    logger.info('✅ Keep-alive service started successfully');
  }

  async ping() {
    try {
      const startTime = Date.now();
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'RedStone-KeepAlive/1.0'
        }
      });

      const duration = Date.now() - startTime;
      
      if (response.status === 200) {
        logger.info(`💚 Keep-alive ping successful (${duration}ms)`);
      } else {
        logger.warn(`⚠️ Keep-alive ping returned status ${response.status}`);
      }
    } catch (error) {
      logger.error('❌ Keep-alive ping failed:', {
        message: error.message,
        code: error.code,
        url: `${this.baseUrl}/health`
      });
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isRunning = false;
      logger.info('🛑 Keep-alive service stopped');
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      pingInterval: `${this.pingInterval / 1000 / 60} minutes`,
      targetUrl: `${this.baseUrl}/health`
    };
  }
}

// Create singleton instance
const keepAliveService = new KeepAliveService();

module.exports = keepAliveService;
