import http from 'http';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import dotenv from 'dotenv';
import { eq, sql } from 'drizzle-orm';
import { db, isDatabaseConfigured } from './src/db/index.ts';
import { coinPackages, users } from './src/db/schema.ts';
import {
  authenticateLocalUser,
  createEncryptedTransaction,
  ensureInitialSeed,
  getAdminOverview,
  getAllTransactionsAdmin,
  getCoinPackageById,
  getCoinPackages,
  getLeaderboard,
  getNotifications,
  getTournamentsWithRegistrations,
  getUserMatchHistory,
  getUserTransactions,
  joinTournament,
  markNotificationsRead,
  registerLocalUser,
  updateTournamentAdmin,
  updateUserLocale,
  createTournamentAdmin,
  type DbUser,
} from './src/db/repository.ts';
import { signSessionToken } from './src/lib/crypto.ts';
import {
  type AuthRequest,
  optionalAuth,
  requireAdmin,
  requireAuth,
} from './src/middleware/auth.ts';
import {
  attachWebSocketServer,
  broadcastPushNotification,
  listPublicRooms,
} from './src/server/realtime.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));

function sanitizeUser(u: DbUser) {
  return {
    id: u.id,
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    avatarUrl: u.avatarUrl,
    locale: u.locale,
    coinBalance: u.coinBalance,
    winsIndividual: u.winsIndividual,
    winsTeam: u.winsTeam,
    winsTournament: u.winsTournament,
    losses: u.losses,
    gamesPlayed: u.gamesPlayed,
    capicuas: u.capicuas,
    zapatosDealt: u.zapatosDealt,
    eloRating: u.eloRating,
    totalPointsScored: u.totalPointsScored,
  };
}

function extractDbErrorCode(error: unknown): string {
  const err = error as { code?: string; cause?: { code?: string; message?: string }; message?: string };
  return String(err?.cause?.code || err?.code || '');
}

function isDbConnectionError(error: unknown): boolean {
  const code = extractDbErrorCode(error);
  const msg = String(
    (error as { cause?: { message?: string }; message?: string })?.cause?.message ||
      (error as { message?: string })?.message ||
      ''
  ).toLowerCase();
  return (
    ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', '28P01', '28000', '3D000', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(code) ||
    msg.includes('econnrefused') ||
    msg.includes('ssl') ||
    msg.includes('password authentication failed') ||
    msg.includes('no pg_hba.conf entry')
  );
}

// Health check for Cloud Run and OnRender
app.get('/api/health', async (_req, res) => {
  if (!isDatabaseConfigured()) {
    return res.json({
      status: 'ok',
      service: 'quisqueya-domino-3d',
      database: 'not_configured',
      timestamp: Date.now(),
    });
  }
  try {
    await db.execute(sql`SELECT 1`);
    return res.json({
      status: 'ok',
      service: 'quisqueya-domino-3d',
      database: 'connected',
      timestamp: Date.now(),
    });
  } catch (err) {
    return res.json({
      status: 'ok',
      service: 'quisqueya-domino-3d',
      database: 'error',
      dbCode: extractDbErrorCode(err) || 'UNKNOWN',
      timestamp: Date.now(),
    });
  }
});

