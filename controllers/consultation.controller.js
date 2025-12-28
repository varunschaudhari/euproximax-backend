const ConsultationSlot = require('../models/ConsultationSlot');
const ConsultationBooking = require('../models/ConsultationBooking');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { sendMail } = require('../utils/mailer');
const config = require('../utils/config');
const User = require('../models/User');
const Role = require('../models/Role');
const UserRole = require('../models/UserRole');

/**
 * Calculate end time from start time and duration
 * @param {string} startTime - Start time in HH:MM format
 * @param {number} duration - Duration in minutes
 * @returns {string} End time in HH:MM format
 */
const calculateEndTime = (startTime, duration) => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const startDate = new Date();
  startDate.setHours(hours, minutes, 0, 0);
  
  const endDate = new Date(startDate.getTime() + duration * 60000);
  const endHours = String(endDate.getHours()).padStart(2, '0');
  const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
  
  return `${endHours}:${endMinutes}`;
};

/**
 * Check if two time ranges overlap
 * @param {string} start1 - Start time 1
 * @param {string} end1 - End time 1
 * @param {string} start2 - Start time 2
 * @param {string} end2 - End time 2
 * @returns {boolean} True if they overlap
 */
const timeRangesOverlap = (start1, end1, start2, end2) => {
  const timeToMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  
  return (s1 < e2 && e1 > s2);
};

/**
 * Normalize date to start of day (UTC)
 */
const normalizeDate = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/**
 * Generate a unique Google Meet link
 * Note: This generates a link format that follows Google Meet's pattern (abc-defg-hij)
 * IMPORTANT: This creates a link in the correct format, but it won't be a working Meet link
 * until it's created through Google Calendar API or manually in Google Calendar.
 * For production, integrate with Google Calendar API to create actual Meet links when creating calendar events.
 */
const generateGoogleMeetLink = () => {
  const { baseUrl, codeFormat, characterSet } = config.googleMeet;
  
  // Generate a random string for each part of the meeting code
  const generatePart = (length) => {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characterSet.charAt(Math.floor(Math.random() * characterSet.length));
    }
    return result;
  };
  
  const part1 = generatePart(codeFormat.part1Length);
  const part2 = generatePart(codeFormat.part2Length);
  const part3 = generatePart(codeFormat.part3Length);
  
  return `${baseUrl}/${part1}-${part2}-${part3}`;
};

// ==================== PUBLIC METHODS ====================

/**
 * Get available slots for booking
 */
