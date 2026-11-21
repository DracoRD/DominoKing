import type { Server as HttpServer } from 'http';
import crypto from 'crypto';
import { WebSocket, WebSocketServer } from 'ws';
import {
  type AiDifficulty,
  chooseAiMove,
  createFullDeck,
  type DominoRoomState,
  type DominoTile,
  type GameMode,
  getLegalMoves,
  handPipTotal,
  layoutBoardChain,
  type RoundEvent,
  type SeatState,
  shuffleDeck,
} from '../shared/dominoEngine.ts';
import { verifySocketToken } from '../middleware/auth.ts';
import { type DbUser, recordCompletedMatch } from '../db/repository.ts';

interface RawChainItem {
  tile: DominoTile;
  leftVal: number;
  rightVal: number;
  seatIndex: number;
  order: number;
  branch: 'center' | 'left' | 'right';
}

interface InternalRoom extends DominoRoomState {
  rawChain: RawChainItem[];
  boneyard: DominoTile[];
  orderCounter: number;
  lastPlaySeatIndex: number | null;
  aiTimer?: ReturnType<typeof setTimeout>;
  roundTimer?: ReturnType<typeof setTimeout>;
  turnTimer?: ReturnType<typeof setTimeout>;
  capicuasThisMatch: number;
}

interface ConnectedClient {
  ws: WebSocket;
  clientId: string;
  uid: string;
  userId: number | null;
  displayName: string;
  roomCode: string | null;
}

const rooms = new Map<string, InternalRoom>();
const clients = new Map<string, ConnectedClient>();

