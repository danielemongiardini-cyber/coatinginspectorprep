const crypto = require('crypto');
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Generate a unique access code: COAT-XXXX-XXXX
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0,O,1,I to avoid confusion
  let code = 'COAT-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Determine product type from Stripe line items
function getProductType(productName) {
  const name = (productName || '').toLowerCase();
  if (name.includes('bundle')) return 'bundle';
  if (name.includes('exam')) return 'exam';
  if (name.includes('study')) return 'study';
  return 'study';
}

// Insert code into Supabase
async function insertCode(code, orderId, productType) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      code,
      order_id: `${productType}_${orderId}`,
      used: false
    });

    const url = new URL(`${SUPABASE_URL}/rest/v1/access_codes`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          reject(new Error(`Supabase error: ${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Send email via Resend
async function sendEmail(toEmail, code, productType) {
  const productNames = {
    study: 'Study Mode',
    exam: 'Exam Mode',
    bundle: 'Complete Bundle (Study + Exam)'
  };
  const accessUrls = {
    study: 'https://coatinginspectorprep.com/access',
    exam: 'https://coatinginspectorprep.com/access',
    bundle: 'https://coatinginspectorprep.com/access'
  };

  const productName = productNames[productType] || 'Practice Test';
  const accessUrl = accessUrls[productType];

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'DM Sans', Arial, sans-serif; background: #F4F1EC; margin: 0; padding: 0; }
  .container { max-width: 560px; margin: 40px auto; background: #FDFCFA; border-radius: 10px; overflow: hidden; border: 1px solid #D4CFC6; }
  .header { background: #1A2B3C; padding: 32px 40px; text-align: center; }
  .header h1 { color: #fff; font-size: 1.1rem; margin: 0; letter-spacing: 1px; }
  .header span { color: #E8960A; }
  .body { padding: 40px; }
  .body h2 { color: #1A2B3C; font-size: 1.2rem; margin: 0 0 12px; }
  .body p { color: #6B7A8D; font-size: 0.9rem; line-height: 1.7; margin: 0 0 20px; }
  .code-box { background: #1A2B3C; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0; }
  .code { font-family: 'Courier New', monospace; font-size: 1.8rem; font-weight: bold; color: #E8960A; letter-spacing: 4px; }
  .code-label { color: rgba(255,255,255,0.5); font-size: 0.7rem; letter-spacing: 3px; margin-top: 8px; }
  .btn { display: block; background: #C8760A; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 5px; font-weight: 600; font-size: 0.95rem; text-align: center; margin: 24px 0; }
  .footer { padding: 24px 40px; border-top: 1px solid #D4CFC6; text-align: center; }
  .footer p { color: #9CA8B4; font-size: 0.75rem; margin: 0; line-height: 1.7; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>COATING<span>INSPECTOR</span>PREP</h1>
  </div>
  <div class="body">
    <h2>Your access code is ready 🎉</h2>
    <p>Thank you for purchasing <strong>${productName}</strong>. Your unique access code is below — keep it safe.</p>
    <div class="code-box">
      <div class="code">${code}</div>
      <div class="code-label">YOUR ACCESS CODE</div>
    </div>
    <p>To start your preparation, click the button below and enter your code on the access page.</p>
    <a href="${accessUrl}" class="btn">Access My Test →</a>
    <p style="font-size:0.82rem">Your code can be used unlimited times — questions are randomized each session. If you have any issues, reply to this email.</p>
  </div>
  <div class="footer">
    <p>This product is independently developed and is not affiliated with, endorsed by, or licensed by any professional certification body.</p>
    <p style="margin-top:8px">© 2025 Smart Coating Ltd · Attard, Malta</p>
  </div>
</div>
</body>
</html>`;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      from: 'Coating Inspector Exam Prep <noreply@coatinginspectorprep.com>',
      to: [toEmail],
      subject: `Your access code for ${productName} — Coating Inspector Exam Prep`,
      html: htmlBody
    });

    const options = {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          reject(new Error(`Resend error: ${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Verify Stripe webhook signature
function verifyStripeSignature(payload, sigHeader, secret) {
  if (!secret) return true; // Skip verification if no secret set yet
  const parts = sigHeader.split(',');
  const timestamp = parts.find(p => p.startsWith('t=')).split('=')[1];
  const signature = parts.find(p => p.startsWith('v1=')).split('=').slice(1).join('=');
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let stripeEvent;
  try {
    const sig = event.headers['stripe-signature'];
    if (STRIPE_WEBHOOK_SECRET && sig) {
      verifyStripeSignature(event.body, sig, STRIPE_WEBHOOK_SECRET);
    }
    stripeEvent = JSON.parse(event.body);
  } catch (err) {
    console.error('Webhook parse error:', err);
    return { statusCode: 400, body: `Webhook error: ${err.message}` };
  }

  // Only handle successful payments
  if (stripeEvent.type !== 'checkout.session.completed' && 
      stripeEvent.type !== 'payment_intent.succeeded') {
    return { statusCode: 200, body: 'Event ignored' };
  }

  try {
    const session = stripeEvent.data.object;
    const email = session.customer_details?.email || session.receipt_email || session.metadata?.email;
    const orderId = session.id || session.payment_intent;
    
    // Get product name from metadata or line items description
    const productName = session.metadata?.product_name || 
                       session.description || 
                       'Coating Inspector Exam Prep';
    const productType = getProductType(productName);

    if (!email) {
      console.error('No email found in session:', JSON.stringify(session).slice(0, 200));
      return { statusCode: 200, body: 'No email found' };
    }

    // For bundle: generate 2 codes
    const codes = [];
    if (productType === 'bundle') {
      const code1 = generateCode();
      const code2 = generateCode();
      await insertCode(code1, orderId + '_study', 'study');
      await insertCode(code2, orderId + '_exam', 'exam');
      codes.push({ code: code1, type: 'study' });
      codes.push({ code: code2, type: 'exam' });
    } else {
      const code = generateCode();
      await insertCode(code, orderId, productType);
      codes.push({ code, type: productType });
    }

    // Send email
    await sendEmail(email, codes.map(c => c.code).join(' / '), productType);

    console.log(`✅ Code(s) sent to ${email} for ${productType}`);
    return { statusCode: 200, body: JSON.stringify({ success: true, codes: codes.length }) };

  } catch (err) {
    console.error('Webhook handler error:', err);
    return { statusCode: 500, body: `Server error: ${err.message}` };
  }
};
