/**
 * Manual method to get OAuth2 refresh token
 * This script will guide you through getting the refresh token
 */

require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.log('\n❌ ERROR: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.\n');
  console.log('Set them in your .env file before running this script:\n');
  console.log('GOOGLE_CLIENT_ID=your-client-id');
  console.log('GOOGLE_CLIENT_SECRET=your-client-secret\n');
  process.exit(1);
}
const REDIRECT_URI = 'http://localhost:3000/auth/google/callback'; // Must match OAuth client redirect URI

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const scopes = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent'
});

console.log('\n=== Manual OAuth2 Refresh Token Generator ===\n');
console.log('STEP 1: Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nSTEP 2: Sign in with your Google account (euproximax@gmail.com)');
console.log('STEP 3: Click "Allow" to grant permissions');
console.log('STEP 4: After authorization, you may see a redirect error page (server not running)');
console.log('        Copy the "code" value from the URL and paste it below\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter the authorization code: ', (code) => {
  rl.close();
  
  oauth2Client.getToken(code.trim(), (err, token) => {
    if (err) {
      console.error('\n❌ Error:', err.message);
      if (err.message.includes('invalid_grant')) {
        console.log('\nThe code may have expired. Please try again with a fresh code.');
      }
      process.exit(1);
    }
    
    if (!token.refresh_token) {
      console.log('\n⚠️  No refresh token received.');
      console.log('This usually means you\'ve already authorized this app.');
      console.log('Try revoking access at: https://myaccount.google.com/permissions');
      console.log('Then run this script again.\n');
      if (token.access_token) {
        console.log('Access token (temporary):', token.access_token.substring(0, 20) + '...');
      }
      process.exit(1);
    }
    
    console.log('\n✅ SUCCESS! Refresh token generated!\n');
    console.log('Add this to your .env file:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${token.refresh_token}\n`);
    console.log('After adding it, test with:');
    console.log('node scripts/test-google-calendar.js\n');
  });
});
