const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Verify transporter configuration
    this.verifyConnection();
  }

  async verifyConnection() {
    try {
      await this.transporter.verify();
      logger.info('✅ Email service connected successfully');
    } catch (error) {
      logger.error('❌ Email service connection failed:', error);
    }
  }

  async sendVerificationEmail(userEmail, userName, verificationOTP) {
    try {
      // Generate unique identifiers to prevent email threading
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 9);
      const uniqueSubject = `RedStone Email Verification - ${timestamp}`;
      
      const mailOptions = {
        from: {
          name: 'RedStone Team',
          address: process.env.SMTP_USER,
        },
        to: userEmail,
        subject: uniqueSubject,
        html: this.getVerificationEmailTemplate(userName, verificationOTP),
        text: `Welcome to RedStone, ${userName}! Your email verification code is: ${verificationOTP}`,
        headers: {
          // Prevent email threading by making each email unique
          'Message-ID': `<redstone-verify-${timestamp}-${randomId}@${process.env.SMTP_HOST || 'redstone.com'}>`,
          'References': undefined,
          'In-Reply-To': undefined,
          'X-Entity-ID': `verification-${timestamp}-${randomId}`,
          'X-Priority': '1', // High priority for verification emails
        },
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Verification email sent to ${userEmail}:`, result.messageId);
      return result;
    } catch (error) {
      logger.error('Error sending verification email:', error);
      throw error;
    }
  }

  async sendWelcomeEmail(userEmail, userName, referralCode) {
    try {
      const mailOptions = {
        from: {
          name: 'RedStone Team',
          address: process.env.SMTP_USER,
        },
        to: userEmail,
        subject: 'Welcome to RedStone - Your Investment Journey Begins!',
        html: this.getWelcomeEmailTemplate(userName, referralCode),
        text: `Welcome to RedStone, ${userName}! Your referral code is: ${referralCode}`,
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Welcome email sent to ${userEmail}:`, result.messageId);
      return result;
    } catch (error) {
      logger.error('Error sending welcome email:', error);
      throw error;
    }
  }

  async sendPasswordResetEmail(userEmail, userName, resetToken) {
    try {
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      
      const mailOptions = {
        from: {
          name: 'RedStone Security',
          address: process.env.SMTP_USER,
        },
        to: userEmail,
        subject: 'RedStone - Password Reset Request',
        html: this.getPasswordResetEmailTemplate(userName, resetUrl),
        text: `Password reset requested for ${userName}. Reset your password: ${resetUrl}`,
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Password reset email sent to ${userEmail}:`, result.messageId);
      return result;
    } catch (error) {
      logger.error('Error sending password reset email:', error);
      throw error;
    }
  }

  async sendDepositConfirmationEmail(userEmail, userName, amount, cryptocurrency) {
    try {
      const mailOptions = {
        from: {
          name: 'RedStone Transactions',
          address: process.env.SMTP_USER,
        },
        to: userEmail,
        subject: 'RedStone - Deposit Confirmed',
        html: this.getDepositConfirmationTemplate(userName, amount, cryptocurrency),
        text: `Deposit confirmed: $${amount} worth of ${cryptocurrency} has been added to your RedStone wallet.`,
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Deposit confirmation email sent to ${userEmail}:`, result.messageId);
      return result;
    } catch (error) {
      logger.error('Error sending deposit confirmation email:', error);
      throw error;
    }
  }

  getVerificationEmailTemplate(userName, verificationOTP) {
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your RedStone Account</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #E53935, #FFCDD2); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-code { display: inline-block; background: #E53935; color: white; padding: 20px 30px; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 10px; margin: 20px 0; text-align: center; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            .timestamp { text-align: center; margin-top: 10px; color: #888; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔷 Welcome to RedStone</h1>
                <p>Invest. Grow. Refer.</p>
            </div>
            <div class="content">
                <h2>Hello ${userName}!</h2>
                <p>Thank you for joining RedStone, the premier crypto investment platform with MLM rewards!</p>
                <p>To complete your registration and start your investment journey, please enter this verification code in the app:</p>
                
                <div style="text-align: center;">
                    <div class="otp-code">${verificationOTP}</div>
                </div>
                
                <p style="text-align: center; color: #E53935; font-weight: bold;">This code will expire in 10 minutes</p>
                <div class="timestamp">Generated on: ${timestamp} UTC</div>
                
                <h3>🎯 What's Next?</h3>
                <ul>
                    <li>✅ Enter the verification code (this step)</li>
                    <li>💰 Make your first deposit ($50 minimum)</li>
                    <li>📈 Start earning 2% daily returns</li>
                    <li>👥 Refer friends and earn commissions</li>
                    <li>🏆 Unlock higher levels for better rates</li>
                </ul>
                
                <p><strong>Security Note:</strong> Never share this verification code with anyone. RedStone will never ask for your verification code.</p>
            </div>
            <div class="footer">
                <p>© 2025 RedStone. All rights reserved.</p>
                <p>If you didn't create an account with us, please ignore this email.</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  getWelcomeEmailTemplate(userName, referralCode) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to RedStone!</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #E53935, #FFCDD2); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .referral-code { background: #E53935; color: white; padding: 15px; text-align: center; border-radius: 5px; font-size: 18px; font-weight: bold; margin: 20px 0; }
            .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
            .stat-card { background: white; padding: 15px; border-radius: 5px; text-align: center; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Welcome to RedStone!</h1>
                <p>Your crypto investment journey starts now</p>
            </div>
            <div class="content">
                <h2>Congratulations ${userName}!</h2>
                <p>Your email has been verified and your RedStone account is now active!</p>
                
                <h3>🔑 Your Unique Referral Code</h3>
                <div class="referral-code">${referralCode}</div>
                <p>Share this code with friends and family to earn commission on their investments!</p>
                
                <h3>💎 RedStone Features</h3>
                <div class="stats-grid">
                    <div class="stat-card">
                        <strong>2%</strong><br>Daily Returns
                    </div>
                    <div class="stat-card">
                        <strong>5-20%</strong><br>Referral Commission
                    </div>
                    <div class="stat-card">
                        <strong>$50</strong><br>Minimum Deposit
                    </div>
                    <div class="stat-card">
                        <strong>5 Levels</strong><br>User Progression
                    </div>
                </div>
                
                <h3>🚀 Getting Started</h3>
                <ol>
                    <li><strong>Login to your account</strong> - Use your email and password</li>
                    <li><strong>Make your first deposit</strong> - Minimum $50 in supported crypto</li>
                    <li><strong>Watch your balance grow</strong> - Earn 2% daily on your investment</li>
                    <li><strong>Refer friends</strong> - Share your code ${referralCode} to earn commissions</li>
                    <li><strong>Level up</strong> - Higher deposits unlock better commission rates</li>
                </ol>
                
                <h3>🎯 Commission Structure</h3>
                <ul>
                    <li><strong>Bronze (Level 1):</strong> 5% commission rate</li>
                    <li><strong>Silver (Level 2):</strong> 8% commission rate</li>
                    <li><strong>Gold (Level 3):</strong> 12% commission rate</li>
                    <li><strong>Platinum (Level 4):</strong> 15% commission rate</li>
                    <li><strong>Diamond (Level 5):</strong> 20% commission rate</li>
                </ul>
                
                <p><strong>Need help?</strong> Our support team is here to assist you every step of the way!</p>
            </div>
            <div class="footer">
                <p>© 2025 RedStone. All rights reserved.</p>
                <p>Start investing smart with RedStone today!</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  getPasswordResetEmailTemplate(userName, resetUrl) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your RedStone Password</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #E53935; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #E53935; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔐 Password Reset</h1>
                <p>RedStone Security</p>
            </div>
            <div class="content">
                <h2>Hello ${userName},</h2>
                <p>We received a request to reset the password for your RedStone account.</p>
                
                <div style="text-align: center;">
                    <a href="${resetUrl}" class="button">🔄 Reset Password</a>
                </div>
                
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${resetUrl}</p>
                
                <div class="warning">
                    <strong>⚠️ Security Notice:</strong>
                    <ul>
                        <li>This reset link will expire in 1 hour</li>
                        <li>If you didn't request this reset, please ignore this email</li>
                        <li>Your password will remain unchanged unless you click the link above</li>
                    </ul>
                </div>
            </div>
            <div class="footer">
                <p>© 2025 RedStone. All rights reserved.</p>
                <p>Keep your account secure!</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  getDepositConfirmationTemplate(userName, amount, cryptocurrency) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Deposit Confirmed - RedStone</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #28a745, #20c997); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .success-box { background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; }
            .amount { font-size: 24px; font-weight: bold; color: #28a745; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>✅ Deposit Confirmed!</h1>
                <p>Your investment is now active</p>
            </div>
            <div class="content">
                <h2>Great news, ${userName}!</h2>
                <p>Your deposit has been successfully confirmed and added to your RedStone wallet.</p>
                
                <div class="success-box">
                    <div class="amount">$${amount}</div>
                    <p><strong>${cryptocurrency}</strong> deposit confirmed</p>
                    <p>🎯 You'll start earning 2% daily returns immediately!</p>
                </div>
                
                <h3>📈 What Happens Next?</h3>
                <ul>
                    <li>Your daily earnings will be calculated automatically</li>
                    <li>Returns are credited to your wallet at 3:00 AM UTC daily</li>
                    <li>Your referral level may have been updated based on total deposits</li>
                    <li>Start referring friends to earn commission bonuses!</li>
                </ul>
                
                <p><strong>Dashboard:</strong> Login to your account to see your updated balance and earning projections.</p>
            </div>
            <div class="footer">
                <p>© 2025 RedStone. All rights reserved.</p>
                <p>Thank you for investing with RedStone!</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }
}

module.exports = new EmailService();