// Auth endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body || {};
    const cleanEmail = String(email || '').trim();
    if (!cleanEmail || !cleanEmail.includes('@') || !password || String(password).length < 4) {
      return res.status(400).json({ error: 'Correo válido y contraseña (mínimo 4 caracteres) requeridos' });
    }
    const user = await registerLocalUser(cleanEmail, String(password), String(displayName || ''));
    const token = signSessionToken({ uid: user.uid, email: user.email, role: user.role });
    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'EMAIL_EXISTS') {
        return res.status(409).json({ error: 'Este correo ya está registrado' });
      }
      if (error.message === 'DB_NOT_CONFIGURED') {
        return res.status(503).json({
          error: 'Base de datos no conectada: agrega PostgreSQL (DATABASE_URL) en Render.',
        });
      }
    }
    if (isDbConnectionError(error)) {
      return res.status(503).json({
        error: 'Error de conexión con PostgreSQL. Verifica DATABASE_URL en Render.',
      });
    }
    console.error('[POST /api/auth/register] Unexpected error:', error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || '').trim();
    if (!cleanEmail || !password) {
      return res.status(400).json({ error: 'Credenciales incompletas' });
    }
    const user = await authenticateLocalUser(cleanEmail, String(password));
    if (!user) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    const token = signSessionToken({ uid: user.uid, email: user.email, role: user.role });
    res.json({ token, user: sanitizeUser(user) });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'DB_NOT_CONFIGURED') {
      return res.status(503).json({
        error: 'Base de datos no conectada: agrega PostgreSQL (DATABASE_URL) en Render.',
      });
    }
    if (isDbConnectionError(error)) {
      return res.status(503).json({
        error: 'Error de conexión con PostgreSQL. Verifica DATABASE_URL en Render.',
      });
    }
    console.error('[POST /api/auth/login] Unexpected error:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.post('/api/auth/firebase', requireAuth, async (req: AuthRequest, res) => {
  res.json({ user: sanitizeUser(req.dbUser!) });
});

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
  res.json({ user: sanitizeUser(req.dbUser!) });
});

app.patch('/api/auth/locale', requireAuth, async (req: AuthRequest, res) => {
  try {
    const updated = await updateUserLocale(req.dbUser!.id, String(req.body?.locale || 'es'));
    res.json({ user: sanitizeUser(updated) });
  } catch {
    res.status(500).json({ error: 'Error updating locale' });
  }
});

// Rooms & Leaderboard & Matches
app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: listPublicRooms() });
});

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const rows = await getLeaderboard();
    res.json({ leaderboard: rows });
  } catch {
    res.status(500).json({ error: 'Error loading leaderboard' });
  }
});

app.get('/api/matches/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const history = await getUserMatchHistory(req.dbUser!.id);
    res.json({ matches: history });
  } catch {
    res.status(500).json({ error: 'Error loading match history' });
  }
});

// Weekly Tournaments
app.get('/api/tournaments', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const list = await getTournamentsWithRegistrations(req.dbUser?.id);
    res.json({ tournaments: list });
  } catch {
    res.status(500).json({ error: 'Error loading tournaments' });
  }
});

app.post('/api/tournaments/:id/join', requireAuth, async (req: AuthRequest, res) => {
  try {
    const tournamentId = Number(req.params.id);
    const teamName = req.body?.teamName ? String(req.body.teamName).slice(0, 40) : undefined;
    const reg = await joinTournament(tournamentId, req.dbUser!.id, teamName);
    broadcastPushNotification({
      title: 'Nueva inscripción de torneo',
      body: `${req.dbUser!.displayName} se unió a un torneo semanal.`,
      category: 'tournament',
    });
    res.status(201).json({ registration: reg });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error joining tournament';
    const statusMap: Record<string, number> = {
      TOURNAMENT_NOT_FOUND: 404,
      TOURNAMENT_CLOSED: 400,
      ALREADY_REGISTERED: 409,
      TOURNAMENT_FULL: 400,
      INSUFFICIENT_COINS: 402,
    };
    res.status(statusMap[msg] || 500).json({ error: msg });
  }
});

// Wallet, Payment Gateways & Encrypted Transactions
app.get('/api/wallet/packages', async (_req, res) => {
  try {
    const packages = await getCoinPackages();
    res.json({ packages });
  } catch {
    res.status(500).json({ error: 'Error loading coin packages' });
  }
});

