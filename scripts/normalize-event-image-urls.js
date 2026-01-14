/**
 * Normalize event image URLs to relative /uploads paths when applicable.
 * Use this if existing events store absolute URLs with localhost or old domains.
 *
 * Run with: node scripts/normalize-event-image-urls.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');
const config = require('../utils/config');

const normalizeUploadPath = (url) => {
  if (!url) return url;
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url);
      if (parsed.pathname && parsed.pathname.startsWith('/uploads/')) {
        return parsed.pathname;
      }
      return url;
    }
  } catch (err) {
    // ignore parse errors and return original
  }
  return url;
};

const run = async () => {
  const mongoURI = config.database.uri;
  if (!mongoURI) {
    console.error('MONGODB_URI is missing. Please set it in your .env file.');
    process.exit(1);
  }

  await mongoose.connect(mongoURI);
  console.log('✅ Connected to MongoDB');

  const events = await Event.find({}).lean();
  let updatedCount = 0;

  for (const event of events) {
    let changed = false;
    const updates = {};

    if (event.heroImage) {
      const normalizedHero = normalizeUploadPath(event.heroImage);
      if (normalizedHero !== event.heroImage) {
        updates.heroImage = normalizedHero;
        changed = true;
      }
    }

    if (Array.isArray(event.images) && event.images.length > 0) {
      const normalizedImages = event.images.map((img) => {
        const normalizedUrl = normalizeUploadPath(img.url);
        return {
          ...img,
          url: normalizedUrl,
        };
      });

      const imageChanged = normalizedImages.some((img, idx) => img.url !== event.images[idx].url);
      if (imageChanged) {
        updates.images = normalizedImages;
        changed = true;
      }
    }

    if (changed) {
      await Event.updateOne({ _id: event._id }, { $set: updates });
      updatedCount += 1;
      console.log(`Updated event: ${event._id}`);
    }
  }

  console.log(`✅ Done. Updated ${updatedCount} event(s).`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('❌ Failed to normalize event image URLs:', err);
  process.exit(1);
});