const AI_NAMES = ['Wisin', 'Tata', 'Chela', 'Mateo RD', 'Yulissa', 'Chucho'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeRoomCode(requestedCode?: string): string {
  const clean = String(requestedCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
  if (clean.length >= 3 && !rooms.has(clean)) {
    return clean;
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    const bytes = crypto.randomBytes(5);
    for (let i = 0; i < 5; i++) {
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function clearRoomTimers(room: InternalRoom) {
  if (room.aiTimer) {
    clearTimeout(room.aiTimer);
    room.aiTimer = undefined;
  }
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = undefined;
  }
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = undefined;
  }
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sanitizeRoomForClient(
  room: InternalRoom,
  viewerUid: string
): DominoRoomState {
  return {
    roomCode: room.roomCode,
    hostUid: room.hostUid,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    isPublic: room.isPublic,
    aiDifficulty: room.aiDifficulty,
    turnSeconds: room.turnSeconds,
    turnStartedAt: room.turnStartedAt,
    targetScore: room.targetScore,
    wagerCoins: room.wagerCoins,
    tournamentId: room.tournamentId,
    status: room.status,
    roundNumber: room.roundNumber,
    salidorSeat: room.salidorSeat,
    currentTurnSeat: room.currentTurnSeat,
    consecutivePasses: room.consecutivePasses,
    teamAScore: room.teamAScore,
    teamBScore: room.teamBScore,
    openLeft: room.openLeft,
    openRight: room.openRight,
    board: room.board,
    boneyardCount: room.boneyard.length,
    lastEvent: room.lastEvent,
    winnerSide: room.winnerSide,
    winnerSeatIndex: room.winnerSeatIndex,
    startedAt: room.startedAt,
    seats: room.seats.map((s) => ({
      ...s,
      hand:
        s.uid === viewerUid || room.status === 'round_over' || room.status === 'finished'
          ? s.hand
          : [],
    })),
  };
}

function broadcastRoomState(room: InternalRoom) {
  for (const client of clients.values()) {
    if (client.roomCode === room.roomCode) {
      sendJson(client.ws, {
        type: 'room:state',
        room: sanitizeRoomForClient(room, client.uid),
      });
    }
  }
}

function broadcastToRoom(roomCode: string, payload: unknown, excludeClientId?: string) {
  for (const client of clients.values()) {
    if (client.roomCode === roomCode && client.clientId !== excludeClientId) {
      sendJson(client.ws, payload);
    }
  }
}

export function broadcastPushNotification(notification: {
  title: string;
  body: string;
  category: string;
}) {
  for (const client of clients.values()) {
    sendJson(client.ws, {
      type: 'push:notification',
      notification: {
        ...notification,
        timestamp: Date.now(),
      },
    });
  }
}

export function listPublicRooms() {
  const list: Array<{
    roomCode: string;
    mode: GameMode;
    targetScore: number;
    wagerCoins: number;
    status: string;
    playersCount: number;
    maxSeats: number;
    hostName: string;
  }> = [];

  for (const r of rooms.values()) {
    if (!r.isPublic) continue;
    const activeHumans = r.seats.filter((s) => !s.isAi).length;
    const maxSeats = r.maxPlayers;
    list.push({
      roomCode: r.roomCode,
      mode: r.mode,
      targetScore: r.targetScore,
      wagerCoins: r.wagerCoins,
      status: r.status,
      playersCount: r.seats.filter((s) => s.uid !== '').length,
      maxSeats,
      hostName: r.seats.find((s) => s.uid === r.hostUid)?.name || r.seats[0]?.name || `${activeHumans} jugadores`,
    });
  }
  return list;
}

function getActiveSeatIndices(mode: GameMode, maxPlayers: 2 | 3 | 4 = 4): number[] {
  if (mode === '1v1') return [0, 2];
  if (mode === 'ffa' && maxPlayers === 3) return [0, 1, 2];
  return [0, 1, 2, 3];
}

function nextActiveSeat(room: InternalRoom, currentSeat: number): number {
  const active = getActiveSeatIndices(room.mode, room.maxPlayers);
  const idx = active.indexOf(currentSeat);
  if (idx === -1) return active[0];
  return active[(idx + 1) % active.length];
}

function nextAvailableAiName(room: InternalRoom): string {
  const used = new Set(room.seats.map((s) => s.name));
  for (const n of AI_NAMES) {
    if (!used.has(n)) return n;
  }
  return `Bot ${room.seats.length + 1}`;
}

function createBotSeat(room: InternalRoom, seatIndex: number): SeatState {
  return {
    seatIndex,
    userId: null,
    uid: `ai_${room.roomCode}_${seatIndex}`,
    name: nextAvailableAiName(room),
    isAi: true,
    teamSide: seatIndex % 2 === 0 ? 'A' : 'B',
    hand: [],
    handCount: 0,
    connected: true,
    micOn: false,
    camOn: false,
    score: 0,
    pointsContributed: 0,
    capicuasScored: 0,
  };
}

function fillRemainingWithAi(room: InternalRoom) {
  const activeIndices = getActiveSeatIndices(room.mode, room.maxPlayers);
  for (const seatIndex of activeIndices) {
    const existing = room.seats.find((s) => s.seatIndex === seatIndex);
    if (!existing) {
      room.seats.push(createBotSeat(room, seatIndex));
    }
  }
  room.seats.sort((a, b) => a.seatIndex - b.seatIndex);
}

function startRound(room: InternalRoom) {
  clearRoomTimers(room);

  fillRemainingWithAi(room);
  const deck = shuffleDeck(createFullDeck());
  const activeIndices = getActiveSeatIndices(room.mode, room.maxPlayers);

  let cursor = 0;
  for (const seat of room.seats) {
    if (activeIndices.includes(seat.seatIndex)) {
      seat.hand = deck.slice(cursor, cursor + 7);
      seat.handCount = seat.hand.length;
      cursor += 7;
    } else {
      seat.hand = [];
      seat.handCount = 0;
    }
  }

  const usesBoneyard =
    room.mode === '1v1' || (room.mode === 'ffa' && room.maxPlayers === 3);
  room.boneyard = usesBoneyard ? deck.slice(cursor) : [];
  room.boneyardCount = room.boneyard.length;
  room.rawChain = [];
  room.board = [];
  room.openLeft = null;
  room.openRight = null;
  room.consecutivePasses = 0;
  room.lastPlaySeatIndex = null;
  room.orderCounter = 0;
  room.status = 'playing';

  // Determine starter: Round 1 = Doble Seis holder (or highest double)
  if (room.roundNumber === 1) {
    let starter = activeIndices[0];
    const d6Owner = room.seats.find((s) =>
      s.hand.some((t) => t.a === 6 && t.b === 6)
    );
    if (d6Owner) {
      starter = d6Owner.seatIndex;
    } else {
      let bestVal = -1;
      for (const s of room.seats) {
        for (const t of s.hand) {
          const score = (t.isDouble ? 100 : 0) + t.a + t.b;
          if (score > bestVal) {
            bestVal = score;
            starter = s.seatIndex;
          }
        }
      }
    }
    room.salidorSeat = starter;
    room.currentTurnSeat = starter;
  } else {
    room.currentTurnSeat = room.salidorSeat;
  }

  room.turnStartedAt = Date.now();
  const starterSeat = room.seats.find((s) => s.seatIndex === room.currentTurnSeat);
  room.lastEvent = {
    type: 'system',
    seatIndex: room.currentTurnSeat,
    playerName: starterSeat?.name,
    message:
      room.roundNumber === 1
        ? `Mano #1: Sale ${starterSeat?.name || 'Jugador'}`
        : `Mano #${room.roundNumber}: Sale ${starterSeat?.name || 'Jugador'}`,
    timestamp: Date.now(),
  };

  broadcastRoomState(room);
  scheduleTurnTimers(room);
}

function finalizeRound(
  room: InternalRoom,
  winnerSeatIndex: number | null,
  winnerTeamSide: 'A' | 'B' | null,
  isTranque: boolean,
  isCapicua: boolean
) {
  clearRoomTimers(room);

  let awardedPoints = 0;
  let resolvedSide: 'A' | 'B' | null = winnerTeamSide;
  let resolvedWinnerSeat: number | null = winnerSeatIndex;

  if (room.mode === 'ffa') {
    const activeSeats = room.seats.filter((s) => s.handCount > 0 || s.seatIndex === winnerSeatIndex);
    const totalTablePips = activeSeats.reduce((sum, s) => sum + handPipTotal(s.hand), 0);

    if (isTranque) {
      const sorted = [...activeSeats].sort(
        (a, b) => handPipTotal(a.hand) - handPipTotal(b.hand)
      );
      if (sorted.length >= 2 && handPipTotal(sorted[0].hand) < handPipTotal(sorted[1].hand)) {
        resolvedWinnerSeat = sorted[0].seatIndex;
        awardedPoints = totalTablePips - handPipTotal(sorted[0].hand);
      } else {
        resolvedWinnerSeat = null;
        awardedPoints = 0;
      }
    } else if (resolvedWinnerSeat !== null) {
      awardedPoints = totalTablePips + (isCapicua ? 30 : 0);
      if (isCapicua) room.capicuasThisMatch += 1;
    }

    if (resolvedWinnerSeat !== null) {
      const wSeat = room.seats.find((s) => s.seatIndex === resolvedWinnerSeat);
      if (wSeat) {
        wSeat.score += awardedPoints;
        wSeat.pointsContributed += awardedPoints;
        if (isCapicua) wSeat.capicuasScored += 1;
        resolvedSide = wSeat.teamSide;
        room.salidorSeat = resolvedWinnerSeat;
      }
    }

    const hostSeat = room.seats.find((s) => s.uid === room.hostUid) || room.seats[0];
    room.teamAScore = hostSeat ? hostSeat.score : 0;
    room.teamBScore = Math.max(
      0,
      ...room.seats.filter((s) => s.seatIndex !== hostSeat?.seatIndex).map((s) => s.score)
    );

    const topSeat = [...room.seats].sort((a, b) => b.score - a.score)[0];
    const matchEnded = Boolean(topSeat && topSeat.score >= room.targetScore);

    if (matchEnded && topSeat) {
      const isZapato = room.seats
        .filter((s) => s.seatIndex !== topSeat.seatIndex)
        .every((s) => s.score === 0);
      room.status = 'finished';
      room.winnerSeatIndex = topSeat.seatIndex;
      room.winnerSide = topSeat.teamSide;
      room.lastEvent = {
        type: 'match_end',
        winnerSide: topSeat.teamSide,
        winnerSeatIndex: topSeat.seatIndex,
        pointsAwarded: awardedPoints,
        isCapicua,
        isZapato,
        isTranque,
        message: `${isZapato ? '¡ZAPATO! ' : ''}${topSeat.name} gana la partida (${topSeat.score} pts)`,
        timestamp: Date.now(),
      };
      broadcastRoomState(room);

      const durationSeconds = room.startedAt
        ? Math.max(10, Math.round((Date.now() - room.startedAt) / 1000))
        : 60;
      recordCompletedMatch({
        roomCode: room.roomCode,
        mode: room.mode,
        tournamentId: room.tournamentId,
        wagerCoins: room.wagerCoins,
        targetScore: room.targetScore,
        teamAScore: room.teamAScore,
        teamBScore: room.teamBScore,
        winnerSide: topSeat.teamSide,
        winnerSeatIndex: topSeat.seatIndex,
        winnerSummary: `${topSeat.name} (${topSeat.score} pts)`,
        roundsCount: room.roundNumber,
        capicuasCount: room.capicuasThisMatch,
        durationSeconds,
        participants: room.seats.map((s) => ({
          userId: s.userId,
          seatIndex: s.seatIndex,
          playerName: s.name,
          teamSide: s.teamSide,
          pointsContributed: s.pointsContributed,
          capicuasScored: s.capicuasScored,
        })),
      }).catch((err) => console.error('Failed to persist match:', err));
    } else {
      room.status = 'round_over';
      const wName = room.seats.find((s) => s.seatIndex === resolvedWinnerSeat)?.name || 'Empate';
      room.lastEvent = {
        type: 'round_end',
        winnerSide: resolvedSide || undefined,
        winnerSeatIndex: resolvedWinnerSeat ?? undefined,
        pointsAwarded: awardedPoints,
        isCapicua,
        isTranque,
        message: isTranque
          ? resolvedWinnerSeat !== null
            ? `Tranque: ${wName} suma ${awardedPoints} pts`
            : 'Tranque empatado (0 pts)'
          : isCapicua
          ? `¡CAPICÚA! ${wName} suma ${awardedPoints} pts`
          : `Mano para ${wName} (+${awardedPoints} pts)`,
        timestamp: Date.now(),
      };
      broadcastRoomState(room);
      room.roundTimer = setTimeout(() => {
        room.roundNumber += 1;
        startRound(room);
      }, 3800);
    }
    return;
  }

  let pointsA = 0;
  let pointsB = 0;
  for (const s of room.seats) {
    const pips = handPipTotal(s.hand);
    if (s.teamSide === 'A') pointsA += pips;
    else pointsB += pips;
  }

  if (isTranque) {
    if (pointsA < pointsB) {
      resolvedSide = 'A';
      awardedPoints = pointsA + pointsB;
    } else if (pointsB < pointsA) {
      resolvedSide = 'B';
      awardedPoints = pointsA + pointsB;
    } else {
      resolvedSide = null;
      awardedPoints = 0;
    }
  } else if (resolvedSide) {
    awardedPoints = resolvedSide === 'A' ? pointsB : pointsA;
    if (isCapicua) {
      awardedPoints += 30;
      room.capicuasThisMatch += 1;
    }
  }

  if (resolvedSide === 'A') room.teamAScore += awardedPoints;
  if (resolvedSide === 'B') room.teamBScore += awardedPoints;

  if (winnerSeatIndex !== null) {
    const wSeat = room.seats.find((s) => s.seatIndex === winnerSeatIndex);
    if (wSeat) {
      wSeat.score += awardedPoints;
      wSeat.pointsContributed += awardedPoints;
      if (isCapicua) wSeat.capicuasScored += 1;
    }
    room.salidorSeat = winnerSeatIndex;
  } else if (resolvedSide) {
    const teamSeats = room.seats.filter((s) => s.teamSide === resolvedSide);
    const lowestTeamSeat = [...teamSeats].sort(
      (a, b) => handPipTotal(a.hand) - handPipTotal(b.hand)
    )[0];
    if (lowestTeamSeat) {
      lowestTeamSeat.score += awardedPoints;
      lowestTeamSeat.pointsContributed += awardedPoints;
      room.salidorSeat = lowestTeamSeat.seatIndex;
    }
  }

  const matchEnded =
    room.teamAScore >= room.targetScore || room.teamBScore >= room.targetScore;

  if (matchEnded) {
    room.status = 'finished';
    room.winnerSide = room.teamAScore >= room.targetScore ? 'A' : 'B';
    room.winnerSeatIndex = resolvedWinnerSeat;
    const isZapato =
      (room.winnerSide === 'A' && room.teamBScore === 0) ||
      (room.winnerSide === 'B' && room.teamAScore === 0);
    const winnerNames = room.seats
      .filter((s) => s.teamSide === room.winnerSide)
      .map((s) => s.name)
      .join(' & ');

    room.lastEvent = {
      type: 'match_end',
      winnerSide: room.winnerSide,
      pointsAwarded: awardedPoints,
      isCapicua,
      isZapato,
      isTranque,
      message: `${isZapato ? '¡ZAPATO! ' : ''}${winnerNames} ganan la partida (${room.teamAScore} - ${room.teamBScore})`,
      timestamp: Date.now(),
    };

    broadcastRoomState(room);

    const durationSeconds = room.startedAt
      ? Math.max(10, Math.round((Date.now() - room.startedAt) / 1000))
      : 60;
    recordCompletedMatch({
      roomCode: room.roomCode,
      mode: room.mode,
      tournamentId: room.tournamentId,
      wagerCoins: room.wagerCoins,
      targetScore: room.targetScore,
      teamAScore: room.teamAScore,
      teamBScore: room.teamBScore,
      winnerSide: room.winnerSide,
      winnerSummary: `${winnerNames} (${room.teamAScore} - ${room.teamBScore})`,
      roundsCount: room.roundNumber,
      capicuasCount: room.capicuasThisMatch,
      durationSeconds,
      participants: room.seats.map((s) => ({
        userId: s.userId,
        seatIndex: s.seatIndex,
        playerName: s.name,
        teamSide: s.teamSide,
        pointsContributed: s.pointsContributed,
        capicuasScored: s.capicuasScored,
      })),
    }).catch((err) => console.error('Failed to persist match:', err));
  } else {
    room.status = 'round_over';
    room.lastEvent = {
      type: 'round_end',
      winnerSide: resolvedSide || undefined,
      pointsAwarded: awardedPoints,
      isCapicua,
      isTranque,
      message: isTranque
        ? resolvedSide
          ? `Tranque: Pareja ${resolvedSide} suma ${awardedPoints} pts`
          : 'Tranque empatado (0 pts)'
        : isCapicua
        ? `¡CAPICÚA! Pareja ${resolvedSide} suma ${awardedPoints} pts`
        : `Mano para Pareja ${resolvedSide} (+${awardedPoints} pts)`,
      timestamp: Date.now(),
    };
    broadcastRoomState(room);

    room.roundTimer = setTimeout(() => {
      room.roundNumber += 1;
      startRound(room);
    }, 3800);
  }
}

function executePlayTile(
  room: InternalRoom,
  seatIndex: number,
  tileId: string,
  side: 'left' | 'right'
): boolean {
  if (room.status !== 'playing' || room.currentTurnSeat !== seatIndex) return false;
  const seat = room.seats.find((s) => s.seatIndex === seatIndex);
  if (!seat) return false;

  const tileIdx = seat.hand.findIndex((t) => t.id === tileId);
  if (tileIdx === -1) return false;
  const tile = seat.hand[tileIdx];

  const mustPlayDoubleSix =
    room.roundNumber === 1 &&
    room.rawChain.length === 0 &&
    seat.hand.some((t) => t.a === 6 && t.b === 6);

  const legalMoves = getLegalMoves(
    seat.hand,
    room.openLeft,
    room.openRight,
    mustPlayDoubleSix
  );
  const matchedMove = legalMoves.find(
    (m) => m.tile.id === tile.id && (room.rawChain.length === 0 || m.side === side)
  );
  if (!matchedMove) return false;

  let isCapicua = false;
  if (room.rawChain.length === 0) {
    room.rawChain.push({
      tile,
      leftVal: tile.a,
      rightVal: tile.b,
      seatIndex,
      order: ++room.orderCounter,
      branch: 'center',
    });
    room.openLeft = tile.a;
    room.openRight = tile.b;
  } else {
    // Check Capicua on winning tile (last tile in hand matches both open ends!)
    if (seat.hand.length === 1 && room.openLeft !== null && room.openRight !== null) {
      const fitsBoth =
        (tile.a === room.openLeft && tile.b === room.openRight) ||
        (tile.b === room.openLeft && tile.a === room.openRight) ||
        (room.openLeft === room.openRight &&
          (tile.a === room.openLeft || tile.b === room.openLeft));
      if (fitsBoth) {
        isCapicua = true;
      }
    }

    if (side === 'left' && room.openLeft !== null) {
      const outerVal = tile.a === room.openLeft ? tile.b : tile.a;
      const innerVal = room.openLeft;
      room.rawChain.push({
        tile,
        leftVal: outerVal,
        rightVal: innerVal,
        seatIndex,
        order: ++room.orderCounter,
        branch: 'left',
      });
      room.openLeft = outerVal;
    } else if (side === 'right' && room.openRight !== null) {
      const outerVal = tile.a === room.openRight ? tile.b : tile.a;
      const innerVal = room.openRight;
      room.rawChain.push({
        tile,
        leftVal: innerVal,
        rightVal: outerVal,
        seatIndex,
        order: ++room.orderCounter,
        branch: 'right',
      });
      room.openRight = outerVal;
    }
  }

  const activeCount = getActiveSeatIndices(room.mode, room.maxPlayers).length;
  const usesBoneyard =
    room.mode === '1v1' || (room.mode === 'ffa' && room.maxPlayers === 3);
  const isPasoCorrido =
    !usesBoneyard &&
    room.rawChain.length > 0 &&
    room.consecutivePasses >= activeCount - 1 &&
    room.lastPlaySeatIndex === seatIndex;

  if (isPasoCorrido) {
    seat.score += 30;
    seat.pointsContributed += 30;
    if (room.mode === 'ffa') {
      const hostSeat = room.seats.find((s) => s.uid === room.hostUid) || room.seats[0];
      room.teamAScore = hostSeat ? hostSeat.score : 0;
      room.teamBScore = Math.max(
        0,
        ...room.seats.filter((s) => s.seatIndex !== hostSeat?.seatIndex).map((s) => s.score)
      );
    } else if (seat.teamSide === 'A') {
      room.teamAScore += 30;
    } else {
      room.teamBScore += 30;
    }
  }

  seat.hand.splice(tileIdx, 1);
  seat.handCount = seat.hand.length;
  room.consecutivePasses = 0;
  room.lastPlaySeatIndex = seatIndex;
  room.board = layoutBoardChain(room.rawChain);

  const evt: RoundEvent = {
    type: 'play',
    seatIndex,
    playerName: seat.name,
    tileId: tile.id,
    side,
    isCapicua,
    isPasoCorrido,
    pointsAwarded: isPasoCorrido ? 30 : undefined,
    message: isPasoCorrido
      ? `¡PASO CORRIDO (+30 pts)! ${seat.name} jugó [${tile.a}|${tile.b}]`
      : `${seat.name} jugó [${tile.a}|${tile.b}]`,
    timestamp: Date.now(),
  };
  room.lastEvent = evt;

  if (seat.hand.length === 0) {
    finalizeRound(room, seatIndex, seat.teamSide, false, isCapicua);
    return true;
  }

  // If Paso Corrido (+30) immediately reached targetScore, conclude the match
  const pasoWonTeam = room.mode !== 'ffa' && (room.teamAScore >= room.targetScore || room.teamBScore >= room.targetScore);
  const pasoWonFfa = room.mode === 'ffa' && seat.score >= room.targetScore;
  if (isPasoCorrido && (pasoWonTeam || pasoWonFfa)) {
    clearRoomTimers(room);
    room.status = 'finished';
    room.winnerSide = seat.teamSide;
    room.winnerSeatIndex = seat.seatIndex;
    const isZapato =
      room.mode === 'ffa'
        ? room.seats.filter((s) => s.seatIndex !== seat.seatIndex).every((s) => s.score === 0)
        : (seat.teamSide === 'A' && room.teamBScore === 0) ||
          (seat.teamSide === 'B' && room.teamAScore === 0);
    const winnerLabel =
      room.mode === 'ffa'
        ? `${seat.name} (${seat.score} pts)`
        : `${room.seats
            .filter((s) => s.teamSide === seat.teamSide)
            .map((s) => s.name)
            .join(' & ')} (${room.teamAScore} - ${room.teamBScore})`;
    room.lastEvent = {
      type: 'match_end',
      winnerSide: seat.teamSide,
      winnerSeatIndex: seat.seatIndex,
      pointsAwarded: 30,
      isPasoCorrido: true,
      isZapato,
      message: `${isZapato ? '¡ZAPATO! ' : ''}¡PASO CORRIDO! ${winnerLabel} ganan la partida`,
      timestamp: Date.now(),
    };
    broadcastRoomState(room);
    const durationSeconds = room.startedAt
      ? Math.max(10, Math.round((Date.now() - room.startedAt) / 1000))
      : 60;
    recordCompletedMatch({
      roomCode: room.roomCode,
      mode: room.mode,
      tournamentId: room.tournamentId,
      wagerCoins: room.wagerCoins,
      targetScore: room.targetScore,
      teamAScore: room.teamAScore,
      teamBScore: room.teamBScore,
      winnerSide: seat.teamSide,
      winnerSeatIndex: room.mode === 'ffa' ? seat.seatIndex : undefined,
      winnerSummary: winnerLabel,
      roundsCount: room.roundNumber,
      capicuasCount: room.capicuasThisMatch,
      durationSeconds,
      participants: room.seats.map((s) => ({
        userId: s.userId,
        seatIndex: s.seatIndex,
        playerName: s.name,
        teamSide: s.teamSide,
        pointsContributed: s.pointsContributed,
        capicuasScored: s.capicuasScored,
      })),
    }).catch((err) => console.error('Failed to persist match:', err));
    return true;
  }

  room.currentTurnSeat = nextActiveSeat(room, seatIndex);
  room.turnStartedAt = Date.now();
  broadcastRoomState(room);
  scheduleTurnTimers(room);
  return true;
}

function executePassOrDraw(room: InternalRoom, seatIndex: number): boolean {
  if (room.status !== 'playing' || room.currentTurnSeat !== seatIndex) return false;
  const seat = room.seats.find((s) => s.seatIndex === seatIndex);
  if (!seat) return false;

  const mustPlayDoubleSix =
    room.roundNumber === 1 &&
    room.rawChain.length === 0 &&
    seat.hand.some((t) => t.a === 6 && t.b === 6);
  const legal = getLegalMoves(
    seat.hand,
    room.openLeft,
    room.openRight,
    mustPlayDoubleSix
  );
  if (legal.length > 0) return false;

  const usesBoneyard =
    room.mode === '1v1' || (room.mode === 'ffa' && room.maxPlayers === 3);
  if (usesBoneyard && room.boneyard.length > 0) {
    const drawn = room.boneyard.pop()!;
    seat.hand.push(drawn);
    seat.handCount = seat.hand.length;
    room.boneyardCount = room.boneyard.length;
    room.turnStartedAt = Date.now();
    room.lastEvent = {
      type: 'draw',
      seatIndex,
      playerName: seat.name,
      message: `${seat.name} tomó ficha del pozo`,
      timestamp: Date.now(),
    };
    broadcastRoomState(room);
    scheduleTurnTimers(room);
    return true;
  }

  room.consecutivePasses += 1;
  room.lastEvent = {
    type: 'pass',
    seatIndex,
    playerName: seat.name,
    message: `${seat.name} pasó`,
    timestamp: Date.now(),
  };

  const activeCount = getActiveSeatIndices(room.mode, room.maxPlayers).length;
  if (room.consecutivePasses >= activeCount) {
    finalizeRound(room, null, null, true, false);
    return true;
  }

  room.currentTurnSeat = nextActiveSeat(room, seatIndex);
  room.turnStartedAt = Date.now();
  broadcastRoomState(room);
  scheduleTurnTimers(room);
  return true;
}

function performAutoTurn(room: InternalRoom, seat: SeatState) {
  if (room.status !== 'playing' || room.currentTurnSeat !== seat.seatIndex) return;
  const mustPlayDoubleSix =
    room.roundNumber === 1 &&
    room.rawChain.length === 0 &&
    seat.hand.some((t) => t.a === 6 && t.b === 6);
  const move = chooseAiMove(
    seat.hand,
    room.openLeft,
    room.openRight,
    mustPlayDoubleSix,
    room.aiDifficulty
  );
  if (move) {
    executePlayTile(room, seat.seatIndex, move.tile.id, move.side);
  } else {
    executePassOrDraw(room, seat.seatIndex);
  }
}

function scheduleTurnTimers(room: InternalRoom) {
  if (room.aiTimer) {
    clearTimeout(room.aiTimer);
    room.aiTimer = undefined;
  }
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = undefined;
  }
  if (room.status !== 'playing') return;

  const currentSeat = room.seats.find((s) => s.seatIndex === room.currentTurnSeat);
  if (!currentSeat) return;

  if (currentSeat.isAi) {
    room.aiTimer = setTimeout(() => {
      performAutoTurn(room, currentSeat);
    }, 750);
  } else {
    const limitMs = Math.max(10, room.turnSeconds || 30) * 1000;
    room.turnTimer = setTimeout(() => {
      performAutoTurn(room, currentSeat);
    }, limitMs);
  }
}

export function attachWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const aliveMap = new WeakMap<WebSocket, boolean>();

  const heartbeat = setInterval(() => {
    for (const sock of wss.clients) {
      if (aliveMap.get(sock) === false) {
        sock.terminate();
        continue;
      }
      aliveMap.set(sock, false);
      sock.ping();
    }
  }, 25000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  wss.on('connection', (ws) => {
    aliveMap.set(ws, true);
    ws.on('pong', () => {
      aliveMap.set(ws, true);
    });

    const clientId = crypto.randomUUID();
    const client: ConnectedClient = {
      ws,
      clientId,
      uid: `guest_${clientId.slice(0, 8)}`,
      userId: null,
      displayName: `Invitado ${clientId.slice(0, 4).toUpperCase()}`,
      roomCode: null,
    };
    clients.set(clientId, client);

    sendJson(ws, {
      type: 'ws:welcome',
      clientId,
      rooms: listPublicRooms(),
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'auth:identify') {
          if (msg.token) {
            const dbUser: DbUser | null = await verifySocketToken(msg.token);
            if (dbUser) {
              client.uid = dbUser.uid;
              client.userId = dbUser.id;
              client.displayName = dbUser.displayName;
            }
          } else if (msg.displayName) {
            const clean = String(msg.displayName).trim().slice(0, 24);
            if (clean) {
              client.displayName = clean;
              if (client.roomCode) {
                const activeRoom = rooms.get(client.roomCode);
                const mySeat = activeRoom?.seats.find((s) => s.uid === client.uid);
                if (activeRoom && mySeat) {
                  mySeat.name = clean;
                  broadcastRoomState(activeRoom);
                }
              }
            }
          }
          sendJson(ws, {
            type: 'auth:identified',
            uid: client.uid,
            displayName: client.displayName,
            rooms: listPublicRooms(),
          });
          return;
        }

        if (msg.type === 'room:list') {
          sendJson(ws, { type: 'room:list', rooms: listPublicRooms() });
          return;
        }

        if (msg.type === 'room:create') {
          const mode: GameMode =
            msg.mode === '1v1' || msg.mode === 'tournament' || msg.mode === 'ffa'
              ? msg.mode
              : '2v2';
          const maxPlayers: 2 | 3 | 4 =
            mode === '1v1' ? 2 : mode === 'ffa' && Number(msg.maxPlayers) === 3 ? 3 : 4;
          const targetScore = Number(msg.targetScore) === 100 ? 100 : 200;
          const wagerCoins = Math.max(0, Math.min(10000, Number(msg.wagerCoins) || 0));
          const isPublic = msg.isPublic !== false;
          const aiDifficulty: AiDifficulty =
            msg.aiDifficulty === 'easy' || msg.aiDifficulty === 'hard'
              ? msg.aiDifficulty
              : 'normal';
          const turnSeconds = Math.max(10, Math.min(90, Number(msg.turnSeconds) || 30));
          const roomCode = makeRoomCode(msg.customCode);
          const hostSeat: SeatState = {
            seatIndex: 0,
            userId: client.userId,
            uid: client.uid,
            name: client.displayName,
            isAi: false,
            teamSide: 'A',
            hand: [],
            handCount: 0,
            connected: true,
            micOn: false,
            camOn: false,
            score: 0,
            pointsContributed: 0,
            capicuasScored: 0,
          };

          const room: InternalRoom = {
            roomCode,
            hostUid: client.uid,
            mode,
            maxPlayers,
            isPublic,
            aiDifficulty,
            turnSeconds,
            turnStartedAt: Date.now(),
            targetScore,
            wagerCoins,
            tournamentId: msg.tournamentId ? Number(msg.tournamentId) : null,
            status: 'waiting',
            roundNumber: 1,
            salidorSeat: 0,
            currentTurnSeat: 0,
            consecutivePasses: 0,
            teamAScore: 0,
            teamBScore: 0,
            openLeft: null,
            openRight: null,
            board: [],
            boneyardCount: 0,
            seats: [hostSeat],
            lastEvent: null,
            winnerSide: null,
            winnerSeatIndex: null,
            startedAt: Date.now(),
            rawChain: [],
            boneyard: [],
            orderCounter: 0,
            lastPlaySeatIndex: null,
            capicuasThisMatch: 0,
          };

          rooms.set(roomCode, room);
          client.roomCode = roomCode;

          if (msg.autoStartWithAi) {
            startRound(room);
          } else {
            broadcastRoomState(room);
          }
          return;
        }

        if (msg.type === 'room:join') {
          const code = String(msg.roomCode || '').trim().toUpperCase();
          const room = rooms.get(code);
          if (!room) {
            sendJson(ws, { type: 'error', message: 'Sala no encontrada' });
            return;
          }

          let seat = room.seats.find((s) => s.uid === client.uid);
          if (!seat) {
            const activeIndices = getActiveSeatIndices(room.mode, room.maxPlayers);
            const openIdx = activeIndices.find(
              (idx) => !room.seats.some((s) => s.seatIndex === idx && !s.isAi)
            );
            if (openIdx === undefined) {
              sendJson(ws, { type: 'error', message: 'La mesa está llena' });
              return;
            }
            const aiSeatIdx = room.seats.findIndex((s) => s.seatIndex === openIdx && s.isAi);
            const newSeat: SeatState = {
              seatIndex: openIdx,
              userId: client.userId,
              uid: client.uid,
              name: client.displayName,
              isAi: false,
              teamSide: openIdx % 2 === 0 ? 'A' : 'B',
              hand: aiSeatIdx !== -1 ? room.seats[aiSeatIdx].hand : [],
              handCount: aiSeatIdx !== -1 ? room.seats[aiSeatIdx].handCount : 0,
              connected: true,
              micOn: false,
              camOn: false,
              score: aiSeatIdx !== -1 ? room.seats[aiSeatIdx].score : 0,
              pointsContributed: 0,
              capicuasScored: 0,
            };
            if (aiSeatIdx !== -1) {
              room.seats[aiSeatIdx] = newSeat;
            } else {
              room.seats.push(newSeat);
              room.seats.sort((a, b) => a.seatIndex - b.seatIndex);
            }
          } else {
            seat.connected = true;
          }

          client.roomCode = code;
          broadcastRoomState(room);
          return;
        }

        if (msg.type === 'room:add-bot' && client.roomCode) {
          const room = rooms.get(client.roomCode);
          if (!room || room.status !== 'waiting' || room.hostUid !== client.uid) return;
          const idx = Number(msg.seatIndex);
          const active = getActiveSeatIndices(room.mode, room.maxPlayers);
          if (!active.includes(idx)) return;
          if (room.seats.some((s) => s.seatIndex === idx)) return;
          room.seats.push(createBotSeat(room, idx));
          room.seats.sort((a, b) => a.seatIndex - b.seatIndex);
          broadcastRoomState(room);
          return;
        }

        if (msg.type === 'room:remove-bot' && client.roomCode) {
          const room = rooms.get(client.roomCode);
          if (!room || room.status !== 'waiting' || room.hostUid !== client.uid) return;
          const idx = Number(msg.seatIndex);
          room.seats = room.seats.filter((s) => !(s.seatIndex === idx && s.isAi));
          broadcastRoomState(room);
          return;
        }

        if (msg.type === 'room:sit' && client.roomCode) {
          const room = rooms.get(client.roomCode);
          if (!room || room.status !== 'waiting') return;
          const targetIdx = Number(msg.seatIndex);
          const active = getActiveSeatIndices(room.mode, room.maxPlayers);
          if (!active.includes(targetIdx)) return;

          const occupant = room.seats.find((s) => s.seatIndex === targetIdx);
          if (occupant && !occupant.isAi) return;

          const mySeat = room.seats.find((s) => s.uid === client.uid);
          if (!mySeat) return;

          if (occupant && occupant.isAi) {
            occupant.seatIndex = mySeat.seatIndex;
            occupant.teamSide = occupant.seatIndex % 2 === 0 ? 'A' : 'B';
          }
          mySeat.seatIndex = targetIdx;
          mySeat.teamSide = targetIdx % 2 === 0 ? 'A' : 'B';
          room.seats.sort((a, b) => a.seatIndex - b.seatIndex);
          broadcastRoomState(room);
          return;
        }

        if (msg.type === 'room:update-rules' && client.roomCode) {
          const room = rooms.get(client.roomCode);
          if (!room || room.status !== 'waiting' || room.hostUid !== client.uid) return;
          if (msg.aiDifficulty === 'easy' || msg.aiDifficulty === 'normal' || msg.aiDifficulty === 'hard') {
            room.aiDifficulty = msg.aiDifficulty;
          }
          if (typeof msg.isPublic === 'boolean') {
            room.isPublic = msg.isPublic;
          }
          if (msg.targetScore === 100 || msg.targetScore === 200) {
            room.targetScore = msg.targetScore;
          }
          if (typeof msg.turnSeconds === 'number') {
            room.turnSeconds = Math.max(10, Math.min(90, msg.turnSeconds));
          }
          broadcastRoomState(room);
          return;
        }

        if (msg.type === 'room:leave') {
          if (client.roomCode) {
            const room = rooms.get(client.roomCode);
            if (room) {
              const seat = room.seats.find((s) => s.uid === client.uid);
              if (seat) {
                if (room.status === 'playing') {
                  seat.isAi = true;
                  seat.name = `${seat.name} (AI)`;
                  scheduleTurnTimers(room);
                } else {
                  room.seats = room.seats.filter((s) => s.uid !== client.uid);
                }
              }
              if (room.seats.every((s) => s.isAi || !s.connected)) {
                clearRoomTimers(room);
                rooms.delete(room.roomCode);
              } else {
                broadcastRoomState(room);
              }
            }
            client.roomCode = null;
          }
          return;
        }

        if (msg.type === 'room:start' && client.roomCode) {
          const room = rooms.get(client.roomCode);
          if (!room || room.hostUid !== client.uid) return;
          room.roundNumber = 1;
          room.teamAScore = 0;
          room.teamBScore = 0;
          room.winnerSide = null;
          room.winnerSeatIndex = null;
          room.startedAt = Date.now();
          room.capicuasThisMatch = 0;
          for (const s of room.seats) {
            s.score = 0;
            s.pointsContributed = 0;
            s.capicuasScored = 0;
          }
          startRound(room);
          return;
        }

        if (msg.type === 'room:rematch' && client.roomCode) {
          const room = rooms.get(client.roomCode);
          if (!room) return;
          room.roundNumber = 1;
          room.teamAScore = 0;
          room.teamBScore = 0;
          room.winnerSide = null;
          room.winnerSeatIndex = null;
          room.startedAt = Date.now();
          room.capicuasThisMatch = 0;
          for (const s of room.seats) {
            s.score = 0;
            s.pointsContributed = 0;
            s.capicuasScored = 0;
          }
          startRound(room);
          return;
        }

        if (msg.type === 'game:play-tile' && client.roomCode) {
          const room = rooms.get(client.roomCode);
          if (!room) return;
          const seat = room.seats.find((s) => s.uid === client.uid);
          if (!seat) return;
          executePlayTile(
            room,
            seat.seatIndex,
            String(msg.tileId),
            msg.side === 'right' ? 'right' : 'left'
          );
          return;
        }

        if (msg.type === 'game:pass' && client.roomCode) {
          const room = rooms.get(client.roomCode);
          if (!room) return;
          const seat = room.seats.find((s) => s.uid === client.uid);
          if (!seat) return;
          executePassOrDraw(room, seat.seatIndex);
          return;
        }

        if (msg.type === 'chat:send' && client.roomCode) {
          broadcastToRoom(client.roomCode, {
            type: 'chat:message',
            id: crypto.randomUUID(),
            uid: client.uid,
            senderName: client.displayName,
            text: String(msg.text || '').slice(0, 200),
            timestamp: Date.now(),
          });
          return;
        }

        // WebRTC Voice & Video Call Signaling
        if (msg.type === 'rtc:join-media' && client.roomCode) {
          const room = rooms.get(client.roomCode);
          if (room) {
            const seat = room.seats.find((s) => s.uid === client.uid);
            if (seat) {
              seat.micOn = Boolean(msg.micOn);
              seat.camOn = Boolean(msg.camOn);
              broadcastRoomState(room);
            }
          }
          broadcastToRoom(
            client.roomCode,
            {
              type: 'rtc:peer-joined',
              peerId: client.clientId,
              uid: client.uid,
              displayName: client.displayName,
            },
            client.clientId
          );
          return;
        }

        if (msg.type === 'rtc:media-state' && client.roomCode) {
          const room = rooms.get(client.roomCode);
          if (room) {
            const seat = room.seats.find((s) => s.uid === client.uid);
            if (seat) {
              seat.micOn = Boolean(msg.micOn);
              seat.camOn = Boolean(msg.camOn);
              broadcastRoomState(room);
            }
          }
          return;
        }

        if (
          (msg.type === 'rtc:offer' ||
            msg.type === 'rtc:answer' ||
            msg.type === 'rtc:ice-candidate') &&
          msg.targetPeerId
        ) {
          const target = clients.get(String(msg.targetPeerId));
          if (target) {
            sendJson(target.ws, {
              type: msg.type,
              fromPeerId: client.clientId,
              fromUid: client.uid,
              fromName: client.displayName,
              sdp: msg.sdp,
              candidate: msg.candidate,
            });
          }
          return;
        }

        if (msg.type === 'rtc:leave-media' && client.roomCode) {
          const room = rooms.get(client.roomCode);
          if (room) {
            const seat = room.seats.find((s) => s.uid === client.uid);
            if (seat) {
              seat.micOn = false;
              seat.camOn = false;
              broadcastRoomState(room);
            }
          }
          broadcastToRoom(
            client.roomCode,
            {
              type: 'rtc:peer-left',
              peerId: client.clientId,
              uid: client.uid,
            },
            client.clientId
          );
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      if (client.roomCode) {
        const room = rooms.get(client.roomCode);
        if (room) {
          const seat = room.seats.find((s) => s.uid === client.uid);
          if (seat) {
            seat.connected = false;
            seat.micOn = false;
            seat.camOn = false;
            if (room.status === 'playing') {
              seat.isAi = true;
              scheduleTurnTimers(room);
            }
          }
          broadcastToRoom(
            client.roomCode,
            {
              type: 'rtc:peer-left',
              peerId: client.clientId,
              uid: client.uid,
            },
            client.clientId
          );
          if (room.seats.every((s) => s.isAi || !s.connected)) {
            clearRoomTimers(room);
            rooms.delete(room.roomCode);
          } else {
            broadcastRoomState(room);
          }
        }
      }
      clients.delete(clientId);
    });
  });

  return wss;
}
