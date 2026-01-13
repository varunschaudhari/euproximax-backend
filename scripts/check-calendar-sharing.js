/**
 * Check if calendar is shared with service account
 * Run with: node scripts/check-calendar-sharing.js
 */

require('dotenv').config();
const { google } = require('googleapis');
const logger = require('../utils/logger');
const config = require('../utils/config');

async function checkCalendarSharing() {
  console.log('\n=== Checking Calendar Sharing Status ===\n');

  const { googleCalendar } = config;

  if (!googleCalendar.serviceAccountEmail || !googleCalendar.privateKey) {
    console.log('❌ Google Calendar credentials not configured');
    process.exit(1);
  }

  // Parse private key
  let privateKey = googleCalendar.privateKey;
  if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || 
      (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n').trim();

  try {
    const auth = new google.auth.JWT({
      email: googleCalendar.serviceAccountEmail,
      key: privateKey,
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.readonly'
      ]
    });

    await auth.authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    const calendarId = googleCalendar.calendarId || 'primary';

    console.log(`Checking calendar: ${calendarId}`);
    console.log(`Service account: ${googleCalendar.serviceAccountEmail}\n`);

    try {
      // Try to get calendar metadata
      const calendarInfo = await calendar.calendars.get({
        calendarId: calendarId
      });

      console.log('✅ Calendar found!');
      console.log(`   Name: ${calendarInfo.data.summary || 'Primary Calendar'}`);
      console.log(`   ID: ${calendarInfo.data.id}`);
      console.log(`   Timezone: ${calendarInfo.data.timeZone}\n`);

      // Try to list events (this will fail if calendar is not shared)
      try {
        const events = await calendar.events.list({
          calendarId: calendarId,
          maxResults: 1
        });
        console.log('✅ Calendar is accessible!');
        console.log(`   Found ${events.data.items?.length || 0} events\n`);
      } catch (listError) {
        if (listError.code === 404 || listError.message.includes('not found')) {
          console.log('❌ Calendar is NOT shared with the service account!');
          console.log('\nTo fix this:');
          console.log('1. Go to: https://calendar.google.com/calendar/r/settings');
          console.log('2. Click your calendar in the left sidebar');
          console.log('3. Scroll to "Share with specific people"');
          console.log('4. Click "+ Add people"');
          console.log(`5. Add: ${googleCalendar.serviceAccountEmail}`);
          console.log('6. Set permission to "Make changes to events"');
          console.log('7. Click "Send"\n');
        } else {
          throw listError;
        }
      }

      // Try to create a test event with Meet link
      console.log('Testing Meet link generation...\n');
      const testStartTime = new Date();
      testStartTime.setHours(testStartTime.getHours() + 1);
      const testEndTime = new Date(testStartTime);
      testEndTime.setMinutes(testEndTime.getMinutes() + 30);

      const testEvent = {
        summary: 'Test Meet Link Generation',
        start: {
          dateTime: testStartTime.toISOString(),
          timeZone: googleCalendar.timezone || 'Asia/Kolkata'
        },
        end: {
          dateTime: testEndTime.toISOString(),
          timeZone: googleCalendar.timezone || 'Asia/Kolkata'
        },
        conferenceData: {
          createRequest: {
            requestId: `test-${Date.now()}`
          }
        }
      };

      const createdEvent = await calendar.events.insert({
        calendarId: calendarId,
        conferenceDataVersion: 1,
        requestBody: testEvent
      });

      const meetLink = createdEvent.data.conferenceData?.entryPoints?.find(
        e => e.entryPointType === 'video'
      )?.uri || createdEvent.data.hangoutLink;

      if (meetLink) {
        console.log('✅ Google Meet link generated successfully!');
        console.log(`   Meet Link: ${meetLink}\n`);
        
        // Clean up test event
        await calendar.events.delete({
          calendarId: calendarId,
          eventId: createdEvent.data.id
        });
        console.log('✅ Test event cleaned up\n');
      } else {
        console.log('⚠️  Meet link was NOT generated');
        console.log('   This usually means the calendar is not properly shared\n');
      }

    } catch (error) {
      if (error.code === 404) {
        console.log('❌ Calendar not found or not accessible');
        console.log(`   Calendar ID: ${calendarId}`);
        console.log('\nPossible issues:');
        console.log('1. Calendar is not shared with the service account');
        console.log(`2. Calendar ID is incorrect (current: ${calendarId})`);
        console.log('\nTo share your calendar:');
        console.log('1. Go to: https://calendar.google.com/calendar/r/settings');
        console.log('2. Click your calendar in the left sidebar');
        console.log('3. Scroll to "Share with specific people"');
        console.log('4. Click "+ Add people"');
        console.log(`5. Add: ${googleCalendar.serviceAccountEmail}`);
        console.log('6. Set permission to "Make changes to events"');
        console.log('7. Click "Send"\n');
      } else {
        throw error;
      }
    }

  } catch (error) {
    console.log('❌ Error:', error.message);
    if (error.code === 401) {
      console.log('\nAuthentication failed. Check your private key format.');
    } else if (error.code === 403) {
      console.log('\nPermission denied. Make sure:');
      console.log('1. Google Calendar API is enabled');
      console.log('2. Calendar is shared with the service account');
    }
    process.exit(1);
  }
}

checkCalendarSharing().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});

