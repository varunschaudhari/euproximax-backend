const { google } = require('googleapis');
const logger = require('./logger');
const config = require('./config');

/**
 * Google Calendar API Service
 * Handles authentication and calendar event creation with Google Meet links
 */

let calendarClient = null;

/**
 * Initialize Google Calendar client
 * Supports both Service Account and OAuth2 authentication
 */
const initializeCalendarClient = async () => {
  if (calendarClient) {
    return calendarClient;
  }

  try {
    const { googleCalendar } = config;

    // Service Account Authentication (Recommended for server-to-server)
    if (googleCalendar.serviceAccountEmail && googleCalendar.privateKey) {
      // Parse the private key - handle both escaped \n and actual newlines
      let privateKey = googleCalendar.privateKey;
      
      // Remove surrounding quotes if present
      if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || 
          (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
        privateKey = privateKey.slice(1, -1);
      }
      
      // Replace escaped newlines with actual newlines
      // Handle both \\n (double escaped) and \n (single escaped)
      privateKey = privateKey.replace(/\\n/g, '\n');
      
      // Trim any extra whitespace
      privateKey = privateKey.trim();
      
      // Validate private key format
      if (!privateKey.includes('BEGIN PRIVATE KEY') || !privateKey.includes('END PRIVATE KEY')) {
        throw new Error('Invalid private key format. Must include BEGIN PRIVATE KEY and END PRIVATE KEY markers.');
      }
      
      // Create JWT auth - the key parameter must be the private key string
      const auth = new google.auth.JWT({
        email: googleCalendar.serviceAccountEmail,
        key: privateKey,
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events'
        ],
        subject: googleCalendar.delegateUser || null // Optional: delegate to a user account
      });

      // Ensure we get an access token
      try {
        await auth.authorize();
        logger.info('Google Calendar client initialized with Service Account - Access token obtained');
      } catch (authError) {
        logger.error('Failed to authorize service account', {
          error: authError.message,
          serviceAccountEmail: googleCalendar.serviceAccountEmail,
          privateKeyLength: privateKey.length,
          privateKeyStart: privateKey.substring(0, 30)
        });
        throw new Error(`Service account authorization failed: ${authError.message}. Check your private key format.`);
      }

      calendarClient = google.calendar({ version: 'v3', auth });
      return calendarClient;
    }

    // OAuth2 Authentication (Alternative method)
    if (googleCalendar.clientId && googleCalendar.clientSecret && googleCalendar.refreshToken) {
      const oauth2Client = new google.auth.OAuth2(
        googleCalendar.clientId,
        googleCalendar.clientSecret
      );

      oauth2Client.setCredentials({
        refresh_token: googleCalendar.refreshToken
      });

      calendarClient = google.calendar({ version: 'v3', auth: oauth2Client });
      logger.info('Google Calendar client initialized with OAuth2');
      return calendarClient;
    }

    throw new Error('Google Calendar credentials not configured. Please set up either Service Account or OAuth2 credentials in your .env file.');
  } catch (error) {
    const { googleCalendar: calConfig } = config;
    logger.error('Failed to initialize Google Calendar client', { 
      error: error.message,
      hasServiceAccount: !!calConfig?.serviceAccountEmail,
      hasPrivateKey: !!calConfig?.privateKey,
      hasOAuth2: !!(calConfig?.clientId && calConfig?.clientSecret && calConfig?.refreshToken)
    });
    throw error;
  }
};

/**
 * Create a calendar event with Google Meet link
 * @param {Object} eventData - Event details
 * @param {Date} eventData.startDateTime - Start date and time
 * @param {Date} eventData.endDateTime - End date and time
 * @param {string} eventData.summary - Event title
 * @param {string} eventData.description - Event description
 * @param {Array<string>} eventData.attendees - Array of attendee email addresses
 * @param {string} eventData.location - Optional location
 * @param {string} eventData.timezone - Timezone (default: 'Asia/Kolkata')
 * @returns {Promise<Object>} Created event with Meet link
 */
const createCalendarEventWithMeet = async (eventData) => {
  try {
    const client = await initializeCalendarClient();
    const { googleCalendar } = config;

    const {
      startDateTime,
      endDateTime,
      summary,
      description = '',
      attendees = [],
      location = '',
      timezone = eventData.timezone || googleCalendar.timezone || 'Asia/Kolkata'
    } = eventData;

    // Validate required fields
    if (!startDateTime || !endDateTime || !summary) {
      throw new Error('startDateTime, endDateTime, and summary are required');
    }

    // Format dates in RFC3339 format
    const startTime = new Date(startDateTime).toISOString();
    const endTime = new Date(endDateTime).toISOString();

    // Create event object
    const event = {
      summary,
      description,
      start: {
        dateTime: startTime,
        timeZone: timezone
      },
      end: {
        dateTime: endTime,
        timeZone: timezone
      },
      // Note: Service accounts cannot add attendees without domain-wide delegation
      // Attendees are optional - the Meet link will still be generated
      ...(attendees.length > 0 ? { attendees: attendees.map(email => ({ email })) } : {}),
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`
        }
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 15 } // 15 minutes before
        ]
      }
    };

    // Add location if provided
    if (location) {
      event.location = location;
    }

    // Create the event
    const response = await client.events.insert({
      calendarId: googleCalendar.calendarId || 'primary',
      conferenceDataVersion: 1, // Required to create Meet link
      requestBody: event
    });

    const createdEvent = response.data;

    // Extract Meet link from conference data or hangoutLink
    let meetLink = null;
    
    // Try to get from conferenceData first
    if (createdEvent.conferenceData?.entryPoints) {
      meetLink = createdEvent.conferenceData.entryPoints.find(
        entry => entry.entryPointType === 'video'
      )?.uri || null;
    }
    
    // Fallback to hangoutLink if conferenceData doesn't have it
    if (!meetLink && createdEvent.hangoutLink) {
      meetLink = createdEvent.hangoutLink;
    }

    if (!meetLink) {
      logger.warn('Google Meet link not found in created event', { 
        eventId: createdEvent.id,
        hasConferenceData: !!createdEvent.conferenceData,
        hasHangoutLink: !!createdEvent.hangoutLink,
        note: 'Make sure the calendar is shared with the service account: euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com'
      });
    }

    logger.info('Google Calendar event created successfully', {
      eventId: createdEvent.id,
      meetLink: meetLink ? 'generated' : 'missing'
    });

    return {
      eventId: createdEvent.id,
      meetLink: meetLink || createdEvent.hangoutLink || null,
      htmlLink: createdEvent.htmlLink,
      startTime: createdEvent.start.dateTime,
      endTime: createdEvent.end.dateTime,
      summary: createdEvent.summary
    };
  } catch (error) {
    let errorMessage = `Failed to create calendar event: ${error.message}`;
    
    // Provide more helpful error messages
    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      errorMessage += '. Make sure the calendar is shared with the service account email.';
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      errorMessage += '. Check your service account credentials and ensure Google Calendar API is enabled.';
    } else if (error.message.includes('Calendar not found')) {
      errorMessage += '. Verify the calendar ID is correct and the calendar is shared with the service account.';
    }
    
    const { googleCalendar: calConfig } = config;
    logger.error('Failed to create Google Calendar event', {
      error: error.message,
      errorCode: error.code,
      stack: error.stack,
      calendarId: calConfig?.calendarId || 'primary'
    });
    
    throw new Error(errorMessage);
  }
};

/**
 * Update an existing calendar event
 * @param {string} eventId - Google Calendar event ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated event
 */
const updateCalendarEvent = async (eventId, updates) => {
  try {
    const client = initializeCalendarClient();
    const { googleCalendar } = config;

    const response = await client.events.patch({
      calendarId: googleCalendar.calendarId || 'primary',
      eventId,
      requestBody: updates
    });

    logger.info('Google Calendar event updated', { eventId });
    return response.data;
  } catch (error) {
    logger.error('Failed to update Google Calendar event', {
      eventId,
      error: error.message
    });
    throw new Error(`Failed to update calendar event: ${error.message}`);
  }
};

/**
 * Delete a calendar event
 * @param {string} eventId - Google Calendar event ID
 * @returns {Promise<void>}
 */
const deleteCalendarEvent = async (eventId) => {
  try {
    const client = await initializeCalendarClient();
    const { googleCalendar } = config;

    await client.events.delete({
      calendarId: googleCalendar.calendarId || 'primary',
      eventId
    });

    logger.info('Google Calendar event deleted', { eventId });
  } catch (error) {
    logger.error('Failed to delete Google Calendar event', {
      eventId,
      error: error.message
    });
    throw new Error(`Failed to delete calendar event: ${error.message}`);
  }
};

/**
 * Get a calendar event by ID
 * @param {string} eventId - Google Calendar event ID
 * @returns {Promise<Object>} Event details
 */
const getCalendarEvent = async (eventId) => {
  try {
    const client = await initializeCalendarClient();
    const { googleCalendar } = config;

    const response = await client.events.get({
      calendarId: googleCalendar.calendarId || 'primary',
      eventId
    });

    return response.data;
  } catch (error) {
    logger.error('Failed to get Google Calendar event', {
      eventId,
      error: error.message
    });
    throw new Error(`Failed to get calendar event: ${error.message}`);
  }
};

module.exports = {
  createCalendarEventWithMeet,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  initializeCalendarClient
};