app.post('/api/wallet/checkout', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { packageId, gateway, cardLast4, payerEmail } = req.body || {};
    const pkg = await getCoinPackageById(Number(packageId));
    if (!pkg || !pkg.active) {
      return res.status(404).json({ error: 'Paquete de monedas no disponible' });
    }

    const allowedGateways = ['stripe', 'paypal', 'azul_rd'];
    const selectedGateway = allowedGateways.includes(String(gateway))
      ? String(gateway)
      : 'stripe';

    // Optional live Stripe PaymentIntent if STRIPE_SECRET_KEY is configured on Render/Cloud
    let externalGatewayRef = `${selectedGateway.toUpperCase()}-${crypto
      .randomBytes(5)
      .toString('hex')
      .toUpperCase()}`;

    if (selectedGateway === 'stripe' && process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
      try {
        const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            amount: String(pkg.priceCents),
            currency: pkg.currency.toLowerCase(),
            'metadata[userId]': String(req.dbUser!.id),
            'metadata[packageCode]': pkg.code,
          }),
        });
        if (stripeRes.ok) {
          const stripeData = (await stripeRes.json()) as { id?: string };
          if (stripeData.id) externalGatewayRef = stripeData.id;
        }
      } catch (stripeErr) {
        console.warn('Stripe live call skipped:', stripeErr);
      }
    }

    const totalCoins = pkg.coinsAmount + pkg.bonusCoins;
    const cleanLast4 = String(cardLast4 || '4242')
      .replace(/\D/g, '')
      .slice(-4)
      .padStart(4, '4');

    const methodLabels: Record<string, string> = {
      stripe: `Tarjeta •••• ${cleanLast4}`,
      paypal: `PayPal (${String(payerEmail || req.dbUser!.email)})`,
      azul_rd: `Azul / Cardnet RD •••• ${cleanLast4}`,
    };

    const result = await createEncryptedTransaction({
      userId: req.dbUser!.id,
      type: 'coin_purchase',
      coinsDelta: totalCoins,
      fiatAmountCents: pkg.priceCents,
      currency: pkg.currency,
      gateway: selectedGateway,
      description: `Compra: ${pkg.name} (${totalCoins} monedas)`,
      sensitiveMeta: {
        gateway: selectedGateway,
        gatewayRef: externalGatewayRef,
        cardLast4: cleanLast4,
        methodLabel: methodLabels[selectedGateway],
        packageCode: pkg.code,
        ipAddress: req.ip || '0.0.0.0',
      },
    });

    broadcastPushNotification({
      title: 'Recarga de Monedas Exitosa',
      body: `+${totalCoins} monedas acreditadas vía ${selectedGateway.toUpperCase()} (${result.transaction.txReference}).`,
      category: 'wallet',
    });

    res.status(201).json({
      txReference: result.transaction.txReference,
      coinsAdded: totalCoins,
      balanceAfter: result.balanceAfter,
      gatewayRef: externalGatewayRef,
    });
  } catch {
    res.status(500).json({ error: 'Error processing payment checkout' });
  }
});

app.get('/api/wallet/transactions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const list = await getUserTransactions(req.dbUser!.id);
    res.json({ transactions: list });
  } catch {
    res.status(500).json({ error: 'Error loading transactions' });
  }
});

// Notifications
app.get('/api/notifications', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const list = await getNotifications(req.dbUser?.id);
    res.json({ notifications: list });
  } catch {
    res.status(500).json({ error: 'Error loading notifications' });
  }
});

app.post('/api/notifications/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    await markNotificationsRead(req.dbUser!.id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error marking notifications read' });
  }
});

// Admin Endpoints (Darlin@sistem.com)
app.get('/api/admin/overview', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const overview = await getAdminOverview();
    res.json(overview);
  } catch {
    res.status(500).json({ error: 'Error loading admin overview' });
  }
});

app.get('/api/admin/transactions', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const ledger = await getAllTransactionsAdmin();
    res.json({ transactions: ledger });
  } catch {
    res.status(500).json({ error: 'Error loading admin ledger' });
  }
});

