# RedStone Backend - Vercel Deployment Guide

## Prerequisites

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

## Environment Variables Setup

Before deploying, you need to set up environment variables in Vercel:

```bash
# Set MongoDB URI
vercel env add MONGODB_URI

# Set JWT Secrets
vercel env add JWT_SECRET
vercel env add JWT_REFRESH_SECRET

# Set other required variables
vercel env add NODE_ENV
vercel env add SMTP_HOST
vercel env add SMTP_PORT
vercel env add SMTP_USER
vercel env add SMTP_PASS
```

## Deployment Steps

1. **Navigate to backend directory**:
   ```bash
   cd /Users/mahendrabahubali/Desktop/RedStone/redstone_flutter_app/backend
   ```

2. **Deploy to preview (development)**:
   ```bash
   vercel
   ```

3. **Deploy to production**:
   ```bash
   vercel --prod
   ```

## Environment Variables Required

- `MONGODB_URI`: Your MongoDB connection string
- `JWT_SECRET`: Secret for JWT tokens
- `JWT_REFRESH_SECRET`: Secret for refresh tokens
- `NODE_ENV`: Set to "production"
- `SMTP_HOST`: Email server host
- `SMTP_PORT`: Email server port
- `SMTP_USER`: Email username
- `SMTP_PASS`: Email password

## API Endpoints

After deployment, your API will be available at:
- `https://your-project.vercel.app/api/health` - Health check
- `https://your-project.vercel.app/api/auth/*` - Authentication routes
- `https://your-project.vercel.app/api/admin/*` - Admin routes
- `https://your-project.vercel.app/api/user/*` - User routes
- `https://your-project.vercel.app/api/transaction/*` - Transaction routes
- `https://your-project.vercel.app/api/referral/*` - Referral routes

## Update Frontend URLs

After deployment, update the API URLs in:
1. Flutter app: `lib/services/auth_service.dart`
2. Admin panel: `src/services/api.js`

Replace `http://localhost:3000` with your Vercel deployment URL.

## Troubleshooting

1. **Check deployment logs**:
   ```bash
   vercel logs
   ```

2. **Check function logs**:
   ```bash
   vercel logs --follow
   ```

3. **Redeploy if needed**:
   ```bash
   vercel --prod --force
   ```