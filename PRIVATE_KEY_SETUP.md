# Setting Up Google Calendar Private Key in .env

The most common issue is that the private key is not properly formatted in your `.env` file.

## The Problem

When you copy the `private_key` from the JSON file, it contains actual newlines. In the `.env` file, these need to be represented as `\n` (escaped newlines).

## Solution

### Option 1: Single Line with Escaped Newlines (Recommended)

In your `.env` file, put the entire private key on ONE line with `\n` where newlines should be:

```env
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCfJDo2Wae+9KrE\nNMGYs//c0XUAVvtRBR36+PHFdB/yxj0fPPu3fQHHMSTLA7oxaG5pn7MV29W42cn7\nGCqdKerIO2FjPDmp4cSk+fOS4lw8hhRn7hk/eRN96AoC8Oksi7y2oJ7uPZseZyhG\njVkmHkSD3n1mPq2re0Xw0UFqqBDIlzsDzPQL6bJmo7OdqF9UK0U2+i+1jU9An2Ek\nhcuS4NLxoBJHqvDP7uoErjGiT3/gNG+bibychDpKYWhm/9gwr6w3pr7Drh4UiaaZ\nZc91WM2ovJNAOkfsOayPj1uWcY9wK76t3x0wmFmBjUaJQ03lyxrJEBXbY+NtfSmL\nzuW19JUpAgMBAAECggEABEtdeMb9lFUU4JuN19mPn31Ve29dc8fAEdwy5gGmtQ3t\na1DheAebCy2D0SimFxw60oXZNs9KWqUh4rE5wSj26XVUwPFImxF5FXybOoz6MTXr\nCgzuSHyzbnPbBU5L9IRG0OTPtR0bePwOpay9yZ4KekaAOsiZNiXq8r8q1T54yXjk\nWguPFN+mKkWu7P/tkl/MgX7cPfpQo3g8bZV57p9GfovH1BcfoCZYZlL0NWkP7PWr\nsrGKwhp7hbCws74gL04Ck0w/5mysf0Pvyb1EkRVFb6wsMlskCbpPHQroIXPEnRJl\nlyZVQKBvHpEy7UvMj8fwWfHqTRb37wCQxKm+5EllIwKBgQDUPK+JDaPE0nuUhfe1\nG27iC11bACuSMnPsjdb8cJaMQ+H0NruVNAYBaDNgD0/Un9AwTJQ6W/LMauyW1ebE\nqIGiTgyGGk4WYq7Np3MYv6v50BEmTWrVu1iwzr8kIjZNjFvui+koAwf5QAR0ieB/\noItmcYVXRt87XoYtXGczbCUDKwKBgQC/9MxWKIIkBKdVNF9yX+k04N2lnTMJvAoI\nHtbU6O/cBRARM5xhuLhojPCSjYf63SXVup9QXOfB82bdhNGT3iLo76KWp7MhitpV\nQ7oR7VtmWNW2jW7Dx5dl8+i6Qs/pZSY1YeGiPSupuB2Or+Hr7wwB8pvcws0H5AuA\nUFW9I+pu+wKBgQCPYoBk42Yk7t62tNto66O561uiwzasipFu21THL3lGQgZBa0jH\nwGHeSXuMBkw0pdONDe+GjeA24nX8YX6Klh0efgRQBS2ESh82qU5FBhk1qLAtZFgt\nFWkR6luQGdz9/zmMq9FVStb0OZ/I6+1TzC7hgwhGsobWIUIdGzRNtV48CQKBgQCf\nD5iq5FJCymBmaEmXGwbBvHuuGn8KV/jwFa3rK0JmzQMtXdj92PVmHTPUHNdK9ym8\n2zHcg7+/pZPdh4uqve2rm7bcpAX5i3e0I7Tx2f9c5cvhw3y/WoqH/v8gKPDj898f\naQZxS8L8lgZYEEJjIOiQTJr+6aTAHyWwo+EII9TFNQKBgBpzBtXWS5TaPYTZuqaw\nWk/4nlURA/QEz09EEnSzU0CE+NzE0ehwPyQujuRQW1t+yfP2GF5EwLbECnYw1vwV\nF78QzTR4e0L/LNLJWdFsIrsv636NqcXec+iXrX6VTKwXs0XLLsG29BxAhB+jS1Sg\njNXSR2Ikjt/ZV6h8ewvRYOSz\n-----END PRIVATE KEY-----\n"
```

**Important:**
- Keep the entire key in **double quotes**
- Use `\n` (backslash + n) for newlines, NOT actual line breaks
- The key should be on ONE line in the .env file

### Option 2: Use the Full JSON File Path (Alternative)

Instead of putting the private key in .env, you can store the full JSON file and reference it:

1. Save your service account JSON file as `google-service-account.json` in the project root
2. Add to `.env`:
```env
GOOGLE_APPLICATION_CREDENTIALS=./google-service-account.json
```

Then update `googleCalendar.js` to use the JSON file directly.

## Verify Your Setup

After updating your `.env` file:

1. **Restart your server** (environment variables are loaded at startup)
2. Run the test script:
   ```bash
   node scripts/test-google-calendar.js
   ```

## Common Issues

### Issue: "Request is missing required authentication credential" (401)
- **Cause**: Private key is not properly formatted
- **Fix**: Make sure the private key uses `\n` for newlines and is in double quotes

### Issue: "Calendar not found" (404) or "Forbidden" (403)
- **Cause**: Calendar is not shared with the service account
- **Fix**: Share your Google Calendar with: `euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com`
  - Go to Google Calendar → Settings → Share with specific people
  - Add the service account email
  - Give it "Make changes to events" permission

### Issue: "Google Calendar API is not enabled"
- **Cause**: API is not enabled in Google Cloud Console
- **Fix**: 
  1. Go to [Google Cloud Console](https://console.cloud.google.com)
  2. Select project: `steel-cairn-482717-e7`
  3. Navigate to APIs & Services → Library
  4. Search for "Google Calendar API"
  5. Click "Enable"

## Quick Test

To verify your private key is correctly formatted, you can check if it's being read properly:

```javascript
// In Node.js console or test script
const config = require('./utils/config');
console.log('Private key starts with:', config.googleCalendar.privateKey.substring(0, 30));
console.log('Has newlines:', config.googleCalendar.privateKey.includes('\n'));
```

The private key should:
- Start with `-----BEGIN PRIVATE KEY-----`
- End with `-----END PRIVATE KEY-----`
- Contain actual newline characters (`\n`) when read by Node.js

