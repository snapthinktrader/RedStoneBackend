#!/bin/bash

echo "🚀 Starting RedStone Backend Server..."
echo "======================================="

# Set PATH to include Node.js
export PATH=$PATH:/usr/local/bin

# Navigate to backend directory
cd /Users/mahendrabahubali/Desktop/RedStone/redstone_flutter_app/backend

# Check Node.js version
echo "📍 Node.js version: $(node --version)"
echo "📍 NPM version: $(npm --version)"
echo ""

# Install dependencies if needed
echo "📦 Checking dependencies..."
npm list bcryptjs > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ bcryptjs is installed"
else
    echo "❌ bcryptjs not found, installing..."
    npm install bcryptjs
fi

echo ""
echo "🔥 Starting server..."
echo ""

# Start the server
node src/server.js