const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

class AuthController {
  // Register new user
  static async register(req, res) {
    try {
      const { name, email, password, referralCode } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User already exists with this email'
        });
      }

      // Validate referral code if provided
      let referredBy = null;
      if (referralCode) {
        referredBy = await User.findOne({ referralCode });
        if (!referredBy) {
          return res.status(400).json({
            success: false,
            message: 'Invalid referral code'
          });
        }
      }

      // Generate unique referral code
      const userReferralCode = await AuthController.generateUniqueReferralCode();

      // Generate email verification OTP (6 digits)
      const verificationOTP = Math.floor(100000 + Math.random() * 900000).toString();
      const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Create user
      const user = new User({
        name,
        email,
        password, // This will be hashed by the pre-save middleware
        referralCode: userReferralCode,
        referredBy: referredBy ? referredBy._id : null,
        emailVerificationToken: verificationOTP,
        emailVerificationExpires: verificationExpiry,
      });

      await user.save();

      // Update referral counts
      if (referredBy) {
        // Increment direct referrals for the referrer and update their referral level
        const updatedReferrer = await User.findById(referredBy._id);
        updatedReferrer.directReferrals = (updatedReferrer.directReferrals || 0) + 1;
        updatedReferrer.updateReferralLevel(); // Manually update referral level
        await updatedReferrer.save();
        
        logger.info(`✅ Incremented directReferrals for user ${referredBy._id} (${referredBy.name}) - New level: ${updatedReferrer.referralLevel}`);
        
        // If referrer was also referred by someone, increment indirect referrals for that person
        if (referredBy.referredBy) {
          await User.findByIdAndUpdate(referredBy.referredBy, {
            $inc: { indirectReferrals: 1 }
          });
          
          logger.info(`✅ Incremented indirectReferrals for user ${referredBy.referredBy}`);
        }
      }

      // Send verification email
      try {
        await emailService.sendVerificationEmail(email, name, verificationOTP);
      } catch (emailError) {
        logger.error('Failed to send verification email:', emailError);
        // Continue registration even if email fails
      }

      // Log registration
      logger.info(`New user registered: ${email}${referralCode ? ` (referred by: ${referralCode})` : ''}`);

      res.status(201).json({
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            referralCode: user.referralCode,
            isEmailVerified: user.isEmailVerified
          }
        }
      });

    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during registration'
      });
    }
  }

  // Login user
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Check if account is active
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated. Please contact support.'
        });
      }

      // Verify password
      const isPasswordValid = await user.checkPassword(password);
      if (!isPasswordValid) {
        // Log failed login attempt
        logger.warn(`Failed login attempt for email: ${email}`);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Check if email is verified
      if (!user.isVerified) {
        return res.status(403).json({
          success: false,
          message: 'Please verify your email before logging in',
          requiresEmailVerification: true
        });
      }

      // Generate tokens
      const accessToken = AuthController.generateAccessToken(user._id);
      const refreshToken = AuthController.generateRefreshToken(user._id);

      // Update user last login and refresh token
      user.lastLoginAt = new Date();
      await user.addRefreshToken(await bcrypt.hash(refreshToken, 10));

      // Log successful login
      logger.info(`User logged in: ${email}`);

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            referralCode: user.referralCode,
            walletBalance: user.walletBalance,
            totalDeposit: user.totalDeposit,
            totalEarnings: user.totalEarnings,
            directReferrals: user.directReferrals,
            indirectReferrals: user.indirectReferrals,
            currentLevel: user.currentLevel,
            isVerified: user.isVerified,
            twoFactorEnabled: user.twoFactorEnabled,
            createdAt: user.createdAt
          },
          accessToken,
          refreshToken
        }
      });

    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during login'
      });
    }
  }

  // Refresh access token
  static async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token is required'
        });
      }

      // Verify refresh token
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      } catch (error) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      // Find user and verify stored refresh token
      const user = await User.findById(decoded.userId);
      if (!user || !user.refreshTokens || user.refreshTokens.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      // Check if refresh token exists in user's stored tokens
      let isRefreshTokenValid = false;
      for (const storedToken of user.refreshTokens) {
        if (await bcrypt.compare(refreshToken, storedToken.token)) {
          isRefreshTokenValid = true;
          break;
        }
      }

      if (!isRefreshTokenValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      // Generate new access token
      const newAccessToken = AuthController.generateAccessToken(user._id);

      res.json({
        success: true,
        data: {
          accessToken: newAccessToken
        }
      });

    } catch (error) {
      logger.error('Token refresh error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during token refresh'
      });
    }
  }

  // Logout user
  static async logout(req, res) {
    try {
      const { refreshToken } = req.body;
      const userId = req.user?.userId;

      if (userId && refreshToken) {
        // Find user and remove the specific refresh token
        const user = await User.findById(userId);
        if (user && user.refreshTokens) {
          // Find and remove the matching refresh token
          const tokensToKeep = [];
          for (const storedToken of user.refreshTokens) {
            const isMatch = await bcrypt.compare(refreshToken, storedToken.token);
            if (!isMatch) {
              tokensToKeep.push(storedToken);
            }
          }
          user.refreshTokens = tokensToKeep;
          await user.save();
        }
      }

      logger.info(`User logged out: ${userId}`);

      res.json({
        success: true,
        message: 'Logout successful'
      });

    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during logout'
      });
    }
  }

  // Get current user
  static async getCurrentUser(req, res) {
    try {
      const userId = req.user.userId;

      const user = await User.findById(userId).select('-password -refreshTokens -emailVerificationToken');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        data: {
          user
        }
      });

    } catch (error) {
      logger.error('Get current user error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Verify email
  static async verifyEmail(req, res) {
    try {
      const { email, otp } = req.body;

      const user = await User.findOne({
        email,
        emailVerificationToken: otp,
        emailVerificationExpires: { $gt: new Date() }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired verification code'
        });
      }

      // Update user as verified
      user.isVerified = true;
      user.emailVerificationToken = null;
      user.emailVerificationExpires = null;
      user.emailVerifiedAt = new Date();
      await user.save();

      logger.info(`Email verified for user: ${user.email}`);

      res.json({
        success: true,
        message: 'Email verified successfully'
      });

    } catch (error) {
      logger.error('Email verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during email verification'
      });
    }
  }

  // Resend verification email
  static async resendVerificationEmail(req, res) {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (user.isVerified) {
        return res.status(400).json({
          success: false,
          message: 'Email is already verified'
        });
      }

      // Generate new 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      user.emailVerificationToken = otp;
      user.emailVerificationExpires = otpExpiry;
      await user.save();

      // Send verification email with OTP
      await emailService.sendVerificationEmail(email, user.name, otp);

      logger.info(`Verification email resent to: ${email}`);

      res.json({
        success: true,
        message: 'Verification email sent successfully'
      });

    } catch (error) {
      logger.error('Resend verification email error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Forgot password
  static async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        // Don't reveal if email exists or not
        return res.json({
          success: true,
          message: 'If an account with that email exists, a password reset link has been sent.'
        });
      }

      // Generate password reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

      user.passwordResetToken = resetToken;
      user.passwordResetExpires = resetExpiry;
      await user.save();

      // Send password reset email
      await emailService.sendPasswordResetEmail(email, user.name, resetToken);

      logger.info(`Password reset requested for user: ${email}`);

      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });

    } catch (error) {
      logger.error('Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Reset password
  static async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      const user = await User.findOne({
        passwordResetToken: token,
        passwordResetExpires: { $gt: new Date() }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token'
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password and clear reset token
      user.password = hashedPassword;
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      user.refreshTokens = []; // Invalidate all existing sessions
      await user.save();

      logger.info(`Password reset successful for user: ${user.email}`);

      res.json({
        success: true,
        message: 'Password reset successful'
      });

    } catch (error) {
      logger.error('Reset password error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during password reset'
      });
    }
  }

  // Helper methods
  static generateAccessToken(userId) {
    return jwt.sign(
      { userId, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );
  }

  static generateRefreshToken(userId) {
    return jwt.sign(
      { userId, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
  }

  static async generateUniqueReferralCode() {
    let referralCode;
    let isUnique = false;

    while (!isUnique) {
      // Generate 8-character alphanumeric code
      referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      
      // Check if code already exists
      const existingUser = await User.findOne({ referralCode });
      if (!existingUser) {
        isUnique = true;
      }
    }

    return referralCode;
  }
}

module.exports = AuthController;