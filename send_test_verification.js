require('dotenv').config();
const nodemailer = require('nodemailer');

async function sendTestVerificationEmail() {
  console.log('📧 Sending Test Verification Email...\n');
  
  const testEmail = 'snapthinktrader@gmail.com';
  const testUserName = 'Test User';
  const testOTP = '123456';
  
  try {
    const smtpPort = parseInt(process.env.SMTP_PORT);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
    
    console.log('🔍 Verifying connection...');
    await transporter.verify();
    console.log('✅ Connection successful!\n');
    
    // Generate unique identifiers to prevent email threading
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const uniqueSubject = `RedStone Email Verification - ${timestamp}`;
    
    const mailOptions = {
      from: {
        name: 'RedStone Team',
        address: process.env.SMTP_USER,
      },
      to: testEmail,
      subject: uniqueSubject,
      html: getVerificationEmailTemplate(testUserName, testOTP, timestamp),
      text: `Welcome to RedStone, ${testUserName}! Your email verification code is: ${testOTP}`,
      headers: {
        'Message-ID': `<redstone-verify-${timestamp}-${randomId}@redstonne.com>`,
        'References': undefined,
        'In-Reply-To': undefined,
        'X-Entity-ID': `verification-${timestamp}-${randomId}`,
        'X-Priority': '1',
      },
    };
    
    console.log('📨 Sending verification email to:', testEmail);
    console.log('📧 From:', process.env.SMTP_USER);
    console.log('🔢 OTP Code:', testOTP);
    console.log('');
    
    const result = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email sent successfully!');
    console.log('📬 Message ID:', result.messageId);
    console.log('');
    console.log('🎯 Check your inbox at:', testEmail);
    console.log('📧 Subject:', uniqueSubject);
    console.log('🔢 Verification Code:', testOTP);
    console.log('');
    console.log('✨ Email Features:');
    console.log('  - Beautiful HTML template with RedStone branding');
    console.log('  - Red gradient header design');
    console.log('  - Large, easy-to-read OTP code');
    console.log('  - 10-minute expiry notice');
    console.log('  - What\'s Next section with getting started steps');
    console.log('');
    
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    console.log('');
    console.log('🔧 Error details:', error);
  }
}

function getVerificationEmailTemplate(userName, verificationOTP, timestamp) {
  const dateTime = new Date(timestamp).toLocaleString('en-US', { 
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
          .logo { max-width: 120px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-code { display: inline-block; background: #E53935; color: white; padding: 20px 30px; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 10px; margin: 20px 0; text-align: center; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .timestamp { text-align: center; margin-top: 10px; color: #888; font-size: 12px; }
          .test-notice { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">
              <img src="https://redstoneadmin.vercel.app/logo.png" alt="RedStone Logo" class="logo" />
              <h1>🔷 Welcome to RedStone</h1>
              <p>Invest. Grow. Refer.</p>
          </div>
          <div class="content">
              <div class="test-notice">
                  <strong>🧪 TEST EMAIL</strong> - This is a test verification email from the new Hostinger email service (verify@redstonne.com)
              </div>
              
              <h2>Hello ${userName}!</h2>
              <p>Thank you for joining RedStone, the premier crypto investment platform with MLM rewards!</p>
              <p>To complete your registration and start your investment journey, please enter this verification code in the app:</p>
              
              <div style="text-align: center;">
                  <div class="otp-code">${verificationOTP}</div>
              </div>
              
              <p style="text-align: center; color: #E53935; font-weight: bold;">This code will expire in 10 minutes</p>
              <div class="timestamp">Generated on: ${dateTime} UTC</div>
              
              <h3>🎯 What's Next?</h3>
              <ul>
                  <li>✅ Enter the verification code (this step)</li>
                  <li>💰 Make your first deposit ($50 minimum)</li>
                  <li>📈 Start earning 2% daily returns</li>
                  <li>👥 Refer friends and earn commissions</li>
                  <li>🏆 Unlock higher levels for better rates</li>
              </ul>
              
              <p><strong>Security Note:</strong> Never share this verification code with anyone. RedStone will never ask for your verification code.</p>
              
              <div class="test-notice">
                  <strong>✅ Email Configuration:</strong><br>
                  From: verify@redstonne.com (Hostinger)<br>
                  Port: 465 (SSL)<br>
                  Status: Working perfectly!
              </div>
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

sendTestVerificationEmail();
