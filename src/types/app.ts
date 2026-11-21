export type Locale = 'es' | 'en' | 'fr';

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'player' | string;
  avatarUrl: string | null;
  locale: Locale;
  coinBalance: number;
  winsIndividual: number;
  winsTeam: number;
  winsTournament: number;
  losses: number;
  gamesPlayed: number;
  capicuas: number;
  zapatosDealt: number;
  eloRating: number;
  totalPointsScored: number;
}

export interface TournamentItem {
  id: number;
  title: string;
  description: string;
  mode: '2v2' | '1v1';
  targetScore: number;
  entryFeeCoins: number;
  prizePoolCoins: number;
  maxPlayers: number;
  status: 'open' | 'active' | 'completed';
  weekLabel: string;
  startsAt: string;
  winnerName: string | null;
  registeredCount: number;
  isRegistered: boolean;
  participants: Array<{
    id: number;
    userId: number;
    displayName: string;
    eloRating: number;
    teamName: string | null;
    seed: number;
    placement: number | null;
  }>;
}

export interface CoinPackageItem {
  id: number;
  code: string;
  name: string;
  coinsAmount: number;
  bonusCoins: number;
  priceCents: number;
  currency: string;
  active: boolean;
}

export interface EncryptedTransactionItem {
  id: number;
  txReference: string;
  type: string;
  coinsDelta: number;
  balanceAfter: number;
  fiatAmountCents: number;
  currency: string;
  gateway: string;
  status: string;
  description: string;
  integrityHash: string;
  integrityVerified: boolean;
  encryptionAlg: string;
  maskedMeta: {
    gatewayRef: string | null;
    cardLast4: string | null;
    methodLabel: string | null;
  } | null;
  createdAt: string;
  userEmail?: string;
  userName?: string;
}

export interface MatchHistoryItem {
  id: number;
  roomCode: string;
  mode: string;
  wagerCoins: number;
  targetScore: number;
  teamAScore: number;
  teamBScore: number;
  winnerSide: string;
  winnerSummary: string;
  roundsCount: number;
  capicuasCount: number;
  durationSeconds: number;
  playedAt: string;
  myTeamSide: string;
  isWinner: boolean;
  pointsContributed: number;
  capicuasScored: number;
  coinsDelta: number;
}

export interface LeaderboardEntry {
  id: number;
  displayName: string;
  eloRating: number;
  winsIndividual: number;
  winsTeam: number;
  winsTournament: number;
  losses: number;
  gamesPlayed: number;
  capicuas: number;
  zapatosDealt: number;
}

export interface NotificationItem {
  id?: number;
  title: string;
  body: string;
  category: string;
  read?: boolean;
  createdAt?: string;
  timestamp?: number;
}

export interface PublicRoomSummary {
  roomCode: string;
  mode: '2v2' | '1v1' | 'tournament' | 'ffa';
  targetScore: number;
  wagerCoins: number;
  status: string;
  playersCount: number;
  maxSeats: number;
  hostName: string;
}

export interface ChatMessage {
  id: string;
  uid: string;
  senderName: string;
  text: string;
  timestamp: number;
}
