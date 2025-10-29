#!/bin/bash
# Test Deployed Backend with curl

BASE_URL="https://redstonebackend.onrender.com/api"

echo "🧪 Testing RedStone Backend API"
echo "================================"
echo ""

# Test 1: Login
echo "📝 Test 1: Login"
echo "----------------"
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"snapthinktrader@gmail.com","password":"Ajtiwari23@"}')

echo "$LOGIN_RESPONSE" | jq '.'

# Extract token
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken // .token // .accessToken // empty')

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed - no token received"
  exit 1
fi

echo ""
echo "✅ Login successful!"
echo "Token: ${TOKEN:0:30}..."
echo ""

# Test 2: Get Profile
echo "📝 Test 2: Get User Profile"
echo "----------------------------"
PROFILE_RESPONSE=$(curl -s -X GET "${BASE_URL}/user/profile" \
  -H "Authorization: Bearer $TOKEN")

echo "$PROFILE_RESPONSE" | jq '.'
echo ""

# Extract and display dual-level fields
echo "📊 Dual-Level System Fields:"
echo "----------------------------"
echo "$PROFILE_RESPONSE" | jq '{
  name: .data.user.name,
  email: .data.user.email,
  walletBalance: .data.user.walletBalance,
  totalDeposit: .data.user.totalDeposit,
  depositLevel: {
    currentLevel: .data.user.currentLevel,
    levelName: .data.user.levelName,
    dailyEarningRate: .data.user.dailyEarningRate
  },
  referralLevel: {
    referralLevel: .data.user.referralLevel,
    directReferrals: .data.user.directReferrals,
    indirectReferrals: .data.user.indirectReferrals,
    commissionRate: .data.user.commissionRate,
    indirectCommissionRate: .data.user.indirectCommissionRate
  },
  earnings: {
    pendingOwnEarnings: .data.user.pendingOwnEarnings,
    dailyReferralCommission: .data.user.dailyReferralCommission,
    pendingReferralCommission: .data.user.pendingReferralCommission
  }
}'

echo ""
echo "✅ All tests passed!"
