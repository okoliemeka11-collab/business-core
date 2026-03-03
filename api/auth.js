// api/auth.js — Scrivlo Authentication API v1.0
// Handles: POST /api/auth/signup, POST /api/auth/login, POST /api/auth/logout
// Zero external dependencies — pure Node.js crypto.
// Storage: in-memory Map (replace with Vercel KV for persistence across cold starts).
// JWT: HMAC-SHA256, 7-day expiry.
// Passwords: PBKDF2-SHA256, 100k iterations.

const crypto = require('crypto');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const SECRET = process.env.AUTH_SECRET || 'scrivlo-dev-secret-change-in-prod';
const TOKEN_TTL_SECONDS = 7 * 24 * 3600; // 7 days
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

// ── IN-MEMORY USER STORE ─────────────────────────────────────────────────────
// WARNING: resets on cold start. Replace with Vercel KV (free tier) for production.
// Schema: Map<email, { id, email, passwordHash, salt, tier, createdAt }>
const users = new Map();

// ── CRYPTO HELPERS ────────────────────────────────────────────────────────────
function hashPassword(password, salt) {
    return new Promise((resolve, reject) => {
          crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST, (err, key) => {
                  if (err) reject(err);
                  else resolve(key.toString('hex'));
          });
    });
}

function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

// ── JWT HELPERS ───────────────────────────────────────────────────────────────
function createToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(header + '.' + body).digest('base64url');
              return header + '.' + body + '.' + sig;
}

function verifyToken(token) {
    try {
          const parts = token.split('.');
          if (parts.length !== 3) return null;
          const [header, payload, sig] = parts;
          const expectedSig = crypto.createHmac('sha256', SECRET).update(header + '.' + payload).digest('base64url');
          if (sig !== expectedSig) return null;
          const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
          if (data.exp && Date.now() / 1000 > data.exp) return null;
          return data;
    } catch (e) {
          return null;
    }
}

// ── COOKIE HELPER ─────────────────────────────────────────────────────────────
function setTokenCookie(res, token) {
    const maxAge = TOKEN_TTL_SECONDS;
    res.setHeader('Set-Cookie',
                      'scrivlo_token=' + encodeURIComponent(token) +
                      '; Max-Age=' + maxAge +
                      '; Path=/' +
                      '; HttpOnly' +
                      '; SameSite=Strict' +
                      (process.env.NODE_ENV === 'production' ? '; Secure' : '')
                    );
}

function clearTokenCookie(res) {
    res.setHeader('Set-Cookie',
                      'scrivlo_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict'
                    );
}

// ── ROUTE HANDLERS ────────────────────────────────────────────────────────────
async function handleSignup(req, res) {
    const { email, password, name } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ error: 'invalid_email', message: 'Please enter a valid email address.' });
  }
    if (!password || typeof password !== 'string' || password.length < 8) {
          return res.status(400).json({ error: 'weak_
