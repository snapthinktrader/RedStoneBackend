require('dotenv').config();
const nodemailer = require('nodemailer');

async function testHostingerEmail() {
  console.log('🧪 Testing Hostinger Email Configuration...\n');
  
  console.log('📧 Current SMTP Settings:');
  console.log('Host:', process.env.SMTP_HOST);
  console.log('Port:', process.env.SMTP_PORT);
  console.log('User:', process.env.SMTP_USER);
  console.log('Pass:', process.env.SMTP_PASS ? '***' + process.env.SMTP_PASS.slice(-4) : 'NOT SET');
  console.log('');
  
  if (!process.env.SMTP_PASS || process.env.SMTP_PASS === 'YOUR_HOSTINGER_EMAIL_PASSWORD_HERE') {
    console.log('❌ ERROR: SMTP_PASS not configured!');
    console.log('');
    console.log('📝 To fix this:');
    console.log('1. Login to Hostinger (hpanel.hostinger.com)');
    console.log('2. Go to Emails section');
    console.log('3. Find verify@redstonne.com');
    console.log('4. Get/Set the password');
    console.log('5. Update SMTP_PASS in .env file');
    console.log('');
    return;
  }
  
  try {
    console.log('🔌 Creating transporter...');
    const smtpPort = parseInt(process.env.SMTP_PORT);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpPort === 465, // true for 465 (SSL), false for 587 (TLS)
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false, // Accept self-signed certificates
      },
    });
    
    console.log('✅ Transporter created');
    console.log('');
    
    console.log('🔍 Verifying connection...');
    await transporter.verify();
    console.log('✅ Connection successful!');
    console.log('');
    
    console.log('📨 Sending test email...');
    const testEmail = 'your-test-email@example.com'; // Change this to your email
    
    const info = await transporter.sendMail({
      from: {
        name: 'RedStone Team',
        address: process.env.SMTP_USER,
      },
      to: testEmail,
      subject: 'RedStone Email Test - Hostinger Configuration',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #E53935, #FFCDD2); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Email Test Successful!</h1>
                    <p>RedStone x Hostinger</p>
                </div>
                <div class="content">
                    <h2>Email Configuration Working!</h2>
                    <div class="success">
                        <strong>✅ Success!</strong> Your Hostinger email (verify@redstonne.com) is correctly configured and working.
                    </div>
                    <p><strong>Configuration Details:</strong></p>
                    <ul>
                        <li>SMTP Host: ${process.env.SMTP_HOST}</li>
                        <li>SMTP Port: ${process.env.SMTP_PORT}</li>
                        <li>From Email: ${process.env.SMTP_USER}</li>
                        <li>Test Date: ${new Date().toLocaleString()}</li>
                    </ul>
                    <p>Your RedStone users will now receive:</p>
                    <ul>
                        <li>✅ Email verification codes</li>
                        <li>🎉 Welcome messages</li>
                        <li>🔐 Password reset links</li>
                        <li>💰 Deposit confirmations</li>
                    </ul>
                </div>
            </div>
        </body>
        </html>
      `,
      text: 'RedStone Email Test - Your Hostinger email configuration is working correctly!',
    });
    
    console.log('✅ Test email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('');
    console.log('📬 Check your inbox:', testEmail);
    console.log('');
    console.log('🎯 Next Steps:');
    console.log('1. Update SMTP_PASS in Render environment variables');
    console.log('2. Redeploy your backend on Render');
    console.log('3. Test user signup to verify verification emails work');
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('1. Verify email password is correct');
    console.log('2. Check Hostinger email account is active');
    console.log('3. Try port 465 instead of 587');
    console.log('4. Check if 2FA is disabled for SMTP');
    console.log('');
  }
}

testHostingerEmail();
