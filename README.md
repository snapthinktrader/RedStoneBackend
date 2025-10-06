# RedStone Backend API

## Overview
RedStone is a comprehensive crypto investment platform with MLM (Multi-Level Marketing) features, daily compounding returns, and referral rewards system.

## Features

### 🔐 Authentication System
- User registration with email verification
- JWT-based authentication with refresh tokens
- Password reset functionality
- Two-factor authentication ready

### 💰 Financial System
- Daily 2% compounding returns
- Multi-level referral commissions
- Secure deposit and withdrawal system
- Transaction history and analytics

### 🤝 Referral System
- Unique referral codes for each user
- Multi-level commission structure
- Milestone bonuses
- Referral tree visualization

### 👥 User Management
- User levels (Bronze, Silver, Gold, Platinum, Diamond)
- Profile management
- KYC verification ready

### 📊 Analytics & Reporting
- Real-time transaction tracking
- User statistics
- Admin dashboard metrics
- Financial reports

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT, bcryptjs
- **Validation**: Joi, express-validator
- **Email**: Nodemailer
- **File Upload**: Multer, Cloudinary
- **Logging**: Winston
- **Cron Jobs**: node-cron
- **Security**: Helmet, CORS, Rate Limiting

## API Endpoints

### Authentication (`/api/auth`)
- `POST /register` - Register new user
- `POST /login` - User login
- `POST /refresh` - Refresh access token
- `POST /logout` - User logout
- `POST /verify-email` - Verify email address
- `POST /resend-verification` - Resend verification email
- `POST /forgot-password` - Request password reset
- `POST /reset-password` - Reset password
- `GET /me` - Get current user

### Users (`/api/users`)
- `GET /profile` - Get user profile
- `PUT /profile` - Update user profile
- `POST /change-password` - Change password
- `GET /stats` - Get user statistics
- `POST /upload-avatar` - Upload profile picture

### Transactions (`/api/transactions`)
- `GET /` - Get user transactions
- `GET /stats` - Get transaction statistics
- `GET /:id` - Get specific transaction
- `GET /admin/all` - Get all transactions (Admin)
- `GET /admin/stats` - Get admin statistics
- `PUT /admin/:id/status` - Update transaction status (Admin)

### Payments (`/api/payments`)
- `POST /deposit` - Create deposit request
- `POST /withdraw` - Create withdrawal request
- `GET /methods` - Get payment methods
- `GET /deposits` - Get user deposits
- `GET /withdrawals` - Get user withdrawals

### Referrals (`/api/referrals`)
- `GET /` - Get user referrals
- `GET /stats` - Get referral statistics
- `GET /tree` - Get referral tree
- `GET /commissions` - Get commission history

## Database Models

### User Model
```javascript
{
  name: String,
  email: String (unique),
  password: String (hashed),
  referralCode: String (unique),
  referredBy: ObjectId,
  walletBalance: Number,
  totalDeposit: Number,
  currentLevel: Number,
  isVerified: Boolean,
  isActive: Boolean,
  twoFactorEnabled: Boolean,
  // ... more fields
}
```

### Transaction Model
```javascript
{
  userId: ObjectId,
  type: Enum (DEPOSIT, WITHDRAWAL, DAILY_EARNING, REFERRAL_COMMISSION, MILESTONE_BONUS),
  amount: Number,
  status: Enum (PENDING, COMPLETED, FAILED, CANCELLED),
  description: String,
  hash: String,
  address: String,
  paymentMethod: String,
  // ... more fields
}
```

## Business Logic

### Daily Earnings
- Automated daily 2% returns on wallet balance
- Runs daily at 3:00 AM UTC via cron job
- Creates transaction records for transparency

### Referral Commissions
- Level 1 (Direct): 5-20% based on referrer's level
- Level 2 (Indirect): 30% of Level 1 commission
- Calculated on successful deposits

### User Levels
- Bronze (Level 1): $0 - $499 deposit
- Silver (Level 2): $500 - $1,999 deposit  
- Gold (Level 3): $2,000 - $4,999 deposit
- Platinum (Level 4): $5,000 - $9,999 deposit
- Diamond (Level 5): $10,000+ deposit

### Milestone Bonuses
- 10 referrals: $100 bonus
- 25 referrals: $300 bonus
- 50 referrals: $750 bonus
- 100 referrals: $2,000 bonus
- 200 referrals: $5,000 bonus

## Security Features

- JWT authentication with refresh tokens
- Password hashing with bcrypt
- Rate limiting on API endpoints
- Input validation and sanitization
- CORS protection
- Helmet for security headers
- Database query protection

## Environment Configuration

Create a `.env` file with:

```env
# Database
MONGO_URI=mongodb://localhost:27017/redstone_db

# JWT
JWT_SECRET=your_secret_key
JWT_REFRESH_SECRET=your_refresh_secret

# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Business Logic
DAILY_EARNING_RATE=0.02
MINIMUM_DEPOSIT=50
MINIMUM_WITHDRAWAL=20
```

## Installation & Setup

1. **Clone and Install**
```bash
git clone <repository>
cd redstone_flutter_app/backend
npm install
```

2. **Environment Setup**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Database Setup**
```bash
# Make sure MongoDB is running
mongod
```

4. **Start Development Server**
```bash
npm run dev
```

5. **Start Production Server**
```bash
npm start
```

## API Testing

The backend includes comprehensive API endpoints that can be tested with tools like Postman or curl. All endpoints return JSON responses with the following structure:

```javascript
{
  "success": true/false,
  "message": "Response message",
  "data": { /* Response data */ },
  "errors": [ /* Validation errors if any */ ]
}
```

## Cron Jobs

### Daily Earnings (3:00 AM UTC)
Automatically calculates and distributes 2% daily returns to all active users.

### Cleanup Job (Every Hour)
Removes expired pending transactions and performs database maintenance.

## Admin Features

- View all users and transactions
- Update transaction statuses
- Financial analytics and reporting
- User management capabilities

## Monitoring & Logging

- Winston logger for comprehensive logging
- Request/response logging
- Error tracking and reporting
- Performance monitoring ready

This backend provides a solid foundation for the RedStone crypto investment platform with all necessary features for a production-ready MLM system.