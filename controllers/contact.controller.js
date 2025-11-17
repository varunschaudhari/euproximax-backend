const ContactMessage = require('../models/ContactMessage');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { sendMail } = require('../utils/mailer');

const createContact = async (req, res, next) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    const contact = await ContactMessage.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim(),
      subject: subject.trim(),
      message: message.trim(),
      meta: {
        userAgent: req.headers['user-agent'],
        ip: req.ip
      }
    });

    try {
      await sendMail({
        to: contact.email,
        subject: `We received your enquiry - ${contact.subject}`,
        text: `Hi ${contact.name},\n\nThank you for reaching out to us. Our team has received your enquiry and will get back to you shortly.\n\nRegards,\nEuProximaX Team`,
        html: `<p>Hi ${contact.name},</p><p>Thank you for reaching out about <strong>${contact.subject}</strong>. Our team has received your enquiry and will get back to you shortly.</p><p>Regards,<br/>EuProximaX Team</p>`
      });
    } catch (mailError) {
      logger.error('Contact confirmation email failed', { error: mailError.message });
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

