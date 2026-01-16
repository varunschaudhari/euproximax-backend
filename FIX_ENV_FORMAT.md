# Fix: Calendar ID Format Error

## The Problem

The error shows:
```
"calendarId":"GOOGLE_CALENDAR_ID=2e3319cb6d7a68df24a4cc8fa078aa9f5f9e85e244acf52cfdc0c2d2270a4ecf@group.calendar.google.com"
```

This means your `.env` file has the wrong format. The entire line is being read as the value.

## The Fix

Open your `.env` file and find the `GOOGLE_CALENDAR_ID` line. It should look like this:

### ❌ WRONG (what you might have):
```env
GOOGLE_CALENDAR_ID=GOOGLE_CALENDAR_ID=2e3319cb6d7a68df24a4cc8fa078aa9f5f9e85e244acf52cfdc0c2d2270a4ecf@group.calendar.google.com
```

OR

```env
GOOGLE_CALENDAR_ID="GOOGLE_CALENDAR_ID=2e3319cb6d7a68df24a4cc8fa078aa9f5f9e85e244acf52cfdc0c2d2270a4ecf@group.calendar.google.com"
```

### ✅ CORRECT (what it should be):
```env
GOOGLE_CALENDAR_ID=2e3319cb6d7a68df24a4cc8fa078aa9f5f9e85e244acf52cfdc0c2d2270a4ecf@group.calendar.google.com
```

## Steps to Fix

1. **Open** `euproximax-backend/.env` in a text editor

2. **Find** the line with `GOOGLE_CALENDAR_ID`

3. **Make sure** it looks exactly like this (no quotes, no duplicate variable name):
   ```env
   GOOGLE_CALENDAR_ID=2e3319cb6d7a68df24a4cc8fa078aa9f5f9e85e244acf52cfdc0c2d2270a4ecf@group.calendar.google.com
   ```

4. **Save** the file

5. **Restart** your server (stop with Ctrl+C, then `npm run dev`)

6. **Test** again - the error should be gone!

## Important Notes

- ✅ **No quotes** around the Calendar ID (unless it contains spaces, which it doesn't)
- ✅ **No duplicate** `GOOGLE_CALENDAR_ID=` in the value
- ✅ **Just the Calendar ID** after the `=` sign

## After Fixing

Once you fix the format and restart, you should see:
- ✅ Calendar event created successfully
- ✅ Google Meet link generated (if calendar is shared)

## Don't Forget to Share Calendar

Even after fixing the format, make sure you've shared the calendar:
1. Go to: https://calendar.google.com/calendar/r/settings
2. Find your calendar
3. Share with: `euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com`
4. Permission: "Make changes to events"

