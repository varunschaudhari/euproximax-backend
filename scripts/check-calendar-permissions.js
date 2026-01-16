/**
 * Script to check if calendar is properly shared with service account
 * Run with: node scripts/check-calendar-permissions.js
 */

require('dotenv').config();
const { verifyCalendarAccess, initializeCalendarClient } = require('../utils/googleCalendar');
const { google } = require('googleapis');
const config = require('../utils/config');
const logger = require('../utils/logger');

async function checkCalendarPermissions() {
  console.log('\n=== Google Calendar Permissions Check ===\n');

  try {
    // Verify basic access
    console.log('1. Checking calendar access...');
    const accessInfo = await verifyCalendarAccess();
    console.log('   ✓ Calendar is accessible');
    console.log(`   Calendar: ${accessInfo.summary}`);
    console.log(`   Calendar ID: ${accessInfo.calendarId}`);
    console.log(`   Timezone: ${accessInfo.timeZone}`);
    
    // Try to get calendar ACL (Access Control List)
    console.log('\n2. Checking calendar permissions...');
    const client = await initializeCalendarClient();
    const { googleCalendar } = config;
    
    try {
      const aclResponse = await client.acl.list({
        calendarId: googleCalendar.calendarId || 'primary'
      });
      
      const serviceAccountEmail = googleCalendar.serviceAccountEmail;
      const serviceAccountAcl = aclResponse.data.items?.find(
        item => item.scope?.value === serviceAccountEmail
      );
      
      if (serviceAccountAcl) {
        console.log(`   ✓ Service account found in calendar permissions`);
        console.log(`   Role: ${serviceAccountAcl.role}`);
        console.log(`   Scope: ${serviceAccountAcl.scope.value}`);
        
        if (serviceAccountAcl.role === 'owner' || serviceAccountAcl.role === 'writer') {
          console.log('\n   ✅ Service account has sufficient permissions!');
          console.log('   The Meet link should be generated when creating events.');
        } else {
          console.log('\n   ⚠️  WARNING: Service account has limited permissions');
          console.log(`   Current role: ${serviceAccountAcl.role}`);
          console.log('   Required: "owner" or "writer" for Meet link generation');
          console.log('\n   To fix:');
          console.log('   1. Open Google Calendar');
          console.log('   2. Go to calendar settings');
          console.log('   3. Share with: ' + serviceAccountEmail);
          console.log('   4. Set permission to "Make changes to events"');
        }
      } else {
        console.log(`   ✗ Service account NOT found in calendar permissions`);
        console.log(`   Service account: ${serviceAccountEmail}`);
        console.log('\n   ❌ This is why Meet links are not being generated!');
        console.log('\n   SOLUTION:');
        console.log('   1. Open Google Calendar: https://calendar.google.com');
        console.log('   2. Find your calendar in the left sidebar');
        console.log('   3. Click the three dots (⋮) next to the calendar name');
        console.log('   4. Select "Settings and sharing"');
        console.log('   5. Scroll to "Share with specific people"');
        console.log('   6. Click "Add people"');
        console.log(`   7. Add: ${serviceAccountEmail}`);
        console.log('   8. Set permission to "Make changes to events" (or "Owner")');
        console.log('   9. Click "Send"');
        console.log('   10. Wait 2-3 minutes and run this check again');
      }
      
      // Show all calendar permissions for debugging
      if (aclResponse.data.items && aclResponse.data.items.length > 0) {
        console.log('\n3. All calendar permissions:');
        aclResponse.data.items.forEach((item, index) => {
          console.log(`   ${index + 1}. ${item.scope?.value || item.scope?.type || 'Unknown'}: ${item.role}`);
        });
      }
      
    } catch (aclError) {
      console.log(`   ⚠️  Could not check ACL (this is normal for some calendar types)`);
      console.log(`   Error: ${aclError.message}`);
      console.log('\n   The calendar might be a shared calendar or have restricted ACL access.');
      console.log('   Make sure the calendar owner has shared it with the service account.');
    }
    
    // Test creating a small event to see if Meet link is generated
    console.log('\n4. Testing Meet link generation...');
    const testStartTime = new Date();
    testStartTime.setMinutes(testStartTime.getMinutes() + 5);
    const testEndTime = new Date(testStartTime);
    testEndTime.setMinutes(testEndTime.getMinutes() + 15);
    
    try {
      const { createCalendarEventWithMeet } = require('../utils/googleCalendar');
      const result = await createCalendarEventWithMeet({
        startDateTime: testStartTime,
        endDateTime: testEndTime,
        summary: 'Permission Test - Can be deleted',
        description: 'This is a test event to check Meet link generation. You can delete it.',
        attendees: [],
        location: 'Google Meet',
        timezone: googleCalendar.timezone || 'Asia/Kolkata'
      });
      
      if (result.meetLink) {
        console.log('   ✅ SUCCESS! Meet link was generated!');
        console.log(`   Meet Link: ${result.meetLink}`);
        console.log(`   Event ID: ${result.eventId}`);
        console.log('\n   You can delete this test event from your calendar.');
      } else {
        console.log('   ✗ Meet link was NOT generated');
        console.log('   Event ID: ' + result.eventId);
        console.log('\n   This confirms the calendar sharing issue.');
        console.log('   Follow the sharing instructions above.');
      }
    } catch (testError) {
      console.log(`   ✗ Error creating test event: ${testError.message}`);
    }
    
    console.log('\n=== Check Complete ===\n');
    
  } catch (error) {
    console.log('\n❌ ERROR:', error.message);
    console.log('\nPossible issues:');
    console.log('1. Service account credentials are incorrect');
    console.log('2. Google Calendar API is not enabled');
    console.log('3. Calendar ID is incorrect');
    console.log('4. Network connectivity issues');
    process.exit(1);
  }
}

// Run the check
checkCalendarPermissions().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
