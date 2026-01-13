# How to Find Your Google Calendar ID

## Quick Steps

1. **Open Google Calendar Settings:**
   - Go to: https://calendar.google.com/calendar/r/settings
   - Or: Click the ⚙️ (gear icon) in Google Calendar → Settings

2. **Find Your Calendar:**
   - In the **left sidebar**, look for your calendar
   - It's usually named:
     - "My Calendar" or
     - Your email address (e.g., "varunschaudhari@gmail.com")

3. **Get the Calendar ID:**
   - Click on your calendar name in the left sidebar
   - Scroll down to the **"Integrate calendar"** section
   - You'll see **"Calendar ID"** - it looks like one of these:
     - `varunschaudhari@gmail.com` (your email)
     - Or a long string like `c_abc123def456@group.calendar.google.com`

4. **Copy the Calendar ID:**
   - Click the copy icon next to "Calendar ID" or manually copy it

5. **Update your `.env` file:**
   ```env
   GOOGLE_CALENDAR_ID=varunschaudhari@gmail.com
   ```
   (Replace with your actual calendar ID)

6. **Share the Calendar:**
   - Still in Settings, scroll to **"Share with specific people"**
   - Click **"+ Add people"**
   - Add: `euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com`
   - Permission: **"Make changes to events"**
   - Click **"Send"**

7. **Restart your server** and test again!

## Visual Guide

```
Google Calendar → Settings → [Click your calendar] → Scroll down → "Integrate calendar" → Copy "Calendar ID"
```

## Important Notes

- **Don't use `primary`** - that's the service account's calendar
- **Use your personal calendar ID** - this is where Meet links will be generated
- **The calendar must be shared** with the service account for it to create events

