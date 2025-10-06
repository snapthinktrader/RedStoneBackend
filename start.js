#!/usr/bin/env node

/**
 * RedStone Backend Startup Script
 * This script helps set up and run the RedStone backend server
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting RedStone Backend Server...\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log('⚠️  .env file not found. Creating from template...');
  const envExamplePath = path.join(__dirname, '.env.example');
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✅ .env file created from .env.example');
    console.log('📝 Please update the .env file with your actual values before starting the server.\n');
  } else {
    console.log('❌ .env.example file not found. Please create a .env file manually.\n');
    process.exit(1);
  }
}

// Check if node_modules exists
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.log('📦 Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: __dirname });
    console.log('✅ Dependencies installed successfully\n');
  } catch (error) {
    console.error('❌ Failed to install dependencies:', error.message);
    process.exit(1);
  }
}

// Check MongoDB connection string
require('dotenv').config();
if (!process.env.MONGODB_URI) {
  console.log('❌ MONGODB_URI not found in .env file');
  console.log('Please add your MongoDB connection string to the .env file:\n');
  console.log('MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database\n');
  process.exit(1);
}

console.log('📋 Environment Configuration:');
console.log(`   • Node Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`   • Port: ${process.env.PORT || 3000}`);
console.log(`   • Database: MongoDB`);
console.log(`   • Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3001'}`);
console.log('');

// Start the server
console.log('🎯 Starting server...\n');
try {
  require('./src/server');
} catch (error) {
  console.error('❌ Failed to start server:', error.message);
  process.exit(1);
}