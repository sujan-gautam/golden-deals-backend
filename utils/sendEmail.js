const nodemailer = require('nodemailer');

const sendEmail = async (to, subject, text) => {
  try {
    // Validate environment variables
    if (!process.env.APP_NAME || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error('Missing required environment variables: APP_NAME, EMAIL_USER, or EMAIL_PASS');
    }

    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"${process.env.APP_NAME}" <${process.env.EMAIL_USER}>`, // Use APP_NAME from .env
      to,
      subject,
      text,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email');
  }
};

module.exports = sendEmail;