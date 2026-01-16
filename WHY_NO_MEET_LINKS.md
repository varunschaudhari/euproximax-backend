# Why Google Meet Links Are Not Being Generated

## The Root Cause

Your events are being created on the **service account's calendar** (`euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com`), not on your **personal calendar**. 

**Service account calendars do NOT generate Google Meet links automatically.**

## The Problem

In your `.env` file, you have:
```env
GOOGLE_CALENDAR_ID=primary
```

When you use `primary`, it refers to the service account's own calendar. Google Meet links are only generated when events are created on:
- ✅ Personal Google accounts (gmail.com, etc.)
- ✅ Google Workspace accounts
- ❌ NOT on service account calendars

## The Solution

You need to:

1. **Use YOUR personal calendar ID** (not `primary`)
2. **Share your calendar** with the service account

## Step-by-Step Fix

### Step 1: Find Your Personal Calendar ID

1. Go to: **https://calendar.google.com/calendar/r/settings**
2. In the **left sidebar**, click on **your calendar** (usually "My Calendar" or your email)
3. Scroll down to **"Integrate calendar"** section
4. Copy the **"Calendar ID"** - it looks like:
   - `your-email@gmail.com` OR
   - `c_abc123@group.calendar.google.com`

### Step 2: Update Your `.env` File

Open `euproximax-backend/.env` and change:

**FROM:**
```env
GOOGLE_CALENDAR_ID=primary
```

**TO:**
```env
GOOGLE_CALENDAR_ID=your-email@gmail.com
```

Replace `your-email@gmail.com` with the Calendar ID you copied in Step 1.

### Step 3: Share Your Calendar

1. Still in Calendar Settings (https://calendar.google.com/calendar/r/settings)
2. Click your calendar in the left sidebar
3. Scroll to **"Share with specific people"**
4. Click **"+ Add people"**
5. Enter: `euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com`
6. Set permission to **"Make changes to events"**
7. Click **"Send"**

### Step 4: Restart and Test

1. **Restart your server:**
   ```bash
   # Stop server (Ctrl+C)
   npm run dev
   ```

2. **Test the fix:**
   ```bash
   node scripts/test-google-calendar.js
   ```

3. **Create a new consultation booking** - Meet links should now be generated!

## Verification

After making these changes, you should see:
- ✅ Events created on YOUR calendar (not service account's)
- ✅ Google Meet links automatically generated
- ✅ Meet links working and accessible

## Why This Happens

- **Service accounts** are for server-to-server authentication
- They have their own calendars, but these don't support Meet links
- **Personal calendars** support Meet links automatically
- By sharing your calendar with the service account, it can create events on YOUR calendar (where Meet links work)

## Quick Checklist

- [ ] Found your personal Calendar ID
- [ ] Updated `GOOGLE_CALENDAR_ID` in `.env` file
- [ ] Shared your calendar with service account
- [ ] Restarted server
- [ ] Tested with `node scripts/test-google-calendar.js`
- [ ] Meet links are now being generated! ✅

