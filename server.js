const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3");

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = path.join(__dirname, "library.db");
const SESSION_SECRET =
  process.env.SESSION_SECRET || "dev-secret-change-in-production";

/** @param {sqlite3.Database} db */
function exec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** @param {sqlite3.Database} db */
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/** @param {sqlite3.Database} db */
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/** @param {sqlite3.Database} db */
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function openDatabase(filePath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filePath, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const app = express();

/** @type {sqlite3.Database | null} */
let db = null;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))
  );
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    page_count INTEGER NOT NULL,
    isbn TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_books_user_id ON books(user_id);
`;

async function ensureAdminFromEnv(database) {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email || !password) {
    console.warn(
      "[library] ADMIN_EMAIL ve ADMIN_PASSWORD tanımlı değil; seed admin oluşturulmadı."
    );
    return;
  }
  const row = await get(database, "SELECT id FROM users WHERE email = ?", [
    email,
  ]);
  if (row) return;
  const hash = await bcrypt.hash(password, 10);
  await run(
    database,
    "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')",
    [email, hash]
  );
  console.log("[library] Admin kullanıcı oluşturuldu:", email);
}

app.use(express.json());

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  })
);

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Giriş gerekli." });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== "admin") {
    return res.status(403).json({ error: "Yetkisiz." });
  }
  next();
}

app.post(
  "/api/register",
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) {
      return res.status(400).json({ error: "E-posta ve şifre gerekli." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Şifre en az 6 karakter olmalı." });
    }
    try {
      const hash = await bcrypt.hash(password, 10);
      const info = await run(
        db,
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'user')",
        [email, hash]
      );
      req.session.userId = info.lastID;
      req.session.email = email;
      req.session.role = "user";
      return res.json({ id: info.lastID, email, role: "user" });
    } catch (e) {
      if (e && e.code === "SQLITE_CONSTRAINT") {
        return res.status(409).json({ error: "Bu e-posta zaten kayıtlı." });
      }
      console.error(e);
      return res.status(500).json({ error: "Sunucu hatası." });
    }
  })
);

app.post(
  "/api/login",
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) {
      return res.status(400).json({ error: "E-posta ve şifre gerekli." });
    }
    const user = await get(
      db,
      "SELECT id, email, password_hash, role FROM users WHERE email = ?",
      [email]
    );
    const ok =
      user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      return res.status(401).json({ error: "E-posta veya şifre hatalı." });
    }
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.role = user.role;
    return res.json({ id: user.id, email: user.email, role: user.role });
  })
);

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Giriş yok." });
  }
  res.json({
    id: req.session.userId,
    email: req.session.email,
    role: req.session.role,
  });
});

app.get(
  "/api/books",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await all(
      db,
      `SELECT id, title, author, page_count, isbn, notes, created_at
       FROM books WHERE user_id = ? ORDER BY id DESC`,
      [req.session.userId]
    );
    res.json(rows);
  })
);

app.post(
  "/api/books",
  requireAuth,
  asyncHandler(async (req, res) => {
    const title = String(req.body.title || "").trim();
    const author = String(req.body.author || "").trim();
    const pageCount = Number(req.body.page_count);
    const isbn = String(req.body.isbn || "").trim();
    const notes = String(req.body.notes || "").trim();

    if (!title || !author) {
      return res.status(400).json({ error: "Kitap adı ve yazar gerekli." });
    }
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      return res
        .status(400)
        .json({ error: "Sayfa sayısı pozitif bir tam sayı olmalı." });
    }

    const info = await run(
      db,
      `INSERT INTO books (user_id, title, author, page_count, isbn, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.session.userId, title, author, pageCount, isbn, notes]
    );

    const row = await get(
      db,
      `SELECT id, title, author, page_count, isbn, notes, created_at FROM books WHERE id = ?`,
      [info.lastID]
    );
    res.status(201).json(row);
  })
);

app.delete(
  "/api/books/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Geçersiz kitap id." });
    }
    const info = await run(db, "DELETE FROM books WHERE id = ? AND user_id = ?", [
      id,
      req.session.userId,
    ]);
    if (info.changes === 0) {
      return res
        .status(403)
        .json({ error: "Kitap bulunamadı veya size ait değil." });
    }
    res.json({ ok: true });
  })
);

app.get(
  "/api/admin/users",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const rows = await all(
      db,
      "SELECT id, email, role FROM users ORDER BY id ASC",
      []
    );
    res.json(rows);
  })
);

const publicDir = path.join(__dirname, "public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

app.use(express.static(publicDir));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: "Sunucu hatası." });
});

async function main() {
  db = await openDatabase(DB_PATH);
  await run(db, "PRAGMA journal_mode = WAL;");
  await exec(db, SCHEMA_SQL);
  await ensureAdminFromEnv(db);

  app.listen(PORT, () => {
    console.log(`Kütüphane sunucusu http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Sunucu başlatılamadı:", err);
  process.exit(1);
});
