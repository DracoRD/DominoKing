import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('player'), // 'admin' | 'player'
  avatarUrl: text('avatar_url'),
  locale: text('locale').notNull().default('es'), // 'es' | 'en' | 'fr'
  coinBalance: bigint('coin_balance', { mode: 'number' }).notNull().default(1000),
  winsIndividual: integer('wins_individual').notNull().default(0),
  winsTeam: integer('wins_team').notNull().default(0),
  winsTournament: integer('wins_tournament').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  gamesPlayed: integer('games_played').notNull().default(0),
  capicuas: integer('capicuas').notNull().default(0),
  zapatosDealt: integer('zapatos_dealt').notNull().default(0),
  eloRating: integer('elo_rating').notNull().default(1200),
  totalPointsScored: integer('total_points_scored').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const tournaments = pgTable('tournaments', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  mode: text('mode').notNull().default('2v2'), // '2v2' | '1v1'
  targetScore: integer('target_score').notNull().default(200),
  entryFeeCoins: bigint('entry_fee_coins', { mode: 'number' }).notNull().default(100),
  prizePoolCoins: bigint('prize_pool_coins', { mode: 'number' }).notNull().default(1000),
  maxPlayers: integer('max_players').notNull().default(16),
  status: text('status').notNull().default('open'), // 'open' | 'active' | 'completed'
  weekLabel: text('week_label').notNull(),
  startsAt: timestamp('starts_at').notNull(),
  createdByUid: text('created_by_uid').notNull(),
  winnerName: text('winner_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tournamentRegistrations = pgTable('tournament_registrations', {
  id: serial('id').primaryKey(),
  tournamentId: integer('tournament_id')
    .references(() => tournaments.id)
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  teamName: text('team_name'),
  seed: integer('seed').notNull().default(1),
  eliminated: boolean('eliminated').notNull().default(false),
  placement: integer('placement'),
  registeredAt: timestamp('registered_at').defaultNow().notNull(),
});

export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  roomCode: text('room_code').notNull(),
  mode: text('mode').notNull(), // '2v2' | '1v1' | 'tournament'
  tournamentId: integer('tournament_id').references(() => tournaments.id),
  wagerCoins: bigint('wager_coins', { mode: 'number' }).notNull().default(0),
  targetScore: integer('target_score').notNull().default(200),
  teamAScore: integer('team_a_score').notNull().default(0),
  teamBScore: integer('team_b_score').notNull().default(0),
  winnerSide: text('winner_side').notNull(), // 'A' | 'B'
  winnerSummary: text('winner_summary').notNull(),
  roundsCount: integer('rounds_count').notNull().default(1),
  capicuasCount: integer('capicuas_count').notNull().default(0),
  durationSeconds: integer('duration_seconds').notNull().default(0),
  playedAt: timestamp('played_at').defaultNow().notNull(),
});

export const matchParticipants = pgTable('match_participants', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id')
    .references(() => matches.id)
    .notNull(),
  userId: integer('user_id').references(() => users.id),
  seatIndex: integer('seat_index').notNull(),
  playerName: text('player_name').notNull(),
  teamSide: text('team_side').notNull(), // 'A' | 'B'
  isWinner: boolean('is_winner').notNull().default(false),
  pointsContributed: integer('points_contributed').notNull().default(0),
  capicuasScored: integer('capicuas_scored').notNull().default(0),
  coinsDelta: bigint('coins_delta', { mode: 'number' }).notNull().default(0),
});

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  txReference: text('tx_reference').notNull().unique(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  type: text('type').notNull(), // 'coin_purchase' | 'tournament_entry' | 'tournament_prize' | 'match_wager' | 'match_payout' | 'admin_grant'
  coinsDelta: bigint('coins_delta', { mode: 'number' }).notNull(),
  balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
  fiatAmountCents: integer('fiat_amount_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  gateway: text('gateway').notNull().default('system'), // 'stripe' | 'paypal' | 'azul_rd' | 'system'
  status: text('status').notNull().default('completed'),
  encryptedPayload: text('encrypted_payload').notNull(),
  integrityHash: text('integrity_hash').notNull(),
  previousHash: text('previous_hash').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const coinPackages = pgTable('coin_packages', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  coinsAmount: bigint('coins_amount', { mode: 'number' }).notNull(),
  bonusCoins: bigint('bonus_coins', { mode: 'number' }).notNull().default(0),
  priceCents: integer('price_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  active: boolean('active').notNull().default(true),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  title: text('title').notNull(),
  body: text('body').notNull(),
  category: text('category').notNull().default('community'), // 'tournament' | 'match' | 'wallet' | 'community'
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  registrations: many(tournamentRegistrations),
  participations: many(matchParticipants),
  transactions: many(transactions),
  notifications: many(notifications),
}));

export const tournamentsRelations = relations(tournaments, ({ many }) => ({
  registrations: many(tournamentRegistrations),
  matches: many(matches),
}));

export const tournamentRegistrationsRelations = relations(
  tournamentRegistrations,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [tournamentRegistrations.tournamentId],
      references: [tournaments.id],
    }),
    user: one(users, {
      fields: [tournamentRegistrations.userId],
      references: [users.id],
    }),
  })
);

export const matchesRelations = relations(matches, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [matches.tournamentId],
    references: [tournaments.id],
  }),
  participants: many(matchParticipants),
}));

export const matchParticipantsRelations = relations(
  matchParticipants,
  ({ one }) => ({
    match: one(matches, {
      fields: [matchParticipants.matchId],
      references: [matches.id],
    }),
    user: one(users, {
      fields: [matchParticipants.userId],
      references: [users.id],
    }),
  })
);

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
