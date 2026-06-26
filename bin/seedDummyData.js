#!/usr/bin/env node

/**
 * Dummy data seed script for testing
 * Creates sample cases, clients, payments, and consultation bookings
 */

const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const config = require('../utils/config');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Models
const Case = require('../models/Case');
const CrmClient = require('../models/CrmClient');
const Payment = require('../models/Payment');
const User = require('../models/User');
const ConsultationSlot = require('../models/ConsultationSlot');
const ConsultationBooking = require('../models/ConsultationBooking');

const connect = async () => {
  let mongoUri = config.database.uri;
  if (!mongoUri) {
    logger.error('❌ MongoDB connection string is missing. Set MONGODB_URI in .env');
    process.exit(1);
  }
  if (mongoUri.includes('localhost')) {
    mongoUri = mongoUri.replace('localhost', '127.0.0.1');
  }
  logger.info(`Connecting to MongoDB...`);
  await mongoose.connect(mongoUri);
  logger.info(`✅ MongoDB Connected`);
};

const seedClients = async () => {
  const clients = [
    {
      name: 'Tech Innovations Ltd',
      email: 'contact@techinnovations.com',
      phone: '+1 555-0101',
      country: 'United States',
      city: 'San Francisco',
      address: '123 Tech Ave',
    },
    {
      name: 'Global Industries Inc',
      email: 'info@globalind.com',
      phone: '+44 20 7123 4567',
      country: 'United Kingdom',
      city: 'London',
      address: '456 Industrial Road',
    },
    {
      name: 'Innovation Labs',
      email: 'hello@innovlabs.com',
      phone: '+91 98765 43210',
      country: 'India',
      city: 'Bangalore',
      address: '789 Silicon Valley',
    },
  ];

  const created = [];
  for (const clientData of clients) {
    const existing = await CrmClient.findOne({ email: clientData.email });
    if (!existing) {
      const client = await CrmClient.create(clientData);
      created.push(client);
      logger.info(`✅ Created client: ${client.name}`);
    }
  }
  return created;
};

const seedCases = async (clients) => {
  const admin = await User.findOne({ email: 'varun@gmail.com' });

  const cases = [
    {
      caseNumber: 'PAT-2024-001',
      title: 'Smart Home IoT Device Patent',
      description: 'Patent for innovative smart home automation system',
      clientId: clients[0]?._id,
      inventor: 'John Smith',
      domain: 'Electronics',
      track: 'B',
      phase: 2,
      status: 'active',
      createdBy: admin?._id,
      assignedTo: admin?._id,
    },
    {
      caseNumber: 'PAT-2024-002',
      title: 'AI-Powered Analytics Platform',
      description: 'Machine learning algorithm for data analysis',
      clientId: clients[1]?._id,
      inventor: 'Sarah Johnson',
      domain: 'Software',
      track: 'A',
      phase: 1,
      status: 'active',
      createdBy: admin?._id,
      assignedTo: admin?._id,
    },
    {
      caseNumber: 'PAT-2024-003',
      title: 'Renewable Energy Storage Solution',
      description: 'Novel battery technology for renewable energy',
      clientId: clients[2]?._id,
      inventor: 'Mike Chen',
      domain: 'Energy',
      track: 'B',
      phase: 3,
      status: 'active',
      createdBy: admin?._id,
      assignedTo: admin?._id,
    },
  ];

  const created = [];
  for (const caseData of cases) {
    const existing = await Case.findOne({ caseNumber: caseData.caseNumber });
    if (!existing) {
      const caseObj = await Case.create(caseData);
      created.push(caseObj);
      logger.info(`✅ Created case: ${caseObj.caseNumber} - ${caseObj.title}`);
    }
  }
  return created;
};

const seedPayments = async (cases) => {
  const payments = cases.map((caseObj, index) => ({
    caseId: caseObj._id,
    amount: (index + 1) * 5000,
    currency: 'USD',
    type: ['filing', 'examination', 'issuance'][index % 3],
    status: ['pending', 'completed', 'overdue'][index % 3],
    dueDate: new Date(Date.now() + (index + 1) * 30 * 24 * 60 * 60 * 1000),
    paidDate: index === 0 ? new Date() : null,
    invoiceNumber: `INV-2024-${1001 + index}`,
    description: `Payment for ${['filing fees', 'examination fees', 'issuance fees'][index % 3]}`,
  }));

  const created = [];
  for (const paymentData of payments) {
    const existing = await Payment.findOne({ invoiceNumber: paymentData.invoiceNumber });
    if (!existing) {
      const payment = await Payment.create(paymentData);
      created.push(payment);
      logger.info(`✅ Created payment: ${payment.invoiceNumber} - $${payment.amount}`);
    }
  }
  return created;
};

const seedConsultations = async () => {
  const admin = await User.findOne({ email: 'varun@gmail.com' });

  // Create consultation slots
  const slots = [];
  for (let i = 0; i < 5; i++) {
    const slotDate = new Date();
    slotDate.setDate(slotDate.getDate() + i + 1);
    slotDate.setHours(10 + i, 0, 0, 0);

    const slot = await ConsultationSlot.create({
      date: slotDate,
      startTime: '10:00',
      endTime: '11:00',
      duration: 60,
      capacity: 1,
      bookedCount: i % 2, // Some slots booked
      createdBy: admin?._id,
    });
    slots.push(slot);
    logger.info(`✅ Created consultation slot: ${slotDate.toDateString()} at 10:00`);
  }

  // Create consultation bookings for some slots
  const bookings = [];
  for (let i = 0; i < 2; i++) {
    const booking = await ConsultationBooking.create({
      slotId: slots[i]._id,
      userName: ['Alice Brown', 'Bob Wilson'][i],
      userEmail: [`alice${i}@example.com`, `bob${i}@example.com`][i],
      userPhone: ['+1 555-0201', '+1 555-0202'][i],
      topic: ['Patent Filing Strategy', 'Patent Search & Landscaping'][i],
      status: 'confirmed',
      bookedAt: new Date(),
    });
    bookings.push(booking);
    logger.info(`✅ Created consultation booking: ${booking.userName}`);
  }

  return { slots, bookings };
};

const seed = async () => {
  try {
    await connect();

    logger.info('\n📊 Seeding dummy data...\n');

    // Seed in order
    const clients = await seedClients();
    logger.info('');
    const cases = await seedCases(clients);
    logger.info('');
    await seedPayments(cases);
    logger.info('');
    const { slots, bookings } = await seedConsultations();

    logger.info('\n✅ Dummy data seeding complete!');
    logger.info(`\n📈 Summary:`);
    logger.info(`  • Clients: ${clients.length}`);
    logger.info(`  • Cases: ${cases.length}`);
    logger.info(`  • Payments: ${cases.length}`);
    logger.info(`  • Consultation Slots: ${slots.length}`);
    logger.info(`  • Consultation Bookings: ${bookings.length}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (e) {
    logger.error('❌ Seed failed:', e.message || e);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

seed();
