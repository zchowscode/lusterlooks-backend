const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// DATABASE
const db = new sqlite3.Database("./data.db");

// Create tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      phone TEXT,
      message TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      product TEXT
    )
  `);
});

// HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Backend running" });
});

// CONTACT FORM
app.post("/api/contact", (req, res) => {
  const { name, email, phone, message } = req.body;

  if (!email.endsWith("@gmail.com") && !email.endsWith("@yahoo.com")) {
    return res.status(400).json({ error: "Email must be Gmail or Yahoo" });
  }

  db.run(
    "INSERT INTO contacts (name, email, phone, message) VALUES (?, ?, ?, ?)",
    [name, email, phone, message]
  );

  res.json({ success: true });
});

// ORDER
app.post("/api/order", (req, res) => {
  const { name, phone, product } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: "Name and phone required" });
  }

  db.run(
    "INSERT INTO orders (name, phone, product) VALUES (?, ?, ?)",
    [name, phone, product]
  );

  res.json({ success: true });
});

// ADMIN VIEW
app.get("/api/admin/orders", (req, res) => {
  db.all("SELECT * FROM orders", [], (err, rows) => {
    res.json(rows);
  });
});

app.get("/api/admin/contacts", (req, res) => {
  db.all("SELECT * FROM contacts", [], (err, rows) => {
    res.json(rows);
  });
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
