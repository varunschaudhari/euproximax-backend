#!/usr/bin/env node

/**
 * Partner seed script
 * - Inserts existing partners into the database
 * - Generates unique slugs for each partner
 * - Skips partners that already exist (based on slug)
 */

const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const config = require('../utils/config');

// Models
const Partner = require('../models/Partner');
const User = require('../models/User');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const seedData = require('./seedPartners.json');

const slugify = (value) => {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/dr\.\s*/g, 'dr-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
};

const ensureUniqueSlug = async (candidate, excludeId = null) => {
  let uniqueSlug = candidate || `${Date.now()}`;
  let suffix = 1;

  const slugFilter = (slug) => {
    const query = { slug };
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
      query._id = { $ne: excludeId };
    }
    return query;
  };

  while (true) {
    const existing = await Partner.findOne(slugFilter(uniqueSlug)).select('_id').lean();
    if (!existing) break;
    uniqueSlug = `${candidate}-${suffix}`;
    suffix += 1;
  }

  return uniqueSlug;
};

const normalizeExpertise = (expertise) => {
  if (!expertise) return [];
  if (Array.isArray(expertise)) {
    return expertise.map((e) => String(e).trim()).filter(Boolean).slice(0, 50);
  }
  return String(expertise)
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .slice(0, 50);
};

const connect = async () => {
  let mongoUri = config.database.uri;
  if (!mongoUri) {
    logger.error('❌ MongoDB connection string is missing. Set MONGODB_URI in .env');
    process.exit(1);
  }
  // Force IPv4 to avoid ::1 issues with localhost
  if (mongoUri.includes('localhost')) {
    mongoUri = mongoUri.replace('localhost', '127.0.0.1');
  }
  logger.info(`Attempting to connect to MongoDB: ${mongoUri.replace(/\/\/.*@/, '//***:***@')}`);
  await mongoose.connect(mongoUri);
  logger.info(`✅ MongoDB Connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
};

const seedPartners = async () => {
  try {
    // Get the first superuser to use as createdBy (optional)
    let createdByUser = null;
    try {
      const superuser = await User.findOne({ email: 'varun@gmail.com' }).select('_id').lean();
      if (superuser) {
        createdByUser = superuser._id;
        logger.info(`Using user ${superuser._id} as createdBy`);
      }
    } catch (err) {
      logger.warn('Could not find default user for createdBy field');
    }

    const partners = seedData.partners || [];
    if (!Array.isArray(partners) || partners.length === 0) {
      logger.warn('⚠️  No partners found in seed data');
      return;
    }

    logger.info(`📋 Found ${partners.length} partners to seed`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const partnerData of partners) {
      try {
        // Generate slug from name
        const baseSlug = slugify(partnerData.name);
        const uniqueSlug = await ensureUniqueSlug(baseSlug);

        // Check if partner with this slug already exists
        const existing = await Partner.findOne({ slug: uniqueSlug }).lean();
        if (existing) {
          logger.info(`⏭️  Skipping ${partnerData.name} (already exists with slug: ${uniqueSlug})`);
          skipped++;
          continue;
        }

        // Prepare partner data
        const partnerPayload = {
          name: partnerData.name.trim(),
          slug: uniqueSlug,
          location: partnerData.location.trim(),
          role: partnerData.role.trim(),
          email: partnerData.email?.trim() || null,
          phone: partnerData.phone?.trim() || null,
          bio: partnerData.bio?.trim() || null,
          expertise: normalizeExpertise(partnerData.expertise),
          image: partnerData.image?.trim() || null,
          status: partnerData.status || 'Active',
          order: partnerData.order !== undefined ? Number(partnerData.order) : 0,
        };

        // Add createdBy if available
        if (createdByUser) {
          partnerPayload.createdBy = createdByUser;
        }

        // Create partner
        const partner = await Partner.create(partnerPayload);
        logger.info(`✅ Created partner: ${partner.name} (slug: ${partner.slug})`);
        created++;
      } catch (err) {
        logger.error(`❌ Error creating partner ${partnerData.name}:`, err.message);
        errors++;
      }
    }

    logger.info('\n📊 Seed Summary:');
    logger.info(`   ✅ Created: ${created}`);
    logger.info(`   ⏭️  Skipped: ${skipped}`);
    logger.info(`   ❌ Errors: ${errors}`);
    logger.info(`   📝 Total: ${partners.length}`);
  } catch (error) {
    logger.error('❌ Error seeding partners:', error.message || error);
    throw error;
  }
};

const init = async () => {
  try {
    await connect();
    await seedPartners();
    await mongoose.connection.close();
    logger.info('📦 Partner seed complete and connection closed.');
    process.exit(0);
  } catch (e) {
    logger.error('❌ Partner seed failed:', e.message || e);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

init();

