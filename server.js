require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database setup ──────────────────────────────────────────
const db = new Database(path.join(__dirname, 'data', 'lusterlooks.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS newsletter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    items TEXT NOT NULL,
    total TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Middleware ──────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiters ───────────────────────────────────────────
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many submissions. Please wait 15 minutes and try again.' }
});

const adminLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please wait 10 minutes.' }
});

// ── Helpers ─────────────────────────────────────────────────
const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.in'];

function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(email)) return false;
  const domain = email.split('@')[1].toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

function isValidPhone(phone) {
  // Must be 7–15 digits, can include spaces, dashes, parens, +
  return /^[\+\d][\d\s\-\(\)]{6,17}$/.test(phone.trim());
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'lusterlooks2025';

// ── Routes ──────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Luster Looks backend running' });
});

// Contact form
app.post('/api/contact', formLimiter, (req, res) => {
  const { name, email, phone, message } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required.' });
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Email must be a @gmail.com or @yahoo.com address.' });
  }

  try {
    db.prepare(
      'INSERT INTO contacts (name, email, phone, message) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), email.trim().toLowerCase(), phone?.trim() || '', message?.trim() || '');

    res.json({ success: true, message: 'Thank you! We\'ll be in touch soon.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Newsletter signup
app.post('/api/newsletter', formLimiter, (req, res) => {
  const { email } = req.body;

  if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required.' });
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Email must be a @gmail.com or @yahoo.com address.' });
  }

  try {
    db.prepare('INSERT OR IGNORE INTO newsletter (email) VALUES (?)').run(email.trim().toLowerCase());
    res.json({ success: true, message: 'You\'re on the list!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Place order — requires name + phone
app.post('/api/order', formLimiter, (req, res) => {
  const { name, phone, email, items, total } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'Full name is required.' });
  if (!phone || !phone.trim()) return res.status(400).json({ error: 'Phone number is required.' });
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'Please enter a valid phone number.' });
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: 'Email must be a @gmail.com or @yahoo.com address.' });
  }
  if (!items || !total) return res.status(400).json({ error: 'Order data missing.' });

  try {
    const result = db.prepare(
      'INSERT INTO orders (name, phone, email, items, total) VALUES (?, ?, ?, ?, ?)'
    ).run(
      name.trim(),
      phone.trim(),
      email?.trim().toLowerCase() || '',
      typeof items === 'string' ? items : JSON.stringify(items),
      total
    );

    res.json({
      success: true,
      orderId: result.lastInsertRowid,
      message: 'Order received! We\'ll contact you shortly to confirm.'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Admin Login ─────────────────────────────────────────────
app.post('/api/admin/login', adminLimiter, (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: Buffer.from(ADMIN_PASSWORD + ':lusterlooks').toString('base64') });
  } else {
    res.status(401).json({ error: 'Incorrect password.' });
  }
});

// Admin middleware
function requireAdmin(req, res, next) {
  const auth = req.headers['x-admin-token'];
  const expected = Buffer.from(ADMIN_PASSWORD + ':lusterlooks').toString('base64');
  if (auth !== expected) return res.status(401).json({ error: 'Unauthorized.' });
  next();
}

// Admin: get all contacts
app.get('/api/admin/contacts', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all();
  res.json(rows);
});

// Admin: get all newsletter emails
app.get('/api/admin/newsletter', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM newsletter ORDER BY created_at DESC').all();
  res.json(rows);
});

// Admin: get all orders
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') })));
});

// Admin: update order status
app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Luster Looks backend running on port ${PORT}`);
});
