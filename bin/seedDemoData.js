/**
 * Demo data seeder for Patent CRM.
 * Creates realistic clients, cases, documents, deadlines, payments, and notes.
 * Run: node bin/seedDemoData.js
 */

require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../utils/config');

const User = require('../models/User');
const Client = require('../models/Client');
const Case = require('../models/Case');
const Document = require('../models/Document');
const Deadline = require('../models/Deadline');
const Payment = require('../models/Payment');
const CaseNote = require('../models/CaseNote');

const CLIENTS = [
  { name: 'TechVision Solutions', email: 'contact@techvision.com', phone: '+91-9876-543-210', domain: 'Software & AI Patents' },
  { name: 'BioInnovate Labs', email: 'info@bioinnovate.com', phone: '+91-9876-543-211', domain: 'Biotech & Pharmaceutical' },
  { name: 'GreenEnergy Systems', email: 'legal@greenenergy.com', phone: '+91-9876-543-212', domain: 'Renewable Energy' },
  { name: 'FinTech Dynamics', email: 'patents@fintechdyn.com', phone: '+91-9876-543-213', domain: 'Financial Technology' },
  { name: 'MediCare Innovations', email: 'ip@medicare.in', phone: '+91-9876-543-214', domain: 'Medical Devices' },
  { name: 'AgriTech Global', email: 'legal@agritech.com', phone: '+91-9876-543-215', domain: 'Agricultural Technology' },
  { name: 'AutoDrive Tech', email: 'patents@autodrive.com', phone: '+91-9876-543-216', domain: 'Autonomous Vehicles' },
  { name: 'IoT Solutions India', email: 'info@iotsol.com', phone: '+91-9876-543-217', domain: 'Internet of Things' }
];

const INVENTIONS = [
  { title: 'AI-powered Document Analysis System', domain: 'Software', summary: 'Machine learning algorithm for automated document classification and processing' },
  { title: 'Novel Drug Delivery Mechanism', domain: 'Biotech', summary: 'Nanotechnology-based targeted drug delivery system for cancer treatment' },
  { title: 'Solar Panel Efficiency Enhancement', domain: 'Renewable Energy', summary: 'New coating technology to increase photovoltaic cell efficiency by 23%' },
  { title: 'Blockchain-based Payment Gateway', domain: 'FinTech', summary: 'Decentralized payment system with smart contract integration' },
  { title: 'Wearable ECG Monitor', domain: 'Medical', summary: 'Compact wearable device for continuous cardiac monitoring' },
  { title: 'Precision Agriculture IoT Platform', domain: 'Agriculture', summary: 'Real-time crop monitoring system using wireless sensor networks' },
  { title: 'Autonomous Vehicle Navigation System', domain: 'Automotive', summary: 'Advanced LiDAR-based autonomous driving system' },
  { title: 'Smart Water Management System', domain: 'IoT', summary: 'IoT platform for automated irrigation and water conservation' },
  { title: 'Quantum Computing Algorithm', domain: 'Software', summary: 'Novel quantum algorithm for optimization problems' },
  { title: 'Biodegradable Polymer Composite', domain: 'Materials', summary: 'Eco-friendly composite material for industrial applications' },
  { title: 'Computer Vision Quality Control', domain: 'Software', summary: 'Real-time defect detection using deep learning' },
  { title: 'Enzyme-based Biosensor', domain: 'Biotech', summary: 'Rapid diagnostic biosensor for viral detection' }
];

const STATUSES = [
  'INTAKE_RECEIVED',
  'QUALIFIED',
  'PRIOR_ART_DELIVERED',
  'DISCLOSURE_APPROVED',
  'STRATEGY_LOCKED',
  'QUOTE_SENT',
  'DRAFTING_IN_PROGRESS',
  'FILED',
  'PUBLISHED',
  'EXAMINATION_IN_PROGRESS',
  'GRANTED',
  'PATENT_ACTIVE'
];

const JURISDICTIONS = [
  ['india', 'usa'],
  ['india', 'usa', 'pct'],
  ['india'],
  ['usa', 'pct'],
  ['india', 'pct'],
  ['usa'],
  ['india', 'usa'],
  ['pct'],
  ['india', 'usa', 'pct'],
  ['usa', 'pct']
];

