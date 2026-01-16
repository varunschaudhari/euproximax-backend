# How to Share Google Calendar with Service Account

Follow these steps to share your Google Calendar with the service account so it can create events with Google Meet links.

## Method 1: Share from Calendar Settings (Recommended)

1. **Open Google Calendar**
   - Go to [https://calendar.google.com](https://calendar.google.com)
   - Make sure you're signed in with the Google account that owns the calendar

2. **Open Calendar Settings**
   - Look at the **left sidebar** where your calendars are listed
   - Find the calendar you want to use (usually "My Calendar" or your primary calendar)
   - **Hover over the calendar name** in the left sidebar
   - You'll see **three dots (⋮)** appear next to the calendar name
   - Click the **three dots (⋮)**

3. **Access Settings and Sharing**
   - From the dropdown menu, click **"Settings and sharing"**
   - This will open the calendar settings page

4. **Share with Specific People**
   - Scroll down on the settings page
   - Look for the section titled **"Share with specific people"** or **"Share with people"**
   - Click the **"+ Add people"** button (or **"Add people"** link)

5. **Add the Service Account**
   - In the "Add people" dialog box, enter the service account email:
     ```
     euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com
     ```
   - In the **"Permission"** dropdown, select **"Make changes to events"**
   - Click **"Send"** (or **"Add"**)

6. **Verify**
   - The service account email should now appear in the "Share with specific people" list
   - Make sure the permission is set to "Make changes to events" or "Make changes and manage sharing"

## Method 2: Direct URL (Alternative)

If you can't find the settings:

1. Go directly to: [https://calendar.google.com/calendar/r/settings](https://calendar.google.com/calendar/r/settings)
2. In the left sidebar, click on the calendar you want to share
3. Scroll down to find **"Share with specific people"**
4. Click **"+ Add people"**
5. Add: `euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com`
6. Set permission to **"Make changes to events"**
7. Click **"Send"**

## Method 3: Using Calendar ID (If sharing doesn't work)

If you're having trouble sharing, you can also:

1. Go to Calendar Settings
2. Scroll down to **"Integrate calendar"** section
3. Copy the **"Calendar ID"** (it looks like: `your-email@gmail.com` or a long string)
4. Add this to your `.env` file:
   ```env
   GOOGLE_CALENDAR_ID=your-calendar-id-here
   ```

## Troubleshooting

### Can't find "Share with specific people"
- Make sure you're looking at the **calendar settings**, not general Google Calendar settings
- The option is in the **left sidebar** when you click the three dots next to a calendar
- Try using the direct URL: `https://calendar.google.com/calendar/r/settings`

### Service account email not accepted
- Make sure you're copying the exact email: `euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com`
- Service accounts can be added just like regular Google accounts
- If it still doesn't work, try using domain-wide delegation (more advanced)

### Permission denied errors
- Make sure the permission is set to **"Make changes to events"** (not just "See all event details")
- The service account needs write access to create events

## Visual Guide

The path is:
```
Google Calendar → Left Sidebar → Calendar Name (hover) → ⋮ (three dots) → Settings and sharing → Scroll down → Share with specific people → + Add people
```

## After Sharing

Once you've shared the calendar:
1. Restart your Node.js server
2. Run the test: `node scripts/test-google-calendar.js`
3. Create a new consultation booking to test

The service account should now be able to create calendar events with Google Meet links!

