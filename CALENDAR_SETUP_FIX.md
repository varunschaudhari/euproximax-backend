# Fix: Google Meet Links Not Generating

## The Problem

The service account is creating events on its **own calendar** (`euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com`), not on your personal calendar. This is why Meet links aren't being generated.

## Solution Options

### Option 1: Use Your Personal Calendar ID (Recommended)

Instead of using `'primary'`, use your actual Google Calendar ID:

1. **Find Your Calendar ID:**
   - Go to: https://calendar.google.com/calendar/r/settings
   - In the left sidebar, click on your calendar (usually "My Calendar" or your email)
   - Scroll down to **"Integrate calendar"** section
   - Copy the **"Calendar ID"** (it looks like: `your-email@gmail.com` or a long string)

2. **Update your `.env` file:**
   ```env
   GOOGLE_CALENDAR_ID=your-email@gmail.com
   ```
   Replace `your-email@gmail.com` with your actual calendar ID

3. **Share your calendar with the service account:**
   - Still go to: https://calendar.google.com/calendar/r/settings
   - Click your calendar
   - Scroll to **"Share with specific people"**
   - Click **"+ Add people"**
   - Add: `euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com`
   - Set permission to **"Make changes to events"**
   - Click **"Send"**

4. **Restart your server** and test again

### Option 2: Use Domain-Wide Delegation (Advanced)

If you're using Google Workspace, you can set up domain-wide delegation to allow the service account to impersonate users. This is more complex but allows automatic Meet link generation.

## Quick Test

After updating your calendar ID, run:
```bash
node scripts/check-calendar-sharing.js
```

This will verify:
- ✅ Calendar is accessible
- ✅ Meet links can be generated

## Current Status

- ✅ Authentication working
- ✅ Events are being created
- ⚠️  Meet links not generating (using wrong calendar)

Once you update `GOOGLE_CALENDAR_ID` to your personal calendar and share it, Meet links will be generated automatically!

