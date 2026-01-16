# Update Your Calendar ID

## Your Calendar ID
```
2e3319cb6d7a68df24a4cc8fa078aa9f5f9e85e244acf52cfdc0c2d2270a4ecf@group.calendar.google.com
```

## Steps to Update

### 1. Open your `.env` file
Open `euproximax-backend/.env` in your editor.

### 2. Find and Update GOOGLE_CALENDAR_ID
Find this line:
```env
GOOGLE_CALENDAR_ID=primary
```

Change it to:
```env
GOOGLE_CALENDAR_ID=2e3319cb6d7a68df24a4cc8fa078aa9f5f9e85e244acf52cfdc0c2d2270a4ecf@group.calendar.google.com
```

### 3. Share Your Calendar with Service Account

**IMPORTANT:** You must share this calendar with the service account:

1. Go to: https://calendar.google.com/calendar/r/settings
2. In the left sidebar, find and click on the calendar with ID: `2e3319cb6d7a68df24a4cc8fa078aa9f5f9e85e244acf52cfdc0c2d2270a4ecf@group.calendar.google.com`
3. Scroll to **"Share with specific people"**
4. Click **"+ Add people"**
5. Enter: `euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com`
6. Set permission to **"Make changes to events"**
7. Click **"Send"**

### 4. Restart Your Server

After updating `.env`:
1. Stop your server (Ctrl+C)
2. Restart: `npm run dev`

### 5. Test

Run the test script:
```bash
node scripts/test-google-calendar.js
```

You should now see:
- ✅ Calendar event created
- ✅ Google Meet link generated!

## Complete .env Configuration

Your Google Calendar section should look like:
```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...your key...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID=2e3319cb6d7a68df24a4cc8fa078aa9f5f9e85e244acf52cfdc0c2d2270a4ecf@group.calendar.google.com
GOOGLE_CALENDAR_TIMEZONE=Asia/Kolkata
```

