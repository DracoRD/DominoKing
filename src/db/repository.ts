import crypto from 'crypto';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  coinPackages,
  matches,
  matchParticipants,
  notifications,
  tournamentRegistrations,
  tournaments,
  transactions,
  users,
} from './schema.ts';
import {
  computeTransactionIntegrityHash,
  decryptTransactionPayload,
  encryptTransactionPayload,
  hashPassword,
  verifyPassword,
} from '../lib/crypto.ts';

export type DbUser = typeof users.$inferSelect;

let seededPromise: Promise<void> | null = null;

export async function ensureInitialSeed(): Promise<void> {
  if (!seededPromise) {
    seededPromise = runInitialSeed().catch((err) => {
      seededPromise = null;
      console.error('Initial seed warning:', err);
    });
  }
  return seededPromise;
}

async function ensureDatabaseTables(): Promise<void> {
  try {
    await db.execute(sql`SELECT 1 FROM users LIMIT 1;`);
    return;
  } catch {
    // Table does not exist yet on a fresh database (e.g., Render Postgres); create schema below.
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      uid TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'player',
      avatar_url TEXT,
      locale TEXT NOT NULL DEFAULT 'es',
      coin_balance BIGINT NOT NULL DEFAULT 1000,
      wins_individual INTEGER NOT NULL DEFAULT 0,
      wins_team INTEGER NOT NULL DEFAULT 0,
      wins_tournament INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      capicuas INTEGER NOT NULL DEFAULT 0,
      zapatos_dealt INTEGER NOT NULL DEFAULT 0,
      elo_rating INTEGER NOT NULL DEFAULT 1200,
      total_points_scored INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tournaments (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT '2v2',
      target_score INTEGER NOT NULL DEFAULT 200,
      entry_fee_coins BIGINT NOT NULL DEFAULT 100,
      prize_pool_coins BIGINT NOT NULL DEFAULT 1000,
      max_players INTEGER NOT NULL DEFAULT 16,
      status TEXT NOT NULL DEFAULT 'open',
      week_label TEXT NOT NULL,
      starts_at TIMESTAMP NOT NULL,
      created_by_uid TEXT NOT NULL,
      winner_name TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tournament_registrations (
      id SERIAL PRIMARY KEY,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      team_name TEXT,
      seed INTEGER NOT NULL DEFAULT 1,
      eliminated BOOLEAN NOT NULL DEFAULT FALSE,
      placement INTEGER,
      registered_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      room_code TEXT NOT NULL,
      mode TEXT NOT NULL,
      tournament_id INTEGER REFERENCES tournaments(id),
      wager_coins BIGINT NOT NULL DEFAULT 0,
      target_score INTEGER NOT NULL DEFAULT 200,
      team_a_score INTEGER NOT NULL DEFAULT 0,
      team_b_score INTEGER NOT NULL DEFAULT 0,
      winner_side TEXT NOT NULL,
      winner_summary TEXT NOT NULL,
      rounds_count INTEGER NOT NULL DEFAULT 1,
      capicuas_count INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      played_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS match_participants (
      id SERIAL PRIMARY KEY,
      match_id INTEGER NOT NULL REFERENCES matches(id),
      user_id INTEGER REFERENCES users(id),
      seat_index INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      team_side TEXT NOT NULL,
      is_winner BOOLEAN NOT NULL DEFAULT FALSE,
      points_contributed INTEGER NOT NULL DEFAULT 0,
      capicuas_scored INTEGER NOT NULL DEFAULT 0,
      coins_delta BIGINT NOT NULL DEFAULT 0
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      tx_reference TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      coins_delta BIGINT NOT NULL,
      balance_after BIGINT NOT NULL,
      fiat_amount_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      gateway TEXT NOT NULL DEFAULT 'system',
      status TEXT NOT NULL DEFAULT 'completed',
      encrypted_payload TEXT NOT NULL,
      integrity_hash TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS coin_packages (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      coins_amount BIGINT NOT NULL,
      bonus_coins BIGINT NOT NULL DEFAULT 0,
      price_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      active BOOLEAN NOT NULL DEFAULT TRUE
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'community',
      read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

async function runInitialSeed(): Promise<void> {
  await ensureDatabaseTables();
  const adminEmail = 'Darlin@sistem.com';
  const existingAdmin = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${adminEmail})`)
    .limit(1);

  let adminUser = existingAdmin[0];
  if (!adminUser) {
    const inserted = await db
      .insert(users)
      .values({
        uid: 'admin-darlin-sistem',
        email: adminEmail,
        displayName: 'Darlin',
        passwordHash: hashPassword('123456'),
        role: 'admin',
        locale: 'es',
        coinBalance: 50000,
        eloRating: 1650,
      })
      .onConflictDoNothing()
      .returning();
    adminUser = inserted[0];
  } else if (adminUser.role !== 'admin') {
    const updated = await db
      .update(users)
      .set({ role: 'admin', updatedAt: new Date() })
      .where(eq(users.id, adminUser.id))
      .returning();
    adminUser = updated[0];
  }

  const existingPkgs = await db.select().from(coinPackages).limit(1);
  if (existingPkgs.length === 0) {
    await db
      .insert(coinPackages)
      .values([
        {
          code: 'pack_inicio',
          name: 'Bolsillo del Malecón',
          coinsAmount: 1000,
          bonusCoins: 100,
          priceCents: 199,
          currency: 'USD',
          active: true,
        },
        {
          code: 'pack_club',
          name: 'Mesa de Colmadón',
          coinsAmount: 3500,
          bonusCoins: 600,
          priceCents: 499,
          currency: 'USD',
          active: true,
        },
        {
          code: 'pack_capicua',
          name: 'Cofre Capicúa',
          coinsAmount: 10000,
          bonusCoins: 2500,
          priceCents: 1299,
          currency: 'USD',
          active: true,
        },
        {
          code: 'pack_campeon',
          name: 'Corona Quisqueya',
          coinsAmount: 25000,
          bonusCoins: 8000,
          priceCents: 2499,
          currency: 'USD',
          active: true,
        },
      ])
      .onConflictDoNothing();
  }

  const existingTournaments = await db.select().from(tournaments).limit(1);
  if (existingTournaments.length === 0) {
    const now = Date.now();
    await db.insert(tournaments).values([
      {
        title: 'Copa Quisqueya Semanal',
        description:
          'Torneo oficial 2v2 a 200 puntos con reglas clásicas dominicanas, doble seis obligatorio y premio en monedas.',
        mode: '2v2',
        targetScore: 200,
        entryFeeCoins: 250,
        prizePoolCoins: 5000,
        maxPlayers: 16,
        status: 'open',
        weekLabel: 'Semana 47 · 2026',
        startsAt: new Date(now + 1000 * 60 * 60 * 48),
        createdByUid: adminUser?.uid || 'admin-darlin-sistem',
      },
      {
        title: 'Reto Mano a Mano 1v1',
        description:
          'Eliminación directa individual a 100 puntos. Demuestra cálculo y tranca el juego en la mesa central.',
        mode: '1v1',
        targetScore: 100,
        entryFeeCoins: 150,
        prizePoolCoins: 2400,
        maxPlayers: 16,
        status: 'open',
        weekLabel: 'Semana 47 · 2026',
        startsAt: new Date(now + 1000 * 60 * 60 * 72),
        createdByUid: adminUser?.uid || 'admin-darlin-sistem',
      },
      {
        title: 'Clásico del Malecón VIP',
        description:
          'Mesa de alto nivel en pareja a 200 puntos. Chat de voz y video habilitado para finalistas.',
        mode: '2v2',
        targetScore: 200,
        entryFeeCoins: 500,
        prizePoolCoins: 12000,
        maxPlayers: 16,
        status: 'active',
        weekLabel: 'Semana 46 · 2026',
        startsAt: new Date(now - 1000 * 60 * 60 * 4),
        createdByUid: adminUser?.uid || 'admin-darlin-sistem',
      },
    ]);
  }

  const existingNotes = await db.select().from(notifications).limit(1);
  if (existingNotes.length === 0) {
    await db.insert(notifications).values({
      userId: null,
      title: 'Torneo Semanal Abierto',
      body: 'Inscripciones abiertas para la Copa Quisqueya Semanal (5,000 monedas en premios).',
      category: 'tournament',
      read: false,
    });
  }
}

export async function getOrCreateFirebaseUser(
  uid: string,
  email: string,
  displayName?: string,
  avatarUrl?: string
): Promise<DbUser> {
  try {
    await ensureInitialSeed();
    const isDesignatedAdmin = email.toLowerCase() === 'darlin@sistem.com';
    const cleanName = displayName || email.split('@')[0] || 'Jugador';
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: cleanName,
        avatarUrl: avatarUrl || null,
        role: isDesignatedAdmin ? 'admin' : 'player',
        coinBalance: 1000,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: cleanName,
          avatarUrl: avatarUrl || null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed (getOrCreateFirebaseUser):', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function getUserByUid(uid: string): Promise<DbUser | null> {
  try {
    await ensureInitialSeed();
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed (getUserByUid):', error);
    throw new Error('Failed to fetch user profile.', { cause: error });
  }
}

export async function registerLocalUser(
  email: string,
  password: string,
  displayName: string
): Promise<DbUser> {
  try {
    await ensureInitialSeed();
    const cleanEmail = email.trim();
    const existing = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${cleanEmail})`)
      .limit(1);
    if (existing.length > 0) {
      throw new Error('EMAIL_EXISTS');
    }

    const uid = `local_${crypto.randomUUID()}`;
    const isDesignatedAdmin = cleanEmail.toLowerCase() === 'darlin@sistem.com';
    const inserted = await db
      .insert(users)
      .values({
        uid,
        email: cleanEmail,
        displayName: displayName.trim() || cleanEmail.split('@')[0],
        passwordHash: hashPassword(password),
        role: isDesignatedAdmin ? 'admin' : 'player',
        coinBalance: 1000,
      })
      .returning();

    await createEncryptedTransaction({
      userId: inserted[0].id,
      type: 'admin_grant',
      coinsDelta: 1000,
      fiatAmountCents: 0,
      gateway: 'system',
      description: 'Bono de bienvenida al club Quisqueya Dominó 3D',
      sensitiveMeta: { reason: 'welcome_bonus', email: cleanEmail },
    });

    return inserted[0];
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'EMAIL_EXISTS') {
      throw error;
    }
    console.error('Database query failed (registerLocalUser):', error);
    throw new Error('Failed to register user account.', { cause: error });
  }
}

export async function authenticateLocalUser(
  email: string,
  password: string
): Promise<DbUser | null> {
  try {
    await ensureInitialSeed();
    const cleanEmail = email.trim();
    const rows = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${cleanEmail})`)
      .limit(1);
    const user = rows[0];
    if (!user || !user.passwordHash) return null;
    if (!verifyPassword(password, user.passwordHash)) return null;
    return user;
  } catch (error) {
    console.error('Database query failed (authenticateLocalUser):', error);
    throw new Error('Authentication query failed.', { cause: error });
  }
}

export async function updateUserLocale(userId: number, locale: string): Promise<DbUser> {
  try {
    const validLocale = ['es', 'en', 'fr'].includes(locale) ? locale : 'es';
    const updated = await db
      .update(users)
      .set({ locale: validLocale, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated[0];
  } catch (error) {
    console.error('Database query failed (updateUserLocale):', error);
    throw new Error('Failed to update user locale.', { cause: error });
  }
}

export async function createEncryptedTransaction(params: {
  userId: number;
  type: string;
  coinsDelta: number;
  fiatAmountCents: number;
  currency?: string;
  gateway: string;
  description: string;
  sensitiveMeta: Record<string, unknown>;
  skipBalanceUpdate?: boolean;
}) {
  try {
    return await db.transaction(async (tx) => {
      const userRows = await tx
        .select()
        .from(users)
        .where(eq(users.id, params.userId))
        .limit(1);
      const user = userRows[0];
      if (!user) throw new Error('USER_NOT_FOUND');

      if (!Number.isFinite(params.coinsDelta) || !Number.isSafeInteger(Math.trunc(params.coinsDelta))) {
        throw new Error('AMOUNT_OUT_OF_RANGE');
      }

      const newBalance = params.skipBalanceUpdate
        ? user.coinBalance
        : user.coinBalance + Math.trunc(params.coinsDelta);
      if (newBalance < 0) {
        throw new Error('INSUFFICIENT_COINS');
      }
      if (!Number.isSafeInteger(newBalance)) {
        throw new Error('AMOUNT_OUT_OF_RANGE');
      }

      if (!params.skipBalanceUpdate) {
        await tx
          .update(users)
          .set({ coinBalance: newBalance, updatedAt: new Date() })
          .where(eq(users.id, user.id));
      }

      const prevTx = await tx
        .select({ integrityHash: transactions.integrityHash })
        .from(transactions)
        .orderBy(desc(transactions.id))
        .limit(1);
      const previousHash = prevTx[0]?.integrityHash || 'GENESIS_QUISQUEYA_LEDGER';

      const txReference = `QD-${Date.now().toString(36).toUpperCase()}-${crypto
        .randomBytes(3)
        .toString('hex')
        .toUpperCase()}`;

      const encryptedPayload = encryptTransactionPayload({
        ...params.sensitiveMeta,
        userId: user.id,
        uid: user.uid,
        timestamp: new Date().toISOString(),
      });

      const integrityHash = computeTransactionIntegrityHash({
        txReference,
        userId: user.id,
        type: params.type,
        coinsDelta: params.coinsDelta,
        balanceAfter: newBalance,
        fiatAmountCents: params.fiatAmountCents,
        gateway: params.gateway,
        encryptedPayload,
        previousHash,
      });

      const inserted = await tx
        .insert(transactions)
        .values({
          txReference,
          userId: user.id,
          type: params.type,
          coinsDelta: params.coinsDelta,
          balanceAfter: newBalance,
          fiatAmountCents: params.fiatAmountCents,
          currency: params.currency || 'USD',
          gateway: params.gateway,
          status: 'completed',
          encryptedPayload,
          integrityHash,
          previousHash,
          description: params.description,
        })
        .returning();

      return { transaction: inserted[0], balanceAfter: newBalance };
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message === 'INSUFFICIENT_COINS' ||
        error.message === 'USER_NOT_FOUND' ||
        error.message === 'AMOUNT_OUT_OF_RANGE')
    ) {
      throw error;
    }
    console.error('Database query failed (createEncryptedTransaction):', error);
    throw new Error('Failed to record encrypted transaction.', { cause: error });
  }
}

export async function getCoinPackages() {
  try {
    await ensureInitialSeed();
    return await db
      .select()
      .from(coinPackages)
      .where(eq(coinPackages.active, true))
      .orderBy(coinPackages.priceCents);
  } catch (error) {
    console.error('Database query failed (getCoinPackages):', error);
    throw new Error('Failed to load coin packages.', { cause: error });
  }
}

export async function getCoinPackageById(id: number) {
  try {
    const rows = await db.select().from(coinPackages).where(eq(coinPackages.id, id)).limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed (getCoinPackageById):', error);
    throw new Error('Failed to load coin package.', { cause: error });
  }
}

export async function getUserTransactions(userId: number) {
  try {
    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(100);

    return rows.map((row) => {
      const decrypted = decryptTransactionPayload(row.encryptedPayload);
      const recomputedHash = computeTransactionIntegrityHash({
        txReference: row.txReference,
        userId: row.userId,
        type: row.type,
        coinsDelta: row.coinsDelta,
        balanceAfter: row.balanceAfter,
        fiatAmountCents: row.fiatAmountCents,
        gateway: row.gateway,
        encryptedPayload: row.encryptedPayload,
        previousHash: row.previousHash,
      });
      return {
        id: row.id,
        txReference: row.txReference,
        type: row.type,
        coinsDelta: row.coinsDelta,
        balanceAfter: row.balanceAfter,
        fiatAmountCents: row.fiatAmountCents,
        currency: row.currency,
        gateway: row.gateway,
        status: row.status,
        description: row.description,
        integrityHash: row.integrityHash,
        integrityVerified: recomputedHash === row.integrityHash,
        encryptionAlg: 'AES-256-GCM',
        maskedMeta: decrypted
          ? {
              gatewayRef: decrypted.gatewayRef || null,
              cardLast4: decrypted.cardLast4 || null,
              methodLabel: decrypted.methodLabel || null,
            }
          : null,
        createdAt: row.createdAt,
      };
    });
  } catch (error) {
    console.error('Database query failed (getUserTransactions):', error);
    throw new Error('Failed to load transaction history.', { cause: error });
  }
}

export async function getAllTransactionsAdmin() {
  try {
    const rows = await db
      .select({
        tx: transactions,
        userEmail: users.email,
        userName: users.displayName,
      })
      .from(transactions)
      .innerJoin(users, eq(transactions.userId, users.id))
      .orderBy(desc(transactions.createdAt))
      .limit(150);

    return rows.map(({ tx, userEmail, userName }) => {
      const recomputedHash = computeTransactionIntegrityHash({
        txReference: tx.txReference,
        userId: tx.userId,
        type: tx.type,
        coinsDelta: tx.coinsDelta,
        balanceAfter: tx.balanceAfter,
        fiatAmountCents: tx.fiatAmountCents,
        gateway: tx.gateway,
        encryptedPayload: tx.encryptedPayload,
        previousHash: tx.previousHash,
      });
      return {
        id: tx.id,
        txReference: tx.txReference,
        userEmail,
        userName,
        type: tx.type,
        coinsDelta: tx.coinsDelta,
        balanceAfter: tx.balanceAfter,
        fiatAmountCents: tx.fiatAmountCents,
        currency: tx.currency,
        gateway: tx.gateway,
        status: tx.status,
        description: tx.description,
        integrityHash: tx.integrityHash,
        integrityVerified: recomputedHash === tx.integrityHash,
        createdAt: tx.createdAt,
      };
    });
  } catch (error) {
    console.error('Database query failed (getAllTransactionsAdmin):', error);
    throw new Error('Failed to load admin transaction ledger.', { cause: error });
  }
}

export async function getTournamentsWithRegistrations(currentUserId?: number) {
  try {
    await ensureInitialSeed();
    const allTournaments = await db
      .select()
      .from(tournaments)
      .orderBy(desc(tournaments.startsAt));

    const regs = await db
      .select({
        reg: tournamentRegistrations,
        displayName: users.displayName,
        eloRating: users.eloRating,
      })
      .from(tournamentRegistrations)
      .innerJoin(users, eq(tournamentRegistrations.userId, users.id));

    return allTournaments.map((t) => {
      const tRegs = regs.filter((r) => r.reg.tournamentId === t.id);
      return {
        ...t,
        registeredCount: tRegs.length,
        isRegistered: currentUserId
          ? tRegs.some((r) => r.reg.userId === currentUserId)
          : false,
        participants: tRegs.map((r) => ({
          id: r.reg.id,
          userId: r.reg.userId,
          displayName: r.displayName,
          eloRating: r.eloRating,
          teamName: r.reg.teamName,
          seed: r.reg.seed,
          placement: r.reg.placement,
        })),
      };
    });
  } catch (error) {
    console.error('Database query failed (getTournamentsWithRegistrations):', error);
    throw new Error('Failed to fetch tournaments.', { cause: error });
  }
}

export async function joinTournament(
  tournamentId: number,
  userId: number,
  teamName?: string
) {
  try {
    const tRows = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);
    const tournament = tRows[0];
    if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND');
    if (tournament.status !== 'open') throw new Error('TOURNAMENT_CLOSED');

    const existing = await db
      .select()
      .from(tournamentRegistrations)
      .where(
        and(
          eq(tournamentRegistrations.tournamentId, tournamentId),
          eq(tournamentRegistrations.userId, userId)
        )
      )
      .limit(1);
    if (existing.length > 0) throw new Error('ALREADY_REGISTERED');

    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tournamentRegistrations)
      .where(eq(tournamentRegistrations.tournamentId, tournamentId));
    const currentCount = countRows[0]?.count || 0;
    if (currentCount >= tournament.maxPlayers) throw new Error('TOURNAMENT_FULL');

    if (tournament.entryFeeCoins > 0) {
      await createEncryptedTransaction({
        userId,
        type: 'tournament_entry',
        coinsDelta: -tournament.entryFeeCoins,
        fiatAmountCents: 0,
        gateway: 'system',
        description: `Inscripción torneo: ${tournament.title}`,
        sensitiveMeta: { tournamentId, tournamentTitle: tournament.title },
      });
    }

    const inserted = await db
      .insert(tournamentRegistrations)
      .values({
        tournamentId,
        userId,
        teamName: teamName || null,
        seed: currentCount + 1,
      })
      .returning();

    await db.insert(notifications).values({
      userId,
      title: 'Inscripción Confirmada',
      body: `Te inscribiste en ${tournament.title}. ¡Prepárate para la salida!`,
      category: 'tournament',
    });

    return inserted[0];
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      [
        'TOURNAMENT_NOT_FOUND',
        'TOURNAMENT_CLOSED',
        'ALREADY_REGISTERED',
        'TOURNAMENT_FULL',
        'INSUFFICIENT_COINS',
      ].includes(error.message)
    ) {
      throw error;
    }
    console.error('Database query failed (joinTournament):', error);
    throw new Error('Failed to join tournament.', { cause: error });
  }
}

export async function createTournamentAdmin(params: {
  title: string;
  description: string;
  mode: string;
  targetScore: number;
  entryFeeCoins: number;
  prizePoolCoins: number;
  maxPlayers: number;
  weekLabel: string;
  startsAt: Date;
  createdByUid: string;
}) {
  try {
    const inserted = await db.insert(tournaments).values(params).returning();
    await db.insert(notifications).values({
      userId: null,
      title: `Nuevo Torneo: ${params.title}`,
      body: `Entrada ${params.entryFeeCoins} monedas · Bolsa ${params.prizePoolCoins} monedas (${params.mode}).`,
      category: 'tournament',
    });
    return inserted[0];
  } catch (error) {
    console.error('Database query failed (createTournamentAdmin):', error);
    throw new Error('Failed to create tournament.', { cause: error });
  }
}

export async function updateTournamentAdmin(
  tournamentId: number,
  updates: {
    status?: string;
    entryFeeCoins?: number;
    prizePoolCoins?: number;
    winnerUserId?: number;
  }
) {
  try {
    const rows = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);
    const existing = rows[0];
    if (!existing) throw new Error('TOURNAMENT_NOT_FOUND');

    let winnerName = existing.winnerName;
    if (updates.status === 'completed' && updates.winnerUserId) {
      const wRows = await db
        .select()
        .from(users)
        .where(eq(users.id, updates.winnerUserId))
        .limit(1);
      const winner = wRows[0];
      if (winner) {
        winnerName = winner.displayName;
        await db
          .update(users)
          .set({
            winsTournament: winner.winsTournament + 1,
            eloRating: winner.eloRating + 45,
            updatedAt: new Date(),
          })
          .where(eq(users.id, winner.id));

        await createEncryptedTransaction({
          userId: winner.id,
          type: 'tournament_prize',
          coinsDelta: updates.prizePoolCoins ?? existing.prizePoolCoins,
          fiatAmountCents: 0,
          gateway: 'system',
          description: `Premio Campeón Torneo: ${existing.title}`,
          sensitiveMeta: { tournamentId, placement: 1 },
        });

        await db.insert(notifications).values({
          userId: null,
          title: `Campeón: ${winner.displayName}`,
          body: `${winner.displayName} ganó ${existing.title} y recibió ${updates.prizePoolCoins ?? existing.prizePoolCoins} monedas.`,
          category: 'tournament',
        });
      }
    }

    const updated = await db
      .update(tournaments)
      .set({
        status: updates.status ?? existing.status,
        entryFeeCoins: updates.entryFeeCoins ?? existing.entryFeeCoins,
        prizePoolCoins: updates.prizePoolCoins ?? existing.prizePoolCoins,
        winnerName,
      })
      .where(eq(tournaments.id, tournamentId))
      .returning();

    return updated[0];
  } catch (error) {
    console.error('Database query failed (updateTournamentAdmin):', error);
    throw new Error('Failed to update tournament.', { cause: error });
  }
}

export async function recordCompletedMatch(params: {
  roomCode: string;
  mode: '2v2' | '1v1' | 'tournament' | 'ffa';
  tournamentId?: number | null;
  wagerCoins: number;
  targetScore: number;
  teamAScore: number;
  teamBScore: number;
  winnerSide: 'A' | 'B';
  winnerSeatIndex?: number | null;
  winnerSummary: string;
  roundsCount: number;
  capicuasCount: number;
  durationSeconds: number;
  participants: Array<{
    userId: number | null;
    seatIndex: number;
    playerName: string;
    teamSide: 'A' | 'B';
    pointsContributed: number;
    capicuasScored: number;
  }>;
}) {
  try {
    const isZapato =
      params.mode !== 'ffa' &&
      ((params.winnerSide === 'A' && params.teamBScore === 0) ||
        (params.winnerSide === 'B' && params.teamAScore === 0));

    const insertedMatch = await db
      .insert(matches)
      .values({
        roomCode: params.roomCode,
        mode: params.mode,
        tournamentId: params.tournamentId || null,
        wagerCoins: params.wagerCoins,
        targetScore: params.targetScore,
        teamAScore: params.teamAScore,
        teamBScore: params.teamBScore,
        winnerSide: params.winnerSide,
        winnerSummary: params.winnerSummary,
        roundsCount: params.roundsCount,
        capicuasCount: params.capicuasCount,
        durationSeconds: params.durationSeconds,
      })
      .returning();

    const match = insertedMatch[0];

    for (const p of params.participants) {
      const isWinner =
        params.mode === 'ffa' && params.winnerSeatIndex !== undefined && params.winnerSeatIndex !== null
          ? p.seatIndex === params.winnerSeatIndex
          : p.teamSide === params.winnerSide;
      const coinsDelta =
        params.wagerCoins > 0 ? (isWinner ? params.wagerCoins : -params.wagerCoins) : 0;

      await db.insert(matchParticipants).values({
        matchId: match.id,
        userId: p.userId,
        seatIndex: p.seatIndex,
        playerName: p.playerName,
        teamSide: p.teamSide,
        isWinner,
        pointsContributed: p.pointsContributed,
        capicuasScored: p.capicuasScored,
        coinsDelta,
      });

      if (p.userId) {
        const uRows = await db.select().from(users).where(eq(users.id, p.userId)).limit(1);
        const u = uRows[0];
        if (u) {
          const eloChange = isWinner ? 18 : -12;
          await db
            .update(users)
            .set({
              gamesPlayed: u.gamesPlayed + 1,
              winsIndividual:
                u.winsIndividual +
                (isWinner && (params.mode === '1v1' || params.mode === 'ffa') ? 1 : 0),
              winsTeam: u.winsTeam + (isWinner && params.mode === '2v2' ? 1 : 0),
              winsTournament:
                u.winsTournament + (isWinner && params.mode === 'tournament' ? 1 : 0),
              losses: u.losses + (isWinner ? 0 : 1),
              capicuas: u.capicuas + p.capicuasScored,
              zapatosDealt: u.zapatosDealt + (isWinner && isZapato ? 1 : 0),
              totalPointsScored: u.totalPointsScored + p.pointsContributed,
              eloRating: Math.max(800, u.eloRating + eloChange),
              updatedAt: new Date(),
            })
            .where(eq(users.id, u.id));

          if (coinsDelta !== 0) {
            try {
              await createEncryptedTransaction({
                userId: u.id,
                type: coinsDelta > 0 ? 'match_payout' : 'match_wager',
                coinsDelta,
                fiatAmountCents: 0,
                gateway: 'system',
                description:
                  coinsDelta > 0
                    ? `Victoria en mesa ${params.roomCode} (${params.mode})`
                    : `Apuesta en mesa ${params.roomCode} (${params.mode})`,
                sensitiveMeta: { matchId: match.id, roomCode: params.roomCode },
              });
            } catch (coinErr) {
              console.warn('Coin settlement warning:', coinErr);
            }
          }
        }
      }
    }

    return match;
  } catch (error) {
    console.error('Database query failed (recordCompletedMatch):', error);
    throw new Error('Failed to record completed match.', { cause: error });
  }
}

export async function getUserMatchHistory(userId: number) {
  try {
    const rows = await db
      .select({
        match: matches,
        participant: matchParticipants,
      })
      .from(matchParticipants)
      .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
      .where(eq(matchParticipants.userId, userId))
      .orderBy(desc(matches.playedAt))
      .limit(40);

    return rows.map(({ match, participant }) => ({
      ...match,
      myTeamSide: participant.teamSide,
      isWinner: participant.isWinner,
      pointsContributed: participant.pointsContributed,
      capicuasScored: participant.capicuasScored,
      coinsDelta: participant.coinsDelta,
    }));
  } catch (error) {
    console.error('Database query failed (getUserMatchHistory):', error);
    throw new Error('Failed to load match history.', { cause: error });
  }
}

export async function getLeaderboard() {
  try {
    await ensureInitialSeed();
    return await db
      .select({
        id: users.id,
        displayName: users.displayName,
        eloRating: users.eloRating,
        winsIndividual: users.winsIndividual,
        winsTeam: users.winsTeam,
        winsTournament: users.winsTournament,
        losses: users.losses,
        gamesPlayed: users.gamesPlayed,
        capicuas: users.capicuas,
        zapatosDealt: users.zapatosDealt,
      })
      .from(users)
      .orderBy(desc(users.eloRating))
      .limit(25);
  } catch (error) {
    console.error('Database query failed (getLeaderboard):', error);
    throw new Error('Failed to load leaderboard.', { cause: error });
  }
}

export async function getNotifications(userId?: number) {
  try {
    await ensureInitialSeed();
    return await db
      .select()
      .from(notifications)
      .where(
        userId
          ? or(eq(notifications.userId, userId), isNull(notifications.userId))
          : isNull(notifications.userId)
      )
      .orderBy(desc(notifications.createdAt))
      .limit(25);
  } catch (error) {
    console.error('Database query failed (getNotifications):', error);
    throw new Error('Failed to load notifications.', { cause: error });
  }
}

export async function markNotificationsRead(userId: number) {
  try {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, userId));
  } catch (error) {
    console.error('Database query failed (markNotificationsRead):', error);
    throw new Error('Failed to update notifications.', { cause: error });
  }
}

export async function getAdminOverview() {
  try {
    await ensureInitialSeed();
    const userCountRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const matchCountRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(matches);
    const txSummaryRows = await db
      .select({
        totalTx: sql<number>`count(*)::int`,
        totalFiatCents: sql<number>`coalesce(sum(${transactions.fiatAmountCents}), 0)::int`,
      })
      .from(transactions);

    const recentUsers = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        coinBalance: users.coinBalance,
        eloRating: users.eloRating,
        gamesPlayed: users.gamesPlayed,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(30);

    return {
      totalUsers: userCountRows[0]?.count || 0,
      totalMatches: matchCountRows[0]?.count || 0,
      totalTransactions: txSummaryRows[0]?.totalTx || 0,
      totalFiatRevenueCents: txSummaryRows[0]?.totalFiatCents || 0,
      recentUsers,
    };
  } catch (error) {
    console.error('Database query failed (getAdminOverview):', error);
    throw new Error('Failed to load admin overview.', { cause: error });
  }
}
