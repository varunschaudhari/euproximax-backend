# Google Calendar API Setup Guide

This guide will help you set up Google Calendar API integration for creating Google Meet links.

## Current Configuration

Your service account is already configured:
- **Project ID**: `steel-cairn-482717-e7`
- **Service Account Email**: `euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com`
- **Client ID**: `115059628190750064173`

## Step 1: Add Private Key to Environment Variables

1. Copy the `private_key` value from your service account JSON file
2. Add it to your `.env` file in the following format:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCfJDo2Wae+9KrE\nNMGYs//c0XUAVvtRBR36+PHFdB/yxj0fPPu3fQHHMSTLA7oxaG5pn7MV29W42cn7\nGCqdKerIO2FjPDmp4cSk+fOS4lw8hhRn7hk/eRN96AoC8Oksi7y2oJ7uPZseZyhG\njVkmHkSD3n1mPq2re0Xw0UFqqBDIlzsDzPQL6bJmo7OdqF9UK0U2+i+1jU9An2Ek\nhcuS4NLxoBJHqvDP7uoErjGiT3/gNG+bibychDpKYWhm/9gwr6w3pr7Drh4UiaaZ\nZc91WM2ovJNAOkfsOayPj1uWcY9wK76t3x0wmFmBjUaJQ03lyxrJEBXbY+NtfSmL\nzuW19JUpAgMBAAECggEABEtdeMb9lFUU4JuN19mPn31Ve29dc8fAEdwy5gGmtQ3t\na1DheAebCy2D0SimFxw60oXZNs9KWqUh4rE5wSj26XVUwPFImxF5FXybOoz6MTXr\nCgzuSHyzbnPbBU5L9IRG0OTPtR0bePwOpay9yZ4KekaAOsiZNiXq8r8q1T54yXjk\nWguPFN+mKkWu7P/tkl/MgX7cPfpQo3g8bZV57p9GfovH1BcfoCZYZlL0NWkP7PWr\nsrGKwhp7hbCws74gL04Ck0w/5mysf0Pvyb1EkRVFb6wsMlskCbpPHQroIXPEnRJl\nlyZVQKBvHpEy7UvMj8fwWfHqTRb37wCQxKm+5EllIwKBgQDUPK+JDaPE0nuUhfe1\nG27iC11bACuSMnPsjdb8cJaMQ+H0NruVNAYBaDNgD0/Un9AwTJQ6W/LMauyW1ebE\nqIGiTgyGGk4WYq7Np3MYv6v50BEmTWrVu1iwzr8kIjZNjFvui+koAwf5QAR0ieB/\noItmcYVXRt87XoYtXGczbCUDKwKBgQC/9MxWKIIkBKdVNF9yX+k04N2lnTMJvAoI\nHtbU6O/cBRARM5xhuLhojPCSjYf63SXVup9QXOfB82bdhNGT3iLo76KWp7MhitpV\nQ7oR7VtmWNW2jW7Dx5dl8+i6Qs/pZSY1YeGiPSupuB2Or+Hr7wwB8pvcws0H5AuA\nUFW9I+pu+wKBgQCPYoBk42Yk7t62tNto66O561uiwzasipFu21THL3lGQgZBa0jH\nwGHeSXuMBkw0pdONDe+GjeA24nX8YX6Klh0efgRQBS2ESh82qU5FBhk1qLAtZFgt\nFWkR6luQGdz9/zmMq9FVStb0OZ/I6+1TzC7hgwhGsobWIUIdGzRNtV48CQKBgQCf\nD5iq5FJCymBmaEmXGwbBvHuuGn8KV/jwFa3rK0JmzQMtXdj92PVmHTPUHNdK9ym8\n2zHcg7+/pZPdh4uqve2rm7bcpAX5i3e0I7Tx2f9c5cvhw3y/WoqH/v8gKPDj898f\naQZxS8L8lgZYEEJjIOiQTJr+6aTAHyWwo+EII9TFNQKBgBpzBtXWS5TaPYTZuqaw\nWk/4nlURA/QEz09EEnSzU0CE+NzE0ehwPyQujuRQW1t+yfP2GF5EwLbECnYw1vwV\nF78QzTR4e0L/LNLJWdFsIrsv636NqcXec+iXrX6VTKwXs0XLLsG29BxAhB+jS1Sg\njNXSR2Ikjt/ZV6h8ewvRYOSz\n-----END PRIVATE KEY-----\n"
```

**Important Notes:**
- Keep the entire private key in double quotes
- Preserve the `\n` characters as literal `\n` (they will be converted to actual newlines automatically)
- Do NOT commit your `.env` file to version control

## Step 2: Share Calendar with Service Account

For the service account to create events, you need to share your Google Calendar with it:

1. Open [Google Calendar](https://calendar.google.com)
2. Click the **Settings** gear icon → **Settings**
3. In the left sidebar, click **Settings for my calendars** → Select your calendar
4. Scroll down to **Share with specific people**
5. Click **Add people**
6. Enter the service account email: `euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com`
7. Set permission to **Make changes to events**
8. Click **Send**

Alternatively, you can share the calendar directly:
- Go to your calendar settings
- Find the calendar you want to use
- Click **Share with specific people**
- Add the service account email with "Make changes to events" permission

## Step 3: Verify Google Calendar API is Enabled

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select project: `steel-cairn-482717-e7`
3. Navigate to **APIs & Services** → **Library**
4. Search for "Google Calendar API"
5. Ensure it's **Enabled**

## Step 4: Test the Integration

After setting up the environment variables and sharing the calendar:

1. Restart your Node.js server
2. Create a test consultation booking
3. Check your Google Calendar - you should see the event with a Google Meet link
4. Verify the Meet link works by clicking it

## Troubleshooting

### Error: "Calendar not found"
- Make sure you've shared your calendar with the service account email
- Check that `GOOGLE_CALENDAR_ID` is set correctly (use `primary` for your main calendar)

### Error: "Insufficient Permission"
- Verify the service account has "Make changes to events" permission on the calendar
- Check that Google Calendar API is enabled in Google Cloud Console

### Error: "Invalid credentials"
- Verify the private key is correctly formatted in `.env`
- Make sure the private key includes the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines
- Ensure `\n` characters are preserved as literal `\n` in the .env file

### Meet link not generated
- Check server logs for any errors
- Verify the `conferenceDataVersion: 1` parameter is being sent (it's included in the code)
- Ensure the calendar event was created successfully

## Additional Configuration

### Use a Specific Calendar
If you want to use a different calendar instead of "primary":

1. Go to Google Calendar → Settings
2. Find your calendar → **Integrate calendar**
3. Copy the **Calendar ID**
4. Set in `.env`: `GOOGLE_CALENDAR_ID=your-calendar-id@group.calendar.google.com`

### Change Timezone
Update the timezone in `.env`:
```env
GOOGLE_CALENDAR_TIMEZONE=Asia/Kolkata
```

Available timezones: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

