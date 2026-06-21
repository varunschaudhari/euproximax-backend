/**
 * Razorpay integration (dependency-free).
 *
 * Per the "mixed integrations" decision, Razorpay is the real payment gateway.
 * This util uses Node's global fetch (orders API) + crypto (signature checks),
 * so no SDK dependency is required. All functions are gated on env config; when
 * keys are missing they throw a clear, catchable error instead of failing
 * obscurely — the rest of the CRM (manual confirmation) still works without keys.
 *
 * Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
 */
const crypto = require('crypto');
const logger = require('./logger');

const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

const isConfigured = () => Boolean(KEY_ID && KEY_SECRET);

/**
 * Create a Razorpay order for a payment.
 * @param {Object} payment - a Payment document (needs totalAmount, currency, invoiceNumber, _id, caseId)
 * @returns {Promise<Object>} the Razorpay order
 */
const createOrder = async (payment) => {
  if (!isConfigured()) {
    const err = new Error('Razorpay is not configured (set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)');
    err.statusCode = 503;
    throw err;
  }

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const body = {
    amount: Math.round((payment.totalAmount || payment.amount) * 100), // paise
    currency: payment.currency || 'INR',
    receipt: payment.invoiceNumber || String(payment._id),
    notes: {
      caseId: payment.caseId?.toString?.() || '',
      paymentId: payment._id?.toString?.() || '',
      milestoneLabel: payment.milestoneLabel || ''
    }
  };

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) {
    logger.error('Razorpay order creation failed', { status: res.status, data });
    const err = new Error(data?.error?.description || 'Razorpay order creation failed');
    err.statusCode = 502;
    throw err;
  }
  return data;
};

/**
 * Verify a Razorpay webhook signature (X-Razorpay-Signature header).
 * @param {string} rawBody - the raw/stringified request body
 * @param {string} signature - header value
 */
const verifyWebhookSignature = (rawBody, signature) => {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  // timingSafeEqual requires equal-length buffers
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * Verify a checkout signature (razorpay_order_id|razorpay_payment_id) returned
 * to the client after a successful payment.
 */
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  if (!KEY_SECRET || !signature) return false;
  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = {
  isConfigured,
  createOrder,
  verifyWebhookSignature,
  verifyPaymentSignature,
  KEY_ID
};