const getAvailableSlots = async (req, res, next) => {
  try {
    const { date, startDate, endDate } = req.query;
    
    const filter = {
      status: 'available',
      isAvailable: true
    };
    
    // Filter by date or date range
    if (date) {
      const slotDate = normalizeDate(date);
      filter.date = slotDate;
    } else if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = normalizeDate(startDate);
      }
      if (endDate) {
        filter.date.$lte = normalizeDate(endDate);
      }
    } else {
      // Default: from today onwards
      filter.date = { $gte: normalizeDate(new Date()) };
    }
    
    // Get slots
    const slots = await ConsultationSlot.find(filter)
      .sort({ date: 1, startTime: 1 })
      .lean();
    
    // Get booking counts for each slot
    const slotIds = slots.map(s => s._id);
    const bookingCounts = await ConsultationBooking.aggregate([
      {
        $match: {
          slotId: { $in: slotIds },
          status: { $nin: ['cancelled'] }
        }
      },
      {
        $group: {
          _id: '$slotId',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const bookingCountMap = {};
    bookingCounts.forEach(bc => {
      bookingCountMap[bc._id.toString()] = bc.count;
    });
    
    // Filter out fully booked slots and add booking count
    const availableSlots = slots
      .filter(slot => {
        const bookingCount = bookingCountMap[slot._id.toString()] || 0;
        return bookingCount < slot.maxBookings;
      })
      .map(slot => ({
        ...slot,
        bookingCount: bookingCountMap[slot._id.toString()] || 0,
        availableSpots: slot.maxBookings - (bookingCountMap[slot._id.toString()] || 0)
      }));
    
    res.status(200).json({
      success: true,
      message: 'Available slots fetched successfully',
      data: availableSlots
    });
  } catch (error) {
    logger.error('Get available slots error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to fetch available slots', 500));
  }
};

/**
 * Send booking receipt email to user
 */
const sendBookingReceiptEmail = async (booking) => {
  try {
    const slot = booking.slotId;
    const slotDate = new Date(slot.date);
    const formattedDate = slotDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const formatTime = (timeString) => {
      const [hours, minutes] = timeString.split(':').map(Number);
      const hour = hours % 12 || 12;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      return `${hour}:${String(minutes).padStart(2, '0')} ${ampm}`;
    };

    const bookingId = booking._id.toString();
    const websiteUrl = config.website.url;
    const cancelUrl = `${websiteUrl}/consultation/confirmation/${bookingId}`;

    const emailSubject = `Consultation Booking Confirmed - Booking ID: ${bookingId.slice(-8)}`;

    const emailText = `
Booking Confirmation - EuProximaX Consultation

Dear ${booking.userName},

Thank you for booking a consultation with EuProximaX!

Booking Details:
- Booking ID: ${bookingId.slice(-8)}
- Date: ${formattedDate}
- Time: ${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}
- Duration: ${slot.duration} minutes

Your Details:
- Name: ${booking.userName}
- Email: ${booking.userEmail}
- Phone: ${booking.userPhone}
${booking.message ? `- Message: ${booking.message}` : ''}
${booking.meetingLink ? `
Meeting Link:
Join the consultation meeting: ${booking.meetingLink}
` : ''}

Next Steps:
Your consultation is confirmed! We look forward to speaking with you on the scheduled date and time.

If you need to cancel this booking, please visit: ${cancelUrl}

For any questions, please contact us at contact@euproximax.com

Best regards,
EuProximaX Team
    `.trim();

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Consultation Booking Confirmed</title>
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
                                        <!-- Success Icon -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto 15px;">
                                            <tr>
                                                <td style="width: 50px; height: 50px; background-color: rgba(255, 255, 255, 0.25); border-radius: 50%; text-align: center; vertical-align: middle; font-size: 28px; color: #ffffff; line-height: 50px;">✓</td>
                                            </tr>
                                        </table>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.2;">Booking Confirmed!</h1>
                                        <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.95); font-size: 15px; font-weight: 400;">EuProximaX Consultation Service</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 30px 35px;">
                            <p style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 16px; line-height: 1.5;">Dear <strong style="color: #667eea;">${booking.userName}</strong>,</p>
                            
                            <p style="margin: 0 0 25px 0; color: #4a5568; font-size: 15px; line-height: 1.6;">Thank you for booking a consultation with EuProximaX! Your booking has been confirmed.</p>
                            
                            <!-- Booking Summary Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%); border-radius: 8px; border-left: 4px solid #667eea; margin: 0 0 20px 0;">
                                <tr>
                                    <td style="padding: 20px 25px;">
                                        <h2 style="margin: 0 0 15px 0; color: #667eea; font-size: 16px; font-weight: 600;">📋 Booking Summary</h2>
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td style="padding: 8px 0; border-bottom: 1px solid rgba(102, 126, 234, 0.1);">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Booking ID:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; font-weight: 600; margin-left: 8px; font-family: monospace;">${bookingId.slice(-8)}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; border-bottom: 1px solid rgba(102, 126, 234, 0.1);">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Date:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;">${formattedDate}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; border-bottom: 1px solid rgba(102, 126, 234, 0.1);">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Time:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;">${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0;">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Duration:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;">${slot.duration} minutes</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- User Details Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f7fafc; border-radius: 8px; margin: 0 0 20px 0;">
                                <tr>
                                    <td style="padding: 20px 25px;">
                                        <h3 style="margin: 0 0 15px 0; color: #2d3748; font-size: 15px; font-weight: 600;">👤 Your Details</h3>
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td style="padding: 6px 0; border-bottom: 1px solid rgba(0, 0, 0, 0.05);">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Name:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;">${booking.userName}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 6px 0; border-bottom: 1px solid rgba(0, 0, 0, 0.05);">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Email:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;">${booking.userEmail}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 6px 0;">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Phone:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;">${booking.userPhone}</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            ${booking.meetingLink ? `
                            <!-- Meeting Link Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 8px; border-left: 4px solid #22c55e; margin: 0 0 20px 0;">
                                <tr>
                                    <td style="padding: 20px 25px;">
                                        <h3 style="margin: 0 0 12px 0; color: #166534; font-size: 15px; font-weight: 600;">
                                            <span style="display: inline-block; width: 24px; height: 24px; background-color: #22c55e; border-radius: 50%; margin-right: 8px; text-align: center; line-height: 24px; color: white; font-size: 14px; vertical-align: middle;">📹</span>
                                            Google Meet Link
                                        </h3>
                                        <p style="margin: 0 0 15px 0; color: #166534; font-size: 14px; line-height: 1.6;">Join the consultation meeting using the link below:</p>
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 15px 0;">
                                            <tr>
                                                <td align="center" style="padding: 0;">
                                                    <a href="${booking.meetingLink}" style="display: inline-block; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; text-align: center; box-shadow: 0 4px 6px rgba(34, 197, 94, 0.3);">Join Google Meet</a>
                                                </td>
                                            </tr>
                                        </table>
                                        <p style="margin: 0; padding: 12px; background-color: rgba(255, 255, 255, 0.7); border-radius: 6px; color: #166534; font-size: 12px; font-family: monospace; word-break: break-all;">${booking.meetingLink}</p>
                                    </td>
                                </tr>
                            </table>
                            ` : ''}
                            ${booking.message ? `
                            <!-- Message Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f7fafc; border-radius: 8px; margin: 0 0 20px 0;">
                                <tr>
                                    <td style="padding: 20px 25px;">
                                        <h3 style="margin: 0 0 12px 0; color: #2d3748; font-size: 15px; font-weight: 600;">💬 Your Message</h3>
                                        <p style="margin: 0; color: #4a5568; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${booking.message.replace(/\n/g, '<br>')}</p>
                                    </td>
                                </tr>
                            </table>
                            ` : ''}
                            
                            <!-- Next Steps Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 8px; border-left: 4px solid #22c55e; margin: 0 0 20px 0;">
                                <tr>
                                    <td style="padding: 20px 25px;">
                                        <h3 style="margin: 0 0 10px 0; color: #166534; font-size: 15px; font-weight: 600;">
                                            <span style="display: inline-block; width: 24px; height: 24px; background-color: #22c55e; border-radius: 50%; margin-right: 8px; text-align: center; line-height: 24px; color: white; font-size: 14px; vertical-align: middle;">✓</span>
                                            Next Steps
                                        </h3>
                                        <p style="margin: 0 0 12px 0; color: #166534; font-size: 14px; line-height: 1.6;">Your consultation is confirmed! We look forward to speaking with you on the scheduled date and time.</p>
                                        <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.6;">For any questions or to reschedule, please contact us at <a href="mailto:contact@euproximax.com" style="color: #22c55e; text-decoration: none; font-weight: 600;">contact@euproximax.com</a></p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Cancel Booking Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 20px 0;">
                                <tr>
                                    <td align="center" style="padding: 0 25px;">
                                        <a href="${cancelUrl}" style="display: inline-block; background-color: #fee2e2; color: #991b1b; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; text-align: center; border: 1px solid #fecaca;">Cancel Booking</a>
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
                            <p style="margin: 15px 0 0 0; padding-top: 15px; border-top: 1px solid #e2e8f0; color: #a0aec0; font-size: 11px; line-height: 1.4;">This is an automated confirmation email. Booking ID: ${bookingId.slice(-8)}</p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    await sendMail({
      to: booking.userEmail,
      subject: emailSubject,
      text: emailText,
      html: emailHtml
    });

    logger.info(`Booking receipt email sent to user: ${booking.userEmail}`);
  } catch (error) {
    logger.error('Failed to send booking receipt email', { error: error.message, stack: error.stack });
    // Don't throw error - email failure shouldn't block booking creation
  }
};

/**
 * Send admin notification email
 */
const sendAdminNotificationEmail = async (booking, adminEmails) => {
  try {
    if (!adminEmails || adminEmails.length === 0) {
      return;
    }

    const slot = booking.slotId;
    const slotDate = new Date(slot.date);
    const formattedDate = slotDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const formatTime = (timeString) => {
      const [hours, minutes] = timeString.split(':').map(Number);
      const hour = hours % 12 || 12;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      return `${hour}:${String(minutes).padStart(2, '0')} ${ampm}`;
    };

    const bookingId = booking._id.toString();
    const adminPortalUrl = config.adminPortal.url;
    const bookingUrl = `${adminPortalUrl}/admin/consultation-bookings/${bookingId}`;

    const emailSubject = `New Consultation Booking - ${booking.userName}`;

    const emailText = `
New Consultation Booking Received

A new consultation booking has been received:

Booking Details:
- Booking ID: ${bookingId.slice(-8)}
- Date: ${formattedDate}
- Time: ${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}
- Duration: ${slot.duration} minutes

User Details:
- Name: ${booking.userName}
- Email: ${booking.userEmail}
- Phone: ${booking.userPhone}
${booking.message ? `- Message: ${booking.message}` : ''}
${booking.meetingLink ? `
Meeting Link:
${booking.meetingLink}
` : ''}

View and manage this booking: ${bookingUrl}

Best regards,
EuProximaX System
    `.trim();

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>New Consultation Booking</title>
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
                        <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 0;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="padding: 35px 40px; text-align: center;">
                                        <!-- Notification Icon -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto 15px;">
                                            <tr>
                                                <td style="width: 50px; height: 50px; background-color: rgba(255, 255, 255, 0.25); border-radius: 50%; text-align: center; vertical-align: middle; font-size: 28px; color: #ffffff; line-height: 50px;">🔔</td>
                                            </tr>
                                        </table>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.2;">New Booking Received</h1>
                                        <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.95); font-size: 15px; font-weight: 400;">EuProximaX Consultation Service</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 30px 35px;">
                            <p style="margin: 0 0 25px 0; color: #4a5568; font-size: 15px; line-height: 1.6;">A new consultation booking has been received and requires your attention.</p>
                            
                            <!-- Booking Summary Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 8px; border-left: 4px solid #f59e0b; margin: 0 0 20px 0;">
                                <tr>
                                    <td style="padding: 20px 25px;">
                                        <h2 style="margin: 0 0 15px 0; color: #92400e; font-size: 16px; font-weight: 600;">📋 Booking Summary</h2>
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td style="padding: 8px 0; border-bottom: 1px solid rgba(146, 64, 14, 0.1);">
                                                    <span style="color: #92400e; font-size: 13px; font-weight: 500;">Booking ID:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; font-weight: 600; margin-left: 8px; font-family: monospace;">${bookingId.slice(-8)}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; border-bottom: 1px solid rgba(146, 64, 14, 0.1);">
                                                    <span style="color: #92400e; font-size: 13px; font-weight: 500;">Date:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;">${formattedDate}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; border-bottom: 1px solid rgba(146, 64, 14, 0.1);">
                                                    <span style="color: #92400e; font-size: 13px; font-weight: 500;">Time:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;">${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0;">
                                                    <span style="color: #92400e; font-size: 13px; font-weight: 500;">Duration:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;">${slot.duration} minutes</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- User Details Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f7fafc; border-radius: 8px; margin: 0 0 20px 0;">
                                <tr>
                                    <td style="padding: 20px 25px;">
                                        <h3 style="margin: 0 0 15px 0; color: #2d3748; font-size: 15px; font-weight: 600;">👤 User Details</h3>
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td style="padding: 6px 0; border-bottom: 1px solid rgba(0, 0, 0, 0.05);">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Name:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;">${booking.userName}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 6px 0; border-bottom: 1px solid rgba(0, 0, 0, 0.05);">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Email:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;"><a href="mailto:${booking.userEmail}" style="color: #667eea; text-decoration: none;">${booking.userEmail}</a></span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 6px 0;">
                                                    <span style="color: #718096; font-size: 13px; font-weight: 500;">Phone:</span>
                                                    <span style="color: #1a1a1a; font-size: 13px; margin-left: 8px;"><a href="tel:${booking.userPhone}" style="color: #667eea; text-decoration: none;">${booking.userPhone}</a></span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            ${booking.meetingLink ? `
                            <!-- Meeting Link Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 8px; border-left: 4px solid #22c55e; margin: 0 0 20px 0;">
                                <tr>
                                    <td style="padding: 20px 25px;">
                                        <h3 style="margin: 0 0 12px 0; color: #166534; font-size: 15px; font-weight: 600;">
                                            <span style="display: inline-block; width: 24px; height: 24px; background-color: #22c55e; border-radius: 50%; margin-right: 8px; text-align: center; line-height: 24px; color: white; font-size: 14px; vertical-align: middle;">📹</span>
                                            Google Meet Link
                                        </h3>
                                        <p style="margin: 0 0 15px 0; color: #166534; font-size: 14px; line-height: 1.6;">Meeting link for this consultation:</p>
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 15px 0;">
                                            <tr>
                                                <td align="center" style="padding: 0;">
                                                    <a href="${booking.meetingLink}" style="display: inline-block; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; text-align: center; box-shadow: 0 4px 6px rgba(34, 197, 94, 0.3);">Join Google Meet</a>
                                                </td>
                                            </tr>
                                        </table>
                                        <p style="margin: 0; padding: 12px; background-color: rgba(255, 255, 255, 0.7); border-radius: 6px; color: #166534; font-size: 12px; font-family: monospace; word-break: break-all;">${booking.meetingLink}</p>
                                    </td>
                                </tr>
                            </table>
                            ` : ''}
                            ${booking.message ? `
                            <!-- Message Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f7fafc; border-radius: 8px; margin: 0 0 20px 0;">
                                <tr>
                                    <td style="padding: 20px 25px;">
                                        <h3 style="margin: 0 0 12px 0; color: #2d3748; font-size: 15px; font-weight: 600;">💬 User Message</h3>
                                        <p style="margin: 0; color: #4a5568; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${booking.message.replace(/\n/g, '<br>')}</p>
                                    </td>
                                </tr>
                            </table>
                            ` : ''}

                            <!-- Action Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 20px 0;">
                                <tr>
                                    <td align="center" style="padding: 0 25px;">
                                        <a href="${bookingUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; text-align: center; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">View & Manage Booking</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 25px 35px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="margin: 0 0 8px 0; color: #2d3748; font-size: 14px; font-weight: 600;">EuProximaX Admin Portal</p>
                            <p style="margin: 0; color: #a0aec0; font-size: 11px; line-height: 1.4;">This is an automated notification email. Booking ID: ${bookingId.slice(-8)}</p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    // Send email to all admin emails
    for (const email of adminEmails) {
      try {
        await sendMail({
          to: email,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        logger.info(`Admin notification email sent to: ${email}`);
      } catch (error) {
        logger.error(`Failed to send admin notification email to ${email}`, { error: error.message });
        // Continue sending to other admins even if one fails
      }
    }
  } catch (error) {
    logger.error('Failed to send admin notification emails', { error: error.message, stack: error.stack });
    // Don't throw error - email failure shouldn't block booking creation
  }
};

/**
 * Book a consultation slot
 */
const bookConsultation = async (req, res, next) => {
  try {
    const { slotId, userName, userEmail, userPhone, message } = req.body;
    
    // Validate required fields
    if (!slotId || !userName || !userEmail || !userPhone) {
      return next(new AppError('Missing required fields: slotId, userName, userEmail, and userPhone are required', 400));
    }
    
    // Find the slot
    const slot = await ConsultationSlot.findById(slotId);
    if (!slot) {
      return next(new AppError('Consultation slot not found', 404));
    }
    
    // Check if slot is available
    if (slot.status !== 'available' || !slot.isAvailable) {
      return next(new AppError('This slot is not available for booking', 400));
    }
    
    // Check if slot is in the past
    const slotDateTime = new Date(slot.date);
    const [hours, minutes] = slot.startTime.split(':').map(Number);
    slotDateTime.setHours(hours, minutes, 0, 0);
    
    if (slotDateTime < new Date()) {
      return next(new AppError('Cannot book slots in the past', 400));
    }
    
    // Check current booking count
    const currentBookings = await ConsultationBooking.countDocuments({
      slotId: slot._id,
      status: { $nin: ['cancelled'] }
    });
    
    if (currentBookings >= slot.maxBookings) {
      return next(new AppError('This slot is fully booked', 400));
    }
    
    // Generate Google Meet link
    const meetingLink = generateGoogleMeetLink();
    
    // Create booking with confirmed status
    const booking = await ConsultationBooking.create({
      slotId: slot._id,
      userName: userName.trim(),
      userEmail: userEmail.toLowerCase().trim(),
      userPhone: userPhone.trim(),
      message: message?.trim() || null,
      status: 'confirmed',
      confirmedAt: new Date(),
      meetingLink: meetingLink
    });
    
    // Update slot status if fully booked
    if (currentBookings + 1 >= slot.maxBookings) {
      slot.status = 'booked';
      await slot.save();
    }
    
    // Populate slot details
    await booking.populate('slotId');
    
    logger.info(`Consultation booking created: ${booking._id} for slot: ${slotId}`);
    
    // Send emails (non-blocking - don't wait for them)
    Promise.all([
      // Send booking receipt to user
      sendBookingReceiptEmail(booking),
      // Send notification to admins
      (async () => {
        try {
          // Find users with superuser or project manager roles
          const superuserRole = await Role.findOne({ rolename: 'superuser' });
          const projectManagerRole = await Role.findOne({ rolename: 'project manager' });
          
          const roleIds = [];
          if (superuserRole) roleIds.push(superuserRole._id);
          if (projectManagerRole) roleIds.push(projectManagerRole._id);
          
          if (roleIds.length > 0) {
            const userRoles = await UserRole.find({ roleId: { $in: roleIds } }).populate({
              path: 'userId',
              select: 'email isDeleted',
              match: { isDeleted: { $ne: true } }
            });
            const adminEmails = userRoles
              .map(ur => {
                const user = ur.userId;
                if (user && typeof user === 'object' && user.email) {
                  return user.email;
                }
                return null;
              })
              .filter(email => email && typeof email === 'string');
            
            if (adminEmails.length > 0) {
              await sendAdminNotificationEmail(booking, adminEmails);
            }
          }
        } catch (error) {
          logger.error('Failed to send admin notifications', { error: error.message });
        }
      })()
    ]).catch(error => {
      logger.error('Email sending error (non-blocking)', { error: error.message });
    });
    
    res.status(201).json({
      success: true,
      message: 'Consultation booked successfully',
      data: booking
    });
  } catch (error) {
    logger.error('Book consultation error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to book consultation', 500));
  }
};

/**
 * Get booking details by ID
 */
const getBookingDetails = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    
    const booking = await ConsultationBooking.findById(bookingId).populate('slotId');
    
    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }
    
    res.status(200).json({
      success: true,
      message: 'Booking details fetched successfully',
      data: booking
    });
  } catch (error) {
    logger.error('Get booking details error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to fetch booking details', 500));
  }
};

/**
 * Cancel booking (user can cancel their own booking)
 */
const cancelBooking = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { userEmail } = req.body; // User must provide email to verify
    
    if (!userEmail) {
      return next(new AppError('Email is required to cancel booking', 400));
    }
    
    const booking = await ConsultationBooking.findById(bookingId).populate('slotId');
    
    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }
    
    // Verify email matches
    if (booking.userEmail.toLowerCase() !== userEmail.toLowerCase().trim()) {
      return next(new AppError('Email does not match this booking', 403));
    }
    
    // Check if already cancelled or completed
    if (booking.status === 'cancelled') {
      return next(new AppError('Booking is already cancelled', 400));
    }
    
    if (booking.status === 'completed') {
      return next(new AppError('Cannot cancel a completed consultation', 400));
    }
    
    // Update booking
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancelledBy = 'user';
    await booking.save();
    
    // Update slot status if needed
    const slot = await ConsultationSlot.findById(booking.slotId._id);
    if (slot && slot.status === 'booked') {
      // Check if there are still active bookings
      const activeBookings = await ConsultationBooking.countDocuments({
        slotId: slot._id,
        status: { $nin: ['cancelled'] }
      });
      
      if (activeBookings < slot.maxBookings) {
        slot.status = 'available';
        await slot.save();
      }
    }
    
    logger.info(`Booking cancelled: ${bookingId} by user`);
    
    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: booking
    });
  } catch (error) {
    logger.error('Cancel booking error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to cancel booking', 500));
  }
};

// ==================== ADMIN METHODS ====================

/**
 * Admin: List all slots with pagination and filters
 */
const adminListSlots = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    
    const { status, startDate, endDate, isAvailable } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (isAvailable !== undefined) filter.isAvailable = isAvailable === 'true';
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = normalizeDate(startDate);
      if (endDate) filter.date.$lte = normalizeDate(endDate);
    }
    
    const slots = await ConsultationSlot.find(filter)
      .populate('createdBy', 'name email')
      .sort({ date: -1, startTime: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Get booking counts
    const slotIds = slots.map(s => s._id);
    const bookingCounts = await ConsultationBooking.aggregate([
      {
        $match: {
          slotId: { $in: slotIds },
          status: { $nin: ['cancelled'] }
        }
      },
      {
        $group: {
          _id: '$slotId',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const bookingCountMap = {};
    bookingCounts.forEach(bc => {
      bookingCountMap[bc._id.toString()] = bc.count;
    });
    
    const slotsWithCounts = slots.map(slot => ({
      ...slot,
      bookingCount: bookingCountMap[slot._id.toString()] || 0
    }));
    
    const total = await ConsultationSlot.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      message: 'Slots fetched successfully',
      data: {
        items: slotsWithCounts,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Admin list slots error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to fetch slots', 500));
  }
};

/**
 * Admin: Get a single slot by ID
 */
const adminGetSlot = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { slotId } = req.params;
    
    const slot = await ConsultationSlot.findById(slotId)
      .populate('createdBy', 'name email')
      .lean();
    
    if (!slot) {
      return next(new AppError('Slot not found', 404));
    }
    
    // Get booking count
    const bookingCount = await ConsultationBooking.countDocuments({
      slotId: slot._id,
      status: { $nin: ['cancelled'] }
    });
    
    const slotWithCount = {
      ...slot,
      bookingCount
    };
    
    res.status(200).json({
      success: true,
      message: 'Slot fetched successfully',
      data: slotWithCount
    });
  } catch (error) {
    logger.error('Admin get slot error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to fetch slot', 500));
  }
};

/**
 * Admin: Create a new slot
 */
const adminCreateSlot = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { date, startTime, duration = 30, maxBookings = 1, notes, status = 'available' } = req.body;
    
    // Validate required fields
    if (!date || !startTime) {
      return next(new AppError('Date and startTime are required', 400));
    }
    
    // Validate date is not in the past
    const slotDate = normalizeDate(date);
    const today = normalizeDate(new Date());
    if (slotDate < today) {
      return next(new AppError('Cannot create slots in the past', 400));
    }
    
    // Validate time format
    if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(startTime)) {
      return next(new AppError('Start time must be in HH:MM format', 400));
    }
    
    // Calculate end time
    const endTime = calculateEndTime(startTime, duration);
    
    // Check for time conflicts (convert times to comparable format)
    const allSlotsSameDate = await ConsultationSlot.find({
      date: slotDate,
      status: { $ne: 'cancelled' }
    }).lean();
    
    const conflictingSlot = allSlotsSameDate.find(existingSlot => {
      return timeRangesOverlap(startTime, endTime, existingSlot.startTime, existingSlot.endTime);
    });
    
    if (conflictingSlot) {
      return next(new AppError('Time slot conflicts with an existing slot', 400));
    }
    
    // Create slot
    const slot = await ConsultationSlot.create({
      date: slotDate,
      startTime: startTime.trim(),
      endTime,
      duration: Number(duration),
      maxBookings: Number(maxBookings),
      notes: notes?.trim() || null,
      status,
      isAvailable: status === 'available',
      createdBy: req.user._id
    });
    
    await slot.populate('createdBy', 'name email');
    
    logger.info(`Consultation slot created: ${slot._id} by user: ${req.user._id}`);
    
    res.status(201).json({
      success: true,
      message: 'Slot created successfully',
      data: slot
    });
  } catch (error) {
    logger.error('Admin create slot error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to create slot', 500));
  }
};

/**
 * Admin: Update a slot
 */
const adminUpdateSlot = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { slotId } = req.params;
    const { date, startTime, duration, maxBookings, notes, status, isAvailable } = req.body;
    
    const slot = await ConsultationSlot.findById(slotId);
    if (!slot) {
      return next(new AppError('Slot not found', 404));
    }
    
    // Check if slot has bookings (some fields cannot be changed)
    const bookingCount = await ConsultationBooking.countDocuments({
      slotId: slot._id,
      status: { $nin: ['cancelled'] }
    });
    
    if (bookingCount > 0) {
      // If there are bookings, only allow certain updates
      if (date !== undefined || startTime !== undefined || duration !== undefined) {
        return next(new AppError('Cannot change date, startTime, or duration for slots with existing bookings', 400));
      }
    }
    
    // Update fields
    if (date !== undefined) {
      const slotDate = normalizeDate(date);
      const today = normalizeDate(new Date());
      if (slotDate < today) {
        return next(new AppError('Cannot set date in the past', 400));
      }
      slot.date = slotDate;
    }
    
    if (startTime !== undefined) {
      if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(startTime)) {
        return next(new AppError('Start time must be in HH:MM format', 400));
      }
      slot.startTime = startTime.trim();
    }
    
    if (duration !== undefined) {
      slot.duration = Number(duration);
    }
    
    // Recalculate end time if startTime or duration changed
    if (startTime !== undefined || duration !== undefined) {
      slot.endTime = calculateEndTime(slot.startTime, slot.duration);
      
      // Check for time conflicts (exclude current slot)
      const allSlotsSameDate = await ConsultationSlot.find({
        _id: { $ne: slot._id },
        date: slot.date,
        status: { $ne: 'cancelled' }
      }).lean();
      
      const conflictingSlot = allSlotsSameDate.find(existingSlot => {
        return timeRangesOverlap(slot.startTime, slot.endTime, existingSlot.startTime, existingSlot.endTime);
      });
      
      if (conflictingSlot) {
        return next(new AppError('Updated time slot conflicts with an existing slot', 400));
      }
    }
    
    if (maxBookings !== undefined) {
      const newMaxBookings = Number(maxBookings);
      if (newMaxBookings < bookingCount) {
        return next(new AppError(`Cannot set maxBookings less than current booking count (${bookingCount})`, 400));
      }
      slot.maxBookings = newMaxBookings;
    }
    
    if (notes !== undefined) {
      slot.notes = notes?.trim() || null;
    }
    
    if (status !== undefined) {
      slot.status = status;
      // Update isAvailable based on status
      slot.isAvailable = status === 'available';
    }
    
    if (isAvailable !== undefined) {
      slot.isAvailable = isAvailable;
    }
    
    await slot.save();
    await slot.populate('createdBy', 'name email');
    
    logger.info(`Slot updated: ${slotId} by user: ${req.user._id}`);
    
    res.status(200).json({
      success: true,
      message: 'Slot updated successfully',
      data: slot
    });
  } catch (error) {
    logger.error('Admin update slot error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to update slot', 500));
  }
};

/**
 * Admin: Delete a slot
 */
const adminDeleteSlot = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { slotId } = req.params;
    
    const slot = await ConsultationSlot.findById(slotId);
    if (!slot) {
      return next(new AppError('Slot not found', 404));
    }
    
    // Check if slot has bookings
    const bookingCount = await ConsultationBooking.countDocuments({
      slotId: slot._id,
      status: { $nin: ['cancelled'] }
    });
    
    if (bookingCount > 0) {
      return next(new AppError('Cannot delete slot with existing bookings. Please cancel bookings first.', 400));
    }
    
    await ConsultationSlot.findByIdAndDelete(slotId);
    
    logger.info(`Slot deleted: ${slotId} by user: ${req.user._id}`);
    
    res.status(200).json({
      success: true,
      message: 'Slot deleted successfully'
    });
  } catch (error) {
    logger.error('Admin delete slot error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to delete slot', 500));
  }
};

/**
 * Admin: Create multiple slots in bulk
 */
const adminCreateBulkSlots = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { startDate, endDate, startTime, endTime, interval, duration = 30, maxBookings = 1, notes } = req.body;
    
    // Validate required fields
    if (!startDate || !endDate || !startTime || !endTime || !interval) {
      return next(new AppError('startDate, endDate, startTime, endTime, and interval are required', 400));
    }
    
    // Validate time formats
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return next(new AppError('Start time and end time must be in HH:MM format', 400));
    }
    
    const start = normalizeDate(startDate);
    const end = normalizeDate(endDate);
    
    if (start > end) {
      return next(new AppError('Start date must be before or equal to end date', 400));
    }
    
    if (start < normalizeDate(new Date())) {
      return next(new AppError('Cannot create slots in the past', 400));
    }
    
    // Convert times to minutes for comparison
    const timeToMinutes = (time) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };
    
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    
    if (startMinutes >= endMinutes) {
      return next(new AppError('Start time must be before end time', 400));
    }
    
    const slots = [];
    const currentDate = new Date(start);
    
    while (currentDate <= end) {
      let currentTimeMinutes = startMinutes;
      
      while (currentTimeMinutes + duration <= endMinutes) {
        const slotStartTime = `${Math.floor(currentTimeMinutes / 60).toString().padStart(2, '0')}:${(currentTimeMinutes % 60).toString().padStart(2, '0')}`;
        const slotEndTime = calculateEndTime(slotStartTime, duration);
        
        slots.push({
          date: new Date(currentDate),
          startTime: slotStartTime,
          endTime: slotEndTime,
          duration: Number(duration),
          maxBookings: Number(maxBookings),
          notes: notes?.trim() || null,
          status: 'available',
          isAvailable: true,
          createdBy: req.user._id,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        currentTimeMinutes += interval;
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Check for conflicts before inserting (group by date for efficiency)
    const dateGroups = {};
    slots.forEach(slot => {
      const dateKey = slot.date.toISOString().split('T')[0];
      if (!dateGroups[dateKey]) dateGroups[dateKey] = [];
      dateGroups[dateKey].push(slot);
    });
    
    for (const [dateKey, dateSlots] of Object.entries(dateGroups)) {
      const existingSlots = await ConsultationSlot.find({
        date: new Date(dateKey),
        status: { $ne: 'cancelled' }
      }).lean();
      
      for (const slot of dateSlots) {
        const conflictingSlot = existingSlots.find(existing => {
          return timeRangesOverlap(slot.startTime, slot.endTime, existing.startTime, existing.endTime);
        });
        
        if (conflictingSlot) {
          return next(new AppError(`Slot conflict detected at ${dateKey} ${slot.startTime}. Please resolve conflicts first.`, 400));
        }
      }
    }
    
    // Insert all slots
    const createdSlots = await ConsultationSlot.insertMany(slots);
    
    logger.info(`Bulk slots created: ${createdSlots.length} slots by user: ${req.user._id}`);
    
    res.status(201).json({
      success: true,
      message: `${createdSlots.length} slots created successfully`,
      data: createdSlots
    });
  } catch (error) {
    logger.error('Admin create bulk slots error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to create bulk slots', 500));
  }
};

/**
 * Admin: Create multiple slots for a single date
 */
const adminCreateMultipleSlots = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { date, slots } = req.body;
    
    // Validate required fields
    if (!date || !slots || !Array.isArray(slots) || slots.length === 0) {
      return next(new AppError('Date and slots array are required', 400));
    }
    
    const slotDate = normalizeDate(date);
    const today = normalizeDate(new Date());
    if (slotDate < today) {
      return next(new AppError('Cannot create slots in the past', 400));
    }
    
    // Validate all slots
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    const slotData = [];
    const errors = [];
    
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      
      if (!slot.startTime) {
        errors.push(`Slot ${i + 1}: Start time is required`);
        continue;
      }
      
      if (!timeRegex.test(slot.startTime)) {
        errors.push(`Slot ${i + 1}: Start time must be in HH:MM format`);
        continue;
      }
      
      const duration = slot.duration || 30;
      if (duration < 15 || duration > 480) {
        errors.push(`Slot ${i + 1}: Duration must be between 15 and 480 minutes`);
        continue;
      }
      
      const endTime = calculateEndTime(slot.startTime, duration);
      slotData.push({
        date: slotDate,
        startTime: slot.startTime.trim(),
        endTime,
        duration: Number(duration),
        maxBookings: Number(slot.maxBookings || 1),
        notes: slot.notes?.trim() || null,
        status: slot.status || 'available',
        isAvailable: (slot.status || 'available') === 'available',
        createdBy: req.user._id
      });
    }
    
    if (errors.length > 0) {
      return next(new AppError(`Validation errors: ${errors.join('; ')}`, 400));
    }
    
    // Check for conflicts with existing slots
    const existingSlots = await ConsultationSlot.find({
      date: slotDate,
      status: { $ne: 'cancelled' }
    }).lean();
    
    const conflicts = [];
    for (let i = 0; i < slotData.length; i++) {
      const slot = slotData[i];
      const conflictingSlot = existingSlots.find(existing => {
        return timeRangesOverlap(slot.startTime, slot.endTime, existing.startTime, existing.endTime);
      });
      
      if (conflictingSlot) {
        conflicts.push({
          index: i,
          startTime: slot.startTime,
          conflictingTime: `${conflictingSlot.startTime} - ${conflictingSlot.endTime}`
        });
      }
    }
    
    // Check for conflicts within the new slots themselves
    for (let i = 0; i < slotData.length; i++) {
      for (let j = i + 1; j < slotData.length; j++) {
        if (timeRangesOverlap(
          slotData[i].startTime, slotData[i].endTime,
          slotData[j].startTime, slotData[j].endTime
        )) {
          conflicts.push({
            index: i,
            startTime: slotData[i].startTime,
            conflictingTime: `${slotData[j].startTime} - ${slotData[j].endTime} (in your list)`
          });
        }
      }
    }
    
    if (conflicts.length > 0) {
      const conflictMessages = conflicts.map(c => 
        `Slot at ${c.startTime} conflicts with ${c.conflictingTime}`
      ).join('; ');
      return next(new AppError(`Time conflicts detected: ${conflictMessages}`, 400));
    }
    
    // Create all slots
    const createdSlots = await ConsultationSlot.insertMany(slotData);
    
    logger.info(`Multiple slots created: ${createdSlots.length} slots for date ${date} by user: ${req.user._id}`);
    
    res.status(201).json({
      success: true,
      message: `${createdSlots.length} slots created successfully`,
      data: createdSlots
    });
  } catch (error) {
    logger.error('Admin create multiple slots error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to create slots', 500));
  }
};

/**
 * Admin: List all bookings
 */
const adminListBookings = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    
    const { status, slotId, startDate, endDate, userEmail } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (slotId) filter.slotId = slotId;
    if (userEmail) filter.userEmail = userEmail.toLowerCase().trim();
    
    // Filter by slot date range
    if (startDate || endDate) {
      const slotFilter = {};
      if (startDate) slotFilter.$gte = normalizeDate(startDate);
      if (endDate) slotFilter.$lte = normalizeDate(endDate);
      
      const slotsInRange = await ConsultationSlot.find({ date: slotFilter }).select('_id').lean();
      const slotIds = slotsInRange.map(s => s._id);
      filter.slotId = { $in: slotIds };
    }
    
    const bookings = await ConsultationBooking.find(filter)
      .populate('slotId')
      .populate('confirmedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await ConsultationBooking.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      message: 'Bookings fetched successfully',
      data: {
        items: bookings,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Admin list bookings error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to fetch bookings', 500));
  }
};

/**
 * Admin: Get booking details
 */
const adminGetBooking = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { bookingId } = req.params;
    
    const booking = await ConsultationBooking.findById(bookingId)
      .populate('slotId')
      .populate('confirmedBy', 'name email');
    
    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }
    
    res.status(200).json({
      success: true,
      message: 'Booking details fetched successfully',
      data: booking
    });
  } catch (error) {
    logger.error('Admin get booking error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to fetch booking details', 500));
  }
};

/**
 * Admin: Update booking
 */
const adminUpdateBooking = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { bookingId } = req.params;
    const { status, meetingLink, message } = req.body;
    
    const booking = await ConsultationBooking.findById(bookingId).populate('slotId');
    
    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }
    
    if (status !== undefined) {
      const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
      if (!validStatuses.includes(status)) {
        return next(new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400));
      }
      
      // Handle status transitions
      if (status === 'confirmed' && booking.status !== 'confirmed') {
        booking.confirmedAt = new Date();
        booking.confirmedBy = req.user._id;
      }
      
      if (status === 'cancelled' && booking.status !== 'cancelled') {
        booking.cancelledAt = new Date();
        booking.cancelledBy = 'admin';
      }
      
      booking.status = status;
    }
    
    if (meetingLink !== undefined) {
      booking.meetingLink = meetingLink?.trim() || null;
    }
    
    if (message !== undefined) {
      booking.message = message?.trim() || null;
    }
    
    await booking.save();
    
    // Update slot status if needed
    if (booking.status === 'cancelled') {
      const slot = await ConsultationSlot.findById(booking.slotId._id);
      if (slot && slot.status === 'booked') {
        const activeBookings = await ConsultationBooking.countDocuments({
          slotId: slot._id,
          status: { $nin: ['cancelled'] }
        });
        
        if (activeBookings < slot.maxBookings) {
          slot.status = 'available';
          await slot.save();
        }
      }
    }
    
    await booking.populate('slotId');
    await booking.populate('confirmedBy', 'name email');
    
    logger.info(`Booking updated: ${bookingId} by user: ${req.user._id}`);
    
    res.status(200).json({
      success: true,
      message: 'Booking updated successfully',
      data: booking
    });
  } catch (error) {
    logger.error('Admin update booking error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to update booking', 500));
  }
};

module.exports = {
  // Public methods
  getAvailableSlots,
  bookConsultation,
  getBookingDetails,
  cancelBooking,
  
  // Admin methods
  adminListSlots,
  adminGetSlot,
  adminCreateSlot,
  adminUpdateSlot,
  adminDeleteSlot,
  adminCreateBulkSlots,
  adminCreateMultipleSlots,
  adminListBookings,
  adminGetBooking,
  adminUpdateBooking
};

