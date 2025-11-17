const ContactMessage = require('../models/ContactMessage');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { sendMail } = require('../utils/mailer');
const config = require('../utils/config');

// Subject mapping: normalize subject values to proper display format
const normalizeSubject = (subject) => {
  if (!subject) return subject;

  const subjectMap = {
    'patent': 'Patent Services',
    'design': 'Industrial Design',
    'prototyping': 'Prototyping',
    'electronic': 'Electronic Design',
    'mechanical': 'Mechanical Design',
    'packaging': 'Packaging Design',
    'manufacturing': 'Manufacturing',
    'general': 'General Inquiry'
  };

  const trimmedSubject = subject.trim().toLowerCase();

  // Handle comma-separated values (e.g., "patent, electronic")
  if (trimmedSubject.includes(',')) {
    const subjects = trimmedSubject.split(',').map(s => s.trim()).filter(Boolean);
    const normalizedSubjects = subjects.map(s => subjectMap[s] || s.charAt(0).toUpperCase() + s.slice(1));
    return normalizedSubjects.join(', ');
  }

  // Handle single value
  return subjectMap[trimmedSubject] || subject.trim();
};

const createContact = async (req, res, next) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Normalize subject to proper format
    const normalizedSubject = normalizeSubject(subject);

    const contact = await ContactMessage.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim(),
      subject: normalizedSubject,
      message: message.trim(),
      meta: {
        userAgent: req.headers['user-agent'],
        ip: req.ip
      }
    });

    try {
      const emailSubject = `Thank You for Contacting EuProximaX - ${contact.subject}`;
      const emailText = `Dear ${contact.name},

Thank you for contacting EuProximaX Innovation Services. We've received your enquiry and will respond within 24-48 business hours.

ENQUIRY SUMMARY:
• Subject: ${contact.subject}
• Submitted: ${new Date(contact.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
${contact.phone ? `• Phone: ${contact.phone}` : ''}
• Email: ${contact.email}

YOUR MESSAGE:
${contact.message}

NEXT STEPS:
Our team will review your enquiry and get back to you shortly. For urgent matters, contact us directly at contact@euproximax.com.

Best regards,
EuProximaX Team
contact@euproximax.com`;

      const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Thank You for Contacting EuProximaX</title>
    <!--[if mso]>
    <style type="text/css">
        body, table, td {font-family: Arial, sans-serif !important;}
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f6f9;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07); overflow: hidden;">
                    
                    <!-- Header with Gradient -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 0;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="padding: 35px 40px; text-align: center;">
                                        <!-- Logo -->
                                        // <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto 20px;">
                                        //     <tr>
                                        //         <td>
                                        //             <img src="${config.mail.logoUrl}" alt="EuProximaX Logo" style="max-width: 180px; height: auto; display: block; margin: 0 auto;" />
                                        //         </td>
                                        //     </tr>
                                        // </table>
                                        <!-- Success Icon -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto 15px;">
                                            <tr>
                                                <td style="width: 50px; height: 50px; background-color: rgba(255, 255, 255, 0.25); border-radius: 50%; text-align: center; vertical-align: middle; font-size: 28px; color: #ffffff; line-height: 50px;">✓</td>
                                            </tr>
                                        </table>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.2;">Thank You!</h1>
                                        <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.95); font-size: 15px; font-weight: 400;">EuProximaX Innovation Services</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 30px 35px;">
                            <p style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 16px; line-height: 1.5;">Dear <strong style="color: #667eea;">${contact.name}</strong>,</p>
                            
                            <p style="margin: 0 0 25px 0; color: #4a5568; font-size: 15px; line-height: 1.6;">Thank you for contacting us. We've received your enquiry and will respond within <strong style="color: #667eea;">24-48 business hours</strong>.</p>
                            
                            <!-- Enquiry Summary Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%); border-radius: 8px; border-left: 4px solid #667eea; margin: 0 0 20px 0;">
                                <tr>
                                    <td style="padding: 20px 25px;">
                                        <h2 style="margin: 0 0 15px 0; color: #667eea; font-size: 16px; font-weight: 600;">📋 Enquiry Summary</h2>
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td style="padding: 6px 0; border-bottom: 1px solid rgba(102, 126, 234, 0.1);">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Subject:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; font-weight: 600; margin-left: 8px;">${contact.subject}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 6px 0; border-bottom: 1px solid rgba(102, 126, 234, 0.1);">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Submitted:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;">${new Date(contact.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                                </td>
                                            </tr>
                                            ${contact.phone ? `
                                            <tr>
                                                <td style="padding: 6px 0; border-bottom: 1px solid rgba(102, 126, 234, 0.1);">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Phone:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;">${contact.phone}</span>
                                                </td>
                                            </tr>
                                            ` : ''}
                                            <tr>
                                                <td style="padding: 6px 0;">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Email:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;">${contact.email}</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Message Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f7fafc; border-radius: 8px; margin: 0 0 20px 0;">
                                <tr>
                                    <td style="padding: 20px 25px;">
                                        <h3 style="margin: 0 0 12px 0; color: #2d3748; font-size: 15px; font-weight: 600;">Your Message</h3>
                                        <p style="margin: 0; color: #4a5568; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${contact.message.replace(/\n/g, '<br>')}</p>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Next Steps Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 8px; border-left: 4px solid #22c55e; margin: 0 0 20px 0;">
                                <tr>
                                    <td style="padding: 20px 25px;">
                                        <h3 style="margin: 0 0 10px 0; color: #166534; font-size: 15px; font-weight: 600;">
                                            <span style="display: inline-block; width: 24px; height: 24px; background-color: #22c55e; border-radius: 50%; margin-right: 8px; text-align: center; line-height: 24px; color: white; font-size: 14px; vertical-align: middle;">✓</span>
                                            Next Steps
                                        </h3>
                                        <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.6;">Our team will review your enquiry and respond within <strong style="color: #15803d;">24-48 business hours</strong>. For urgent matters, contact us at <a href="mailto:contact@euproximax.com" style="color: #22c55e; text-decoration: none; font-weight: 600;">contact@euproximax.com</a>.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 25px 35px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="margin: 0 0 8px 0; color: #2d3748; font-size: 14px; font-weight: 600;">Best regards,</p>
                            <p style="margin: 0 0 6px 0; color: #4a5568; font-size: 14px; font-weight: 500;">EuProximaX Team</p>
                            <p style="margin: 0 0 15px 0;">
                                <a href="mailto:contact@euproximax.com" style="color: #667eea; text-decoration: none; font-size: 13px; font-weight: 500;">contact@euproximax.com</a>
                            </p>
                            <p style="margin: 15px 0 0 0; padding-top: 15px; border-top: 1px solid #e2e8f0; color: #a0aec0; font-size: 11px; line-height: 1.4;">This is an automated confirmation email.</p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

      await sendMail({
        to: contact.email,
        subject: emailSubject,
        text: emailText,
        html: emailHtml
      });

      logger.info(`Confirmation email sent successfully to ${contact.email} for enquiry: ${contact.subject}`);
    } catch (mailError) {
      logger.error('Contact confirmation email failed', {
        error: mailError.message,
        email: contact.email,
        subject: contact.subject
      });
    }

    res.status(201).json({
      success: true,
      message: 'Enquiry submitted successfully',
      data: {
        contactId: contact._id
      }
    });
  } catch (error) {
    logger.error('Contact form submission error', {
      error: error.message,
      stack: error.stack
    });
    next(error instanceof AppError ? error : new AppError('Unable to submit enquiry', 500));
  }
};

const listContacts = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const searchTerm = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = req.query.status?.trim();
    const skip = (page - 1) * limit;

    const filter = {};
    if (searchTerm) {
      const regex = new RegExp(searchTerm, 'i');
      filter.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { subject: regex }
      ];
    }
    if (status) {
      filter.status = status;
    }

    const [messages, total] = await Promise.all([
      ContactMessage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ContactMessage.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      message: 'Contacts fetched successfully',
      data: {
        items: messages,
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1)
      }
    });
  } catch (error) {
    logger.error('List contact error', {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};

module.exports = {
  createContact,
  listContacts
};

