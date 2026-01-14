# Fix OAuth2 Access Blocked Error

## Problem
You're seeing "Access blocked: euproximax has not completed the Google verification process" because:
1. The OAuth app is in "Testing" mode
2. Your email (`euproximax@gmail.com`) is not added as a test user

## Solution: Add Test Users

### Step 1: Go to OAuth Consent Screen
1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: `steel-cairn-482717-e7`
3. Navigate to **APIs & Services** > **OAuth consent screen**

### Step 2: Add Test Users
1. Scroll down to the **Test users** section
2. Click **+ ADD USERS**
3. Add your email: `euproximax@gmail.com`
4. Click **ADD**
5. Click **SAVE** at the bottom of the page

## If You See "redirect_uri_mismatch"

You must add the redirect URI used by the script to your OAuth client.

1. Go to **APIs & Services** > **Credentials**
2. Click your OAuth Client ID
3. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/auth/google/callback`
4. Click **Save**

### Step 3: Try Again
1. Go back to the authorization URL
2. You should now be able to authorize the app
3. Complete the OAuth flow to get the refresh token

## Alternative: Use OAuth2 Playground (Easier)

If you continue having issues, use Google OAuth2 Playground instead:

1. Go to [Google OAuth2 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check **"Use your own OAuth credentials"**
4. Enter:
   - **OAuth Client ID**: `your-client-id`
   - **OAuth Client secret**: `your-client-secret`
5. In the left panel, find **Calendar API v3**
6. Select these scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
7. Click **Authorize APIs**
8. Sign in and click **Allow**
9. Click **Exchange authorization code for tokens**
10. Copy the **Refresh token** (starts with `1//` or similar)
11. Add it to your `.env` file:
    ```
    GOOGLE_REFRESH_TOKEN=your-refresh-token-here
    ```

## After Getting Refresh Token

1. Update your `.env` file with the refresh token
2. Test the integration:
   ```bash
   node scripts/test-google-calendar.js
   ```
3. You should now see Meet links being generated! ✅