const DOC_TYPES = [
  'intake_form', 'invention_disclosure', 'prior_art_report',
  'draft_v1', 'draft_final', 'filing_receipt', 'application_copy',
  'fer', 'objection_response', 'grant_certificate', 'vendor_brief'
];

const seedDemoData = async () => {
  try {
    await mongoose.connect(config.database.uri.replace('localhost', '127.0.0.1'));
    logger.info('📊 Starting demo data seed...');

    // Fetch seed users
    const users = await User.find({ email: { $in: [
      'varun@gmail.com',
      'manish.baviskar@euproximax.com',
      'jyoti.chaudhari@euproximax.com',
      'praveen.shinde@euproximax.com'
    ] } }).lean();
    const userMap = Object.fromEntries(users.map(u => [u.email, u._id]));

    logger.info(`👥 Found ${users.length} seed users`);

    // Create clients
    logger.info('🏢 Creating clients...');
    const createdClients = [];
    for (const clientData of CLIENTS) {
      let client = await Client.findOne({ email: clientData.email });
      if (!client) {
        client = await Client.create(clientData);
        logger.info(`   ✅ Created client: ${client.name}`);
      }
      createdClients.push(client);
    }

    // Create 10+ cases with realistic variety
    logger.info('📋 Creating cases...');
    const attorneys = [userMap['jyoti.chaudhari@euproximax.com'], userMap['praveen.shinde@euproximax.com']];
    const pm = userMap['manish.baviskar@euproximax.com'];
    let caseCount = 0;

    for (let i = 0; i < 12; i++) {
      const clientIdx = i % createdClients.length;
      const client = createdClients[clientIdx];
      const inv = INVENTIONS[i % INVENTIONS.length];
      const track = i % 3 === 0 ? 'B' : 'A'; // ~30% B track, ~70% A track
      const phase = Math.floor(Math.random() * 9) + 1;
      const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];

      let caseDoc = await Case.findOne({ caseNumber: `PAT-${2026}-${String(1001 + i).padStart(4, '0')}` });
      if (!caseDoc) {
        caseDoc = await Case.create({
          caseNumber: `PAT-${2026}-${String(1001 + i).padStart(4, '0')}`,
          clientId: client._id,
          track,
          status,
          phase,
          inventionTitle: inv.title,
          inventionDomain: inv.domain,
          inventionSummary: inv.summary,
          filingType: ['provisional', 'complete', 'pct'][Math.floor(Math.random() * 3)],
          jurisdiction: JURISDICTIONS[i % JURISDICTIONS.length],
          assignedPM: pm,
          assignedAttorney: attorneys[i % attorneys.length],
          applicationNumber: `IN${String(2024).padStart(2, '0')}A${String(i + 1).padStart(6, '0')}`,
          filingDate: new Date(2024, Math.floor(Math.random() * 6), Math.floor(Math.random() * 28) + 1),
          statusHistory: [
            {
              status: 'INTAKE_RECEIVED',
              changedBy: pm,
              changedAt: new Date(2024, 0, 15),
              note: 'Case created'
            }
          ],
          isOnHold: Math.random() < 0.1 // 10% on hold
        });
        logger.info(`   ✅ Created case: ${caseDoc.caseNumber} for ${client.name}`);
        caseCount++;
      }

      // Add documents (3-5 per case)
      const docCount = Math.floor(Math.random() * 3) + 3;
      for (let d = 0; d < docCount; d++) {
        const docType = DOC_TYPES[Math.floor(Math.random() * DOC_TYPES.length)];
        const docName = `${docType.replace('_', '-').toUpperCase()}_${caseDoc.caseNumber}_v${d + 1}.pdf`;

        let doc = await Document.findOne({ caseId: caseDoc._id, name: docName });
        if (!doc) {
          doc = await Document.create({
            caseId: caseDoc._id,
            name: docName,
            type: docType,
            fileSize: Math.floor(Math.random() * 5000) + 500,
            uploadedAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000),
            uploadedBy: attorneys[i % attorneys.length],
            isVisibleToClient: Math.random() < 0.7 // 70% visible
          });
        }
      }

      // Add deadlines (2-4 per case)
      const deadlineCount = Math.floor(Math.random() * 3) + 2;
      for (let dl = 0; dl < deadlineCount; dl++) {
        const daysAhead = Math.floor(Math.random() * 180) + 5;
        const statutoryDeadline = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
        const deadlineTypes = ['rfe_filing', 'fer_response', 'hearing', 'renewal', 'payment_due', 'custom'];
        const deadlineLabels = [
          'RFE Filing Deadline',
          'FER Response Required',
          'Hearing Scheduled',
          'Renewal Payment Due',
          'Office Action Response',
          'Amendment Submission'
        ];
        const type = deadlineTypes[Math.floor(Math.random() * deadlineTypes.length)];
        const label = deadlineLabels[Math.floor(Math.random() * deadlineLabels.length)];

        let deadline = await Deadline.findOne({ caseId: caseDoc._id, label });
        if (!deadline) {
          deadline = await Deadline.create({
            caseId: caseDoc._id,
            label,
            type,
            statutoryDeadline,
            status: Math.random() < 0.9 ? 'active' : 'completed',
            createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
          });
        }
      }

      // Add payments (1-3 per case)
      const paymentCount = Math.floor(Math.random() * 3) + 1;
      const paymentTypes = [
        'prior_art_search',
        'prototype',
        'drafting',
        'filing_govt',
        'examination',
        'objection_response',
        'renewal_govt'
      ];
      const milestoneLabels = [
        'Prior Art Search',
        'Prototype Development',
        'Drafting & Filing',
        'Government Filing Fees',
        'Examination Fees',
        'Objection Response',
        'Renewal Fee Year 1'
      ];

      for (let p = 0; p < paymentCount; p++) {
        const type = paymentTypes[p % paymentTypes.length];
        const milestone = milestoneLabels[p % milestoneLabels.length];
        const baseAmount = Math.floor(Math.random() * 40000) + 10000;
        const gst = baseAmount * 0.18;
        const total = baseAmount + gst;
        const status = ['pending', 'invoice_sent', 'paid'][Math.floor(Math.random() * 3)];

        let payment = await Payment.findOne({ caseId: caseDoc._id, type });
        if (!payment) {
          payment = await Payment.create({
            caseId: caseDoc._id,
            clientId: client._id,
            milestoneLabel: milestone,
            type,
            amount: baseAmount,
            currency: 'INR',
            gstPercent: 18,
            gstAmount: gst,
            totalAmount: total,
            status,
            createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
            invoicedAt: status !== 'pending' ? new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000) : null,
            paidAt: status === 'paid' ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) : null
          });
        }
      }

      // Add some internal notes (2-3 per case)
      const noteCount = Math.floor(Math.random() * 2) + 1;
      for (let n = 0; n < noteCount; n++) {
        const noteTexts = [
          'Client confirmed invention details. Ready to file.',
          'Office action received. Coordinating response with attorney.',
          'Payment received. Proceeding to next milestone.',
          'Specification filed successfully. Awaiting examination.',
          'Client wants to expand to European and Japanese jurisdictions.',
          'Strong examination report. Likely to be granted within 6 months.',
          'Follow-up with client for additional technical details.',
          'Competitor found similar patent. Reviewing for overlap.'
        ];
        const noteText = noteTexts[Math.floor(Math.random() * noteTexts.length)];

        let note = await CaseNote.findOne({ caseId: caseDoc._id, body: noteText });
        if (!note) {
          note = await CaseNote.create({
            caseId: caseDoc._id,
            authorId: [pm, attorneys[0], attorneys[1]][Math.floor(Math.random() * 3)],
            body: noteText,
            createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
          });
        }
      }
    }

    logger.info(`✅ Demo data seed complete!`);
    logger.info(`   📋 ${caseCount} cases created`);
    logger.info(`   🏢 ${createdClients.length} clients created`);
    logger.info(`   📄 Documents, deadlines, payments, and notes added`);
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
};

seedDemoData();
