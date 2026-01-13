# Fix: Server Using Old Calendar ID

## The Problem

Even though your `.env` file is correct, the server is still using the old value. This happens because:
1. The server was started before you updated `.env`
2. Environment variables are loaded when the server starts
3. Nodemon might not always reload environment variables properly

## The Solution: Full Server Restart

### Step 1: Stop the Server Completely

1. In your terminal where the server is running, press **Ctrl+C** to stop it
2. Wait a few seconds to make sure it's fully stopped

### Step 2: Verify .env File

Make sure your `.env` file has this exact line (no quotes, no spaces):
```env
GOOGLE_CALENDAR_ID=2e3319cb6d7a68df24a4cc8fa078aa9f5f9e85e244acf52cfdc0c2d2270a4ecf@group.calendar.google.com
```

You can verify it's correct by running:
```bash
node scripts/check-env-format.js
```

### Step 3: Start Server Fresh

Start the server again:
```bash
npm run dev
```

### Step 4: Test

After the server starts, test the calendar:
```bash
node scripts/test-google-calendar.js
```

## If It Still Doesn't Work

### Check 1: Calendar Sharing

Make sure you've shared the calendar with the service account:
1. Go to: https://calendar.google.com/calendar/r/settings
2. Find your calendar (with ID: `2e3319cb6d7a68df24a4cc8fa078aa9f5f9e85e244acf52cfdc0c2d2270a4ecf@group.calendar.google.com`)
3. Share with: `euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com`
4. Permission: "Make changes to events"

### Check 2: Calendar ID Format

The Calendar ID should be URL-encoded if it contains special characters. Your ID looks fine, but if you get "Not Found" errors, try:
- Removing any trailing spaces
- Making sure there are no quotes around it
- Verifying the calendar actually exists

### Check 3: Verify Calendar Access

Run the calendar sharing check:
```bash
node scripts/check-calendar-sharing.js
```

This will tell you if:
- ✅ Calendar is accessible
- ✅ Meet links can be generated
- ❌ What's wrong if there's an issue

## Quick Checklist

- [ ] Stopped server completely (Ctrl+C)
- [ ] Verified .env file format (no quotes, correct value)
- [ ] Started server fresh (`npm run dev`)
- [ ] Shared calendar with service account
- [ ] Tested with `node scripts/test-google-calendar.js`
- [ ] Meet links are now working! ✅


