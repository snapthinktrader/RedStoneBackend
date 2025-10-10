#!/bin/bash

# RedStone Backend API Endpoint Testing Script
BASE_URL="https://redstonebackend-2q6ht34pu-snaps-projects-656f28bb.vercel.app"

echo "🔍 Testing RedStone Backend Endpoints"
echo "=========================================="

# Health Check
echo "✅ Testing Health Check:"
curl -s "$BASE_URL/api/health" | jq -r '.message // "❌ FAILED"'

echo ""
echo "🔐 Testing Auth Endpoints:"
echo "  POST /api/auth/register: $(curl -s "$BASE_URL/api/auth/register" -X POST -H "Content-Type: application/json" -d '{}' | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end' | head -1)"
echo "  POST /api/auth/login: $(curl -s "$BASE_URL/api/auth/login" -X POST -H "Content-Type: application/json" -d '{}' | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end' | head -1)"
echo "  POST /api/auth/refresh: $(curl -s "$BASE_URL/api/auth/refresh" -X POST | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"
echo "  POST /api/auth/logout: $(curl -s "$BASE_URL/api/auth/logout" -X POST | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"

echo ""
echo "👤 Testing User Endpoints:"
echo "  GET /api/user/profile: $(curl -s "$BASE_URL/api/user/profile" | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"
echo "  GET /api/user/dashboard: $(curl -s "$BASE_URL/api/user/dashboard" | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"
echo "  GET /api/user/stats: $(curl -s "$BASE_URL/api/user/stats" | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"

echo ""
echo "💰 Testing Payment Endpoints:"
echo "  POST /api/payment/deposits: $(curl -s "$BASE_URL/api/payment/deposits" -X POST | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"
echo "  GET /api/payment/deposits: $(curl -s "$BASE_URL/api/payment/deposits" | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"
echo "  POST /api/payment/withdrawals: $(curl -s "$BASE_URL/api/payment/withdrawals" -X POST | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"
echo "  GET /api/payment/withdrawals: $(curl -s "$BASE_URL/api/payment/withdrawals" | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"

echo ""
echo "🏦 Testing Admin Endpoints:"
echo "  GET /api/admin/users: $(curl -s "$BASE_URL/api/admin/users" | jq -r 'if type == "object" and .success then "✅ Working" elif .message then "✅ " + .message else "❌ Route not found" end')"
echo "  GET /api/admin/stats: $(curl -s "$BASE_URL/api/admin/stats" | jq -r 'if .success then "✅ Working" elif .message then "✅ " + .message else "❌ Route not found" end')"

echo ""
echo "🏦💰 Testing Admin Payment Endpoints:"
echo "  GET /api/admin/payment/withdrawals: $(curl -s "$BASE_URL/api/admin/payment/withdrawals" | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"
echo "  GET /api/admin/payment/deposits/summary: $(curl -s "$BASE_URL/api/admin/payment/deposits/summary" | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"

echo ""
echo "👥 Testing Referral Endpoints:"
echo "  GET /api/referral/: $(curl -s "$BASE_URL/api/referral/" | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"
echo "  GET /api/referral/stats: $(curl -s "$BASE_URL/api/referral/stats" | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"

echo ""
echo "📊 Testing Transaction Endpoints:"
echo "  GET /api/transaction/: $(curl -s "$BASE_URL/api/transaction/" | jq -r 'if .message then "✅ " + .message else "❌ Route not found" end')"

echo ""
echo "🔍 Testing 404 Handler:"
echo "  GET /api/nonexistent: $(curl -s "$BASE_URL/api/nonexistent" | jq -r 'if .message then "✅ " + .message else "❌ No 404 handler" end')"

echo ""
echo "=========================================="
echo "🎉 All endpoint testing complete!"
echo "🔗 Production API Base URL: $BASE_URL"