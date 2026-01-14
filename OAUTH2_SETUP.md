# Google Calendar OAuth2 Setup Guide

## Why OAuth2 Instead of Service Account?

Service accounts **cannot generate Google Meet links** even with full owner permissions. This is a known Google Calendar API limitation.

OAuth2 user accounts can generate Meet links reliably.

## Setup Steps

### 1. Create OAuth2 Credentials in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: `steel-cairn-482717-e7`
3. Navigate to **APIs & Services** > **Credentials**
4. Click **+ CREATE CREDENTIALS** > **OAuth client ID**
5. If prompted, configure the OAuth consent screen:
   - User Type: **External** (unless you have Google Workspace)
   - App name: **EuProximaX Calendar Integration**
   - User support email: Your email
   - Developer contact: Your email
   - Click **Save and Continue**
   - Scopes: Add `https://www.googleapis.com/auth/calendar` and `https://www.googleapis.com/auth/calendar.events`
   - Click **Save and Continue**
   - Test users: Add your email (`euproximax@gmail.com`)
   - Click **Save and Continue**
6. Application type: **Web application**
7. Name: **EuProximaX Backend**
8. Authorized redirect URIs: 
   - `http://localhost:3000/auth/google/callback` (for testing)
   - `https://your-production-domain.com/auth/google/callback` (for production)
9. Click **Create**
10. Copy the **Client ID** and **Client Secret**

### 2. Generate Refresh Token

You need to generate a refresh token using the OAuth2 flow. Here's a quick script to do this:

**Option A: Use Google OAuth2 Playground (Easiest)**

1. Go to [Google OAuth2 Playground](https://developers.google.com/oauthplay
ground/)
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your **Client ID** and **Client Secret**
5. In the left panel, find **Calendar API v3**
6. Select these scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
7. Click **Authorize APIs**
8. Sign in with your Google account (`euproximax@gmail.com`)
9. Click **Allow**
10. Click **Exchange authorization code for tokens**
11. Copy the **Refresh token**

**Option B: Use Node.js Script (More Control)**

Create a file `scripts/generate-oauth-token.js` and run it:

```javascript
const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = 'YOUR_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'http://localhost:3000/auth/google/callback';

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

console.log('Authorize this app by visiting this url:', authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter the code from that page here: ', (code) => {
  rl.close();
  oauth2Client.getToken(code, (err, token) => {
    if (err) return console.error('Error retrieving access token', err);
    console.log('Refresh Token:', token.refresh_token);
    console.log('\nAdd these to your .env file:');
    console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${token.refresh_token}`);
  });
});
```

### 3. Update .env File

Add these to your `.env` file:

```env
# Google Calendar OAuth2 (Alternative to Service Account)
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REFRESH_TOKEN=your-refresh-token-here

# Keep service account config commented out or remove it
# GOOGLE_SERVICE_ACCOUNT_EMAIL=
# GOOGLE_PRIVATE_KEY=
```

### 4. Test the Integration

Run the test script:

```bash
node scripts/test-google-calendar.js
```

You should now see Meet links being generated! ✅

## Important Notes

1. **Refresh tokens don't expire** unless:
   - The user revokes access
   - The token hasn't been used for 6 months
   - The user changes their password (if using Gmail account)

2. **For Production**: Make sure to:
   - Add your production domain to authorized redirect URIs
   - Publish your OAuth app (if using external users)
   - Add all test users who need access

3. **Security**: Keep your refresh token secure! Never commit it to git.

## Troubleshooting

- **"Invalid grant" error**: The refresh token may have expired. Generate a new one.
- **"Access denied"**: Make sure you've added your email as a test user in OAuth consent screen.
- **Meet links still not generated**: Verify the scopes include `calendar.events` and try regenerating the refresh token with `prompt: 'consent'`.
