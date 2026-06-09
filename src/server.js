// Redline Employee Portal — Express server.
// Serves the static frontend and a small JSON API that sits in front of
// Supabase (Auth + Postgres).
import express from 'express';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { loadProfile } from './middleware/auth.js';
import { seedAdmin } from './seedAdmin.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import officeDayRoutes from './routes/officeDays.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const app = express();

// Behind a proxy/load balancer in production so Secure cookies work.
if (config.isProd) app.set('trust proxy', 1);

app.use(express.json());

// Serve the static frontend first: asset/page requests are answered here and
// never touch the session middleware or the per-request profile DB lookup.
app.use(express.static(publicDir));

app.use(
  session({
    name: 'connect.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// Make req.profile available to every API route.
app.use(loadProfile);

// ---- API ----
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/office-days', officeDayRoutes);

// Health check.
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Unknown API routes -> JSON 404 (don't fall through to anything else).
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Central error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Malformed JSON body and similar client errors come through with a status.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(config.port, () => {
  console.log(`\n  Redline Employee Portal running at http://localhost:${config.port}\n`);
  seedAdmin();
});