app.post('/api/admin/tournaments', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      title,
      description,
      mode,
      targetScore,
      entryFeeCoins,
      prizePoolCoins,
      maxPlayers,
      weekLabel,
      startsAt,
    } = req.body || {};

    if (!title) {
      return res.status(400).json({ error: 'Tournament title required' });
    }

    const created = await createTournamentAdmin({
      title: String(title).slice(0, 80),
      description: String(description || 'Torneo oficial semanal de dominó dominicano.'),
      mode: mode === '1v1' ? '1v1' : '2v2',
      targetScore: Number(targetScore) === 100 ? 100 : 200,
      entryFeeCoins: Math.max(0, Number(entryFeeCoins) || 0),
      prizePoolCoins: Math.max(100, Number(prizePoolCoins) || 1000),
      maxPlayers: Math.max(4, Math.min(64, Number(maxPlayers) || 16)),
      weekLabel: String(weekLabel || 'Semana Actual'),
      startsAt: startsAt ? new Date(startsAt) : new Date(Date.now() + 86400000),
      createdByUid: req.dbUser!.uid,
    });

    broadcastPushNotification({
      title: `Nuevo Torneo: ${created.title}`,
      body: `Entrada: ${created.entryFeeCoins} monedas · Bolsa: ${created.prizePoolCoins} monedas.`,
      category: 'tournament',
    });

    res.status(201).json({ tournament: created });
  } catch {
    res.status(500).json({ error: 'Error creating tournament' });
  }
});

app.patch('/api/admin/tournaments/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const updated = await updateTournamentAdmin(Number(req.params.id), {
      status: req.body?.status,
      entryFeeCoins:
        req.body?.entryFeeCoins !== undefined ? Number(req.body.entryFeeCoins) : undefined,
      prizePoolCoins:
        req.body?.prizePoolCoins !== undefined ? Number(req.body.prizePoolCoins) : undefined,
      winnerUserId:
        req.body?.winnerUserId !== undefined ? Number(req.body.winnerUserId) : undefined,
    });

    broadcastPushNotification({
      title: `Torneo Actualizado: ${updated.title}`,
      body: `Estado: ${updated.status.toUpperCase()} · Bolsa: ${updated.prizePoolCoins} monedas.`,
      category: 'tournament',
    });

    res.json({ tournament: updated });
  } catch {
    res.status(500).json({ error: 'Error updating tournament' });
  }
});

app.post('/api/admin/grant-coins', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { targetUserId, amount, reason } = req.body || {};
    const delta = Number(amount);
    if (!targetUserId || !Number.isFinite(delta) || !Number.isSafeInteger(Math.trunc(delta)) || Math.trunc(delta) === 0) {
      return res.status(400).json({ error: 'Valid targetUserId and non-zero safe integer amount required' });
    }
    const result = await createEncryptedTransaction({
      userId: Number(targetUserId),
      type: 'admin_grant',
      coinsDelta: Math.trunc(delta),
      fiatAmountCents: 0,
      gateway: 'system',
      description: String(reason || `Ajuste administrativo por ${req.dbUser!.email}`),
      sensitiveMeta: { adminEmail: req.dbUser!.email, reason: reason || 'admin_grant' },
    });
    res.json(result);
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'INSUFFICIENT_COINS') {
      return res.status(400).json({ error: 'El saldo del jugador no puede quedar negativo' });
    }
    if (code === 'AMOUNT_OUT_OF_RANGE') {
      return res.status(400).json({ error: 'Cantidad fuera del rango permitido' });
    }
    if (code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.status(500).json({ error: 'Error granting coins' });
  }
});

app.patch('/api/admin/packages/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pkgId = Number(req.params.id);
    const { coinsAmount, bonusCoins, priceCents } = req.body || {};
    const updated = await db
      .update(coinPackages)
      .set({
        ...(coinsAmount !== undefined ? { coinsAmount: Number(coinsAmount) } : {}),
        ...(bonusCoins !== undefined ? { bonusCoins: Number(bonusCoins) } : {}),
        ...(priceCents !== undefined ? { priceCents: Number(priceCents) } : {}),
      })
      .where(eq(coinPackages.id, pkgId))
      .returning();
    res.json({ package: updated[0] });
  } catch {
    res.status(500).json({ error: 'Error updating coin package' });
  }
});

const server = http.createServer(app);
attachWebSocketServer(server);

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd && !fs.existsSync(path.join(distDir, 'index.html'))) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!isProd) {
    // Prefer Vite dev middleware in dev mode so live edits always reflect
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  await ensureInitialSeed().catch((err) => {
    console.warn('Initial database seed deferred:', err);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Quisqueya Domino server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Keep reference to users table used by Drizzle types
void users;
