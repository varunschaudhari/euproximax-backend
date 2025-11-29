const nodemailer = require('nodemailer');
const config = require('./config');
const logger = require('./logger');

const transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465, // true for 465, false for other ports
    auth: config.mail.auth.user
        ? {
            user: config.mail.auth.user,
            pass: config.mail.auth.pass
        }
        : undefined,
    tls: {
        // Do not fail on invalid certs (useful for development)
        rejectUnauthorized: false
    }
});

// Verify connection configuration (non-blocking)
// This runs asynchronously and won't block server startup
setTimeout(() => {
    transporter.verify(function (error, success) {
        if (error) {
            logger.warn('SMTP connection verification failed. Email functionality may not work:', {
                message: error.message,
                code: error.code
            });
            logger.warn('To fix: Generate a Gmail App Password at https://myaccount.google.com/apppasswords');
        } else {
            logger.info('SMTP server is ready to send messages');
        }
    });
}, 2000); // Delay verification to allow server to start first

const sendMail = async ({ to, subject, html, text }) => {
    if (!config.mail.auth.user || !config.mail.auth.pass) {
        logger.warn('Mail credentials missing. Skipping email send.');
        return;
    }

    const mailOptions = {
        from: config.mail.from,
        to,
        subject,
        text,
        html
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logger.info(`Email sent successfully to ${to}. Message ID: ${info.messageId}`);
        return info;
    } catch (error) {
        logger.error(`Failed to send email to ${to}:`, {
            error: error.message,
            code: error.code,
            response: error.response
        });
        throw error;
    }
};

module.exports = {
    sendMail
};

