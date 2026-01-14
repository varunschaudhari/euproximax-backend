/**
 * Script to generate OAuth2 refresh token for Google Calendar API
 * Run with: node scripts/generate-oauth-token.js
 * 
 * Make sure to set CLIENT_ID and CLIENT_SECRET in this file first,
 * or pass them as environment variables.
 */

require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');
const config = require('../utils/config');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || config.googleCalendar.clientId || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || config.googleCalendar.clientSecret || '';
const REDIRECT_URI = 'http://localhost:3000/auth/google/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.log('\n❌ ERROR: CLIENT_ID and CLIENT_SECRET are required!\n');
  console.log('Please set them in your .env file:');
  console.log('GOOGLE_CLIENT_ID=your-client-id');
  console.log('GOOGLE_CLIENT_SECRET=your-client-secret');
  console.log('\nOr get them from:');
  console.log('1. Go to https://console.cloud.google.com/');
  console.log('2. Select your project');
  console.log('3. Navigate to APIs & Services > Credentials');
  console.log('4. Create OAuth client ID (Web application)');
  console.log('5. Copy Client ID and Client Secret\n');
  process.exit(1);
}

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
  prompt: 'consent' // Force consent screen to get refresh token
});

console.log('\n=== Google OAuth2 Token Generator ===\n');
console.log('1. Authorize this app by visiting this URL:');
console.log('\n' + authUrl + '\n');
console.log('2. Sign in with your Google account (euproximax@gmail.com)');
console.log('3. Click "Allow" to grant permissions');
console.log('4. Copy the authorization code from the redirect URL');
console.log('   (It will look like: http://localhost:3000/auth/google/callback?code=...)');
console.log('   The code is the part after "code="\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter the authorization code here: ', (code) => {
  rl.close();
  
  oauth2Client.getToken(code.trim(), (err, token) => {
    if (err) {
      console.error('\n❌ Error retrieving access token:', err.message);
      if (err.message.includes('invalid_grant')) {
        console.log('\nPossible causes:');
        console.log('- The authorization code has expired (codes expire quickly)');
        console.log('- The code was already used');
        console.log('- The redirect URI doesn\'t match');
        console.log('\nPlease run this script again and use a fresh code.');
      }
      process.exit(1);
    }
    
    if (!token.refresh_token) {
      console.log('\n⚠️  WARNING: No refresh token received!');
      console.log('This usually means you\'ve already authorized this app before.');
      console.log('To get a new refresh token:');
      console.log('1. Go to https://myaccount.google.com/permissions');
      console.log('2. Find and revoke access for your app');
      console.log('3. Run this script again\n');
      
      if (token.access_token) {
        console.log('Access token received (but no refresh token):');
        console.log(token.access_token.substring(0, 20) + '...');
      }
      process.exit(1);
    }
    
    console.log('\n✅ SUCCESS! Refresh token generated!\n');
    console.log('Add these to your .env file:\n');
    console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${token.refresh_token}\n`);
    console.log('Then comment out or remove the service account credentials:');
    console.log('# GOOGLE_SERVICE_ACCOUNT_EMAIL=');
    console.log('# GOOGLE_PRIVATE_KEY=\n');
    console.log('After updating .env, test with:');
    console.log('node scripts/test-google-calendar.js\n');
  });
});
