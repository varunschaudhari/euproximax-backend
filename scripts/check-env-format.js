/**
 * Check .env file format for Google Calendar ID
 * Run with: node scripts/check-env-format.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('\n=== Checking .env File Format ===\n');

const envPath = path.join(__dirname, '..', '.env');

if (!fs.existsSync(envPath)) {
  console.log('❌ .env file not found!');
  console.log('   Create a .env file in the root directory.');
  process.exit(1);
}

// Read the .env file
const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');

// Find GOOGLE_CALENDAR_ID line
const calendarIdLine = lines.find(line => line.trim().startsWith('GOOGLE_CALENDAR_ID='));

if (!calendarIdLine) {
  console.log('❌ GOOGLE_CALENDAR_ID not found in .env file');
  console.log('   Add this line to your .env file:');
  console.log('   GOOGLE_CALENDAR_ID=2e3319cb6d7a68df24a4cc8fa078aa9f5f9e85e244acf52cfdc0c2d2270a4ecf@group.calendar.google.com');
  process.exit(1);
}

console.log('Found GOOGLE_CALENDAR_ID line:');
console.log(`   "${calendarIdLine.trim()}"\n`);

// Check if it has the wrong format
if (calendarIdLine.includes('GOOGLE_CALENDAR_ID=GOOGLE_CALENDAR_ID=')) {
  console.log('❌ WRONG FORMAT DETECTED!');
  console.log('   The line contains duplicate "GOOGLE_CALENDAR_ID="\n');
  console.log('   Current (WRONG):');
  console.log(`   ${calendarIdLine.trim()}\n`);
  console.log('   Should be (CORRECT):');
  const correctValue = calendarIdLine.split('GOOGLE_CALENDAR_ID=').pop().trim();
  console.log(`   GOOGLE_CALENDAR_ID=${correctValue}\n`);
  console.log('   Fix: Remove the duplicate "GOOGLE_CALENDAR_ID=" from the value');
} else {
  // Extract the value
  const value = calendarIdLine.split('=').slice(1).join('=').trim();
  
  // Remove quotes if present
  const cleanValue = value.replace(/^["']|["']$/g, '');
  
  console.log('✅ Format looks correct!');
  console.log(`   Calendar ID: ${cleanValue}\n`);
  
  // Check what dotenv is reading
  const envValue = process.env.GOOGLE_CALENDAR_ID;
  console.log('What dotenv is reading:');
  console.log(`   ${envValue || '(not set)'}\n`);
  
  if (envValue && envValue.includes('GOOGLE_CALENDAR_ID=')) {
    console.log('⚠️  WARNING: dotenv is reading the wrong value!');
    console.log('   The value includes "GOOGLE_CALENDAR_ID=" which is wrong.\n');
    console.log('   Fix your .env file - remove any duplicate variable names.');
  } else if (envValue === cleanValue) {
    console.log('✅ dotenv is reading the correct value!');
  } else if (!envValue) {
    console.log('⚠️  dotenv is not reading the value');
    console.log('   Make sure there are no spaces around the = sign');
  }
}

console.log('\n=== Expected Format ===');
console.log('GOOGLE_CALENDAR_ID=2e3319cb6d7a68df24a4cc8fa078aa9f5f9e85e244acf52cfdc0c2d2270a4ecf@group.calendar.google.com');
console.log('\n(No quotes, no duplicate variable name, just the Calendar ID after the = sign)\n');


