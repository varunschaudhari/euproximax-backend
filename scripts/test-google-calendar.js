/**
 * Test script to verify Google Calendar API integration
 * Run with: node scripts/test-google-calendar.js
 */

require('dotenv').config();
const { createCalendarEventWithMeet, verifyCalendarAccess } = require('../utils/googleCalendar');
const logger = require('../utils/logger');
const config = require('../utils/config');

async function testGoogleCalendar() {
  console.log('\n=== Google Calendar API Test ===\n');

  // Check configuration
  console.log('1. Checking configuration...');
  const { googleCalendar } = config;
  
  console.log(`   Service Account Email: ${googleCalendar.serviceAccountEmail ? '✓ Set' : '✗ Missing'}`);
  console.log(`   Private Key: ${googleCalendar.privateKey ? '✓ Set' : '✗ Missing'}`);
  console.log(`   Calendar ID: ${googleCalendar.calendarId || 'primary'}`);
  console.log(`   Timezone: ${googleCalendar.timezone || 'Asia/Kolkata'}`);

  if (!googleCalendar.serviceAccountEmail || !googleCalendar.privateKey) {
    console.log('\n❌ ERROR: Google Calendar credentials are not configured!');
    console.log('\nPlease add to your .env file:');
    console.log('GOOGLE_SERVICE_ACCOUNT_EMAIL=euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com');
    console.log('GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...your key...\\n-----END PRIVATE KEY-----\\n"');
    process.exit(1);
  }

  // Verify calendar access first
  console.log('\n2. Verifying calendar access...');
  try {
    const accessInfo = await verifyCalendarAccess();
    console.log('   ✓ Calendar access verified');
    console.log(`   Calendar: ${accessInfo.summary}`);
    console.log(`   Timezone: ${accessInfo.timeZone}`);
    console.log(`   Access Role: ${accessInfo.accessRole}`);
    console.log(`   Service Account: ${accessInfo.serviceAccountEmail}`);
    
    if (accessInfo.accessRole !== 'owner' && accessInfo.accessRole !== 'writer') {
      console.log('\n⚠️  WARNING: Service account may not have sufficient permissions.');
      console.log('   Required: "Make changes to events" or "Owner" permission');
    }
  } catch (error) {
    console.log(`   ✗ ${error.message}`);
    console.log('\n❌ Cannot proceed with event creation test.');
    console.log('   Please fix the calendar access issue first.');
    process.exit(1);
  }

  // Test creating a calendar event
  console.log('\n3. Testing calendar event creation...');
  
  const testStartTime = new Date();
  testStartTime.setHours(testStartTime.getHours() + 1); // 1 hour from now
  const testEndTime = new Date(testStartTime);
  testEndTime.setMinutes(testEndTime.getMinutes() + 30); // 30 minutes duration

  try {
    const result = await createCalendarEventWithMeet({
      startDateTime: testStartTime,
      endDateTime: testEndTime,
      summary: 'Test Consultation - Google Calendar API',
      description: 'This is a test event to verify Google Calendar API integration.',
      attendees: [], // Service accounts cannot invite attendees without domain-wide delegation
      location: 'Google Meet',
      timezone: googleCalendar.timezone || 'Asia/Kolkata'
    });

    console.log('\n✅ SUCCESS! Calendar event created successfully!');
    console.log(`   Event ID: ${result.eventId}`);
    console.log(`   Meet Link: ${result.meetLink || 'Not generated'}`);
    console.log(`   Calendar Link: ${result.htmlLink}`);
    console.log(`   Start Time: ${result.startTime}`);
    console.log(`   End Time: ${result.endTime}`);

    if (result.meetLink) {
      console.log('\n✅ Google Meet link generated successfully!');
      console.log(`   You can test it at: ${result.meetLink}`);
    } else {
      console.log('\n⚠️  WARNING: Google Meet link was not generated.');
      console.log('   This might be because:');
      console.log('   - The calendar is not shared with the service account');
      console.log(`   - Share your calendar with: ${googleCalendar.serviceAccountEmail}`);
      console.log('   - Google Calendar API is not enabled');
      console.log('   - Domain-wide delegation is not set up');
    }

    console.log('\n✅ Test completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Check your Google Calendar to see the test event');
    if (!result.meetLink) {
      console.log('\n2. To fix missing Meet link:');
      console.log('   a. Open Google Calendar (https://calendar.google.com)');
      console.log('   b. Find your calendar in the left sidebar');
      console.log('   c. Click the three dots (⋮) next to the calendar name');
      console.log('   d. Select "Settings and sharing"');
      console.log('   e. Scroll to "Share with specific people"');
      console.log('   f. Click "Add people"');
      console.log(`   g. Add: ${googleCalendar.serviceAccountEmail}`);
      console.log('   h. Set permission to "Make changes to events"');
      console.log('   i. Click "Send"');
      console.log('   j. Wait a few minutes and run this test again');
    }
    console.log('\n3. Make sure Google Calendar API is enabled in Google Cloud Console');
    
  } catch (error) {
    console.log('\n❌ ERROR: Failed to create calendar event');
    console.log(`   Error: ${error.message}`);
    
    const { googleCalendar } = config;
    
    if (error.message.includes('credentials')) {
      console.log('\nPossible issues:');
      console.log('1. Private key is incorrect or not properly formatted');
      console.log('2. Service account email is incorrect');
      console.log('3. Google Calendar API is not enabled');
    } else if (error.message.includes('Calendar not found') || error.message.includes('403')) {
      console.log('\nPossible issues:');
      console.log('1. Calendar is not shared with the service account');
      console.log(`   Share your calendar with: ${googleCalendar.serviceAccountEmail}`);
      console.log('2. Service account does not have permission to create events');
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.log('\nPossible issues:');
      console.log('1. Private key is incorrect');
      console.log('2. Service account credentials are invalid');
      console.log('3. Google Calendar API is not enabled');
    }

    console.log('\nFor detailed setup instructions, see: GOOGLE_CALENDAR_SETUP.md');
    process.exit(1);
  }
}

// Run the test
testGoogleCalendar().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});

