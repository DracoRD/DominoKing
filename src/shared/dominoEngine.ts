export interface DominoTile {
  id: string; // e.g. "6-6"
  a: number; // 0..6
  b: number; // 0..6
  isDouble: boolean;
}

export interface PlacedTile {
  tile: DominoTile;
  leftVal: number;
  rightVal: number;
  seatIndex: number;
  order: number;
  x: number;
  z: number;
  rotY: number; // radians around Y
}

export type GameMode = '2v2' | '1v1' | 'tournament' | 'ffa';
export type AiDifficulty = 'easy' | 'normal' | 'hard';

export interface SeatState {
  seatIndex: number;
  userId: number | null;
  uid: string;
  name: string;
  isAi: boolean;
  teamSide: 'A' | 'B';
  hand: DominoTile[];
  handCount: number;
  connected: boolean;
  micOn: boolean;
  camOn: boolean;
  score: number;
  pointsContributed: number;
  capicuasScored: number;
}

export interface RoundEvent {
  type: 'play' | 'pass' | 'draw' | 'round_end' | 'match_end' | 'system';
  seatIndex?: number;
  playerName?: string;
  tileId?: string;
  side?: 'left' | 'right';
  isCapicua?: boolean;
  isPasoCorrido?: boolean;
  isZapato?: boolean;
  isTranque?: boolean;
  pointsAwarded?: number;
  winnerSide?: 'A' | 'B';
  winnerSeatIndex?: number;
  message: string;
  timestamp: number;
}

export interface LegalMove {
  tile: DominoTile;
  side: 'left' | 'right';
}

export interface DominoRoomState {
  roomCode: string;
  hostUid: string;
  mode: GameMode;
  maxPlayers: 2 | 3 | 4;
  isPublic: boolean;
  aiDifficulty: AiDifficulty;
  turnSeconds: number;
  turnStartedAt: number;
  targetScore: number;
  wagerCoins: number;
  tournamentId: number | null;
  status: 'waiting' | 'playing' | 'round_over' | 'finished';
  roundNumber: number;
  salidorSeat: number;
  currentTurnSeat: number;
  consecutivePasses: number;
  teamAScore: number;
  teamBScore: number;
  openLeft: number | null;
  openRight: number | null;
  board: PlacedTile[];
  boneyardCount: number;
  seats: SeatState[];
  lastEvent: RoundEvent | null;
  winnerSide: 'A' | 'B' | null;
  winnerSeatIndex: number | null;
  startedAt: number | null;
}

export const TILE_LENGTH = 0.78;
export const TILE_WIDTH = 0.39;
export const TILE_HEIGHT = 0.13;
export const TILE_GAP = 0.03;

export function createFullDeck(): DominoTile[] {
  const deck: DominoTile[] = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      deck.push({
        id: `${a}-${b}`,
        a,
        b,
        isDouble: a === b,
      });
    }
  }
  return deck;
}

export function shuffleDeck(deck: DominoTile[]): DominoTile[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function tilePipTotal(tile: DominoTile): number {
  return tile.a + tile.b;
}

export function handPipTotal(hand: DominoTile[]): number {
  return hand.reduce((sum, t) => sum + t.a + t.b, 0);
}

export function getLegalMoves(
  hand: DominoTile[],
  openLeft: number | null,
  openRight: number | null,
  mustPlayDoubleSix: boolean
): LegalMove[] {
  if (openLeft === null || openRight === null) {
    if (mustPlayDoubleSix) {
      const d6 = hand.find((t) => t.a === 6 && t.b === 6);
      if (d6) return [{ tile: d6, side: 'left' }];
    }
    return hand.map((tile) => ({ tile, side: 'left' as const }));
  }

  const moves: LegalMove[] = [];
  for (const tile of hand) {
    const fitsLeft = tile.a === openLeft || tile.b === openLeft;
    const fitsRight = tile.a === openRight || tile.b === openRight;
    if (fitsLeft) {
      moves.push({ tile, side: 'left' });
    }
    if (fitsRight && openLeft !== openRight) {
      moves.push({ tile, side: 'right' });
    } else if (fitsRight && openLeft === openRight && !fitsLeft) {
      moves.push({ tile, side: 'right' });
    } else if (fitsRight && openLeft === openRight && fitsLeft) {
      moves.push({ tile, side: 'right' });
    }
  }
  return moves;
}

/**
 * Computes 3D coordinates for the snaking Dominican domino chain so that all 28
 * tiles stay centered and visible inside the mahogany table surface.
 */
export function layoutBoardChain(
  rawItems: Array<{
    tile: DominoTile;
    leftVal: number;
    rightVal: number;
    seatIndex: number;
    order: number;
    branch: 'center' | 'left' | 'right';
  }>
): PlacedTile[] {
  if (rawItems.length === 0) return [];

  const centerItem = rawItems.find((i) => i.branch === 'center') || rawItems[0];
  const leftItems = rawItems
    .filter((i) => i.branch === 'left')
    .sort((a, b) => a.order - b.order);
  const rightItems = rawItems
    .filter((i) => i.branch === 'right')
    .sort((a, b) => a.order - b.order);

  const placed: PlacedTile[] = [];

  // Center anchor at (0, 0)
  const centerDouble = centerItem.tile.isDouble;
  placed.push({
    tile: centerItem.tile,
    leftVal: centerItem.leftVal,
    rightVal: centerItem.rightVal,
    seatIndex: centerItem.seatIndex,
    order: centerItem.order,
    x: 0,
    z: 0,
    rotY: centerDouble ? 0 : Math.PI / 2,
  });

  // Helper to lay a branch starting from center edge
  const placeBranch = (
    items: typeof leftItems,
    initialDirX: -1 | 1
  ) => {
    const centerHalfSpan = centerDouble
      ? TILE_WIDTH / 2
      : TILE_LENGTH / 2;

    let cursorX = initialDirX * (centerHalfSpan + TILE_GAP);
    let cursorZ = 0;
    let dirX: number = initialDirX;
    let dirZ = 0; // -1 = -Z (north), +1 = +Z (south)
    const maxX = 3.65;
    const zTurnOffset = initialDirX === 1 ? 1.25 : -1.25;
    let state: 'outward' | 'turning' | 'return' = 'outward';
    let turnTilesLeft = 0;

    for (const item of items) {
      const isDouble = item.tile.isDouble;
      const alongLen = isDouble ? TILE_WIDTH : TILE_LENGTH;

      // Check boundary to start smooth U-turn inside table
      if (state === 'outward' && Math.abs(cursorX) + alongLen > maxX) {
        state = 'turning';
        dirX = 0;
        dirZ = zTurnOffset > 0 ? 1 : -1;
        turnTilesLeft = 2;
      }

      if (state === 'outward') {
        const cx = cursorX + dirX * (alongLen / 2);
        const cz = cursorZ;
        // Orient pips correctly along X
        // If dirX === -1 (extending left), outer face is leftVal, inner face is rightVal
        // In local tile geometry: top half (-Z in local) is `a`, bottom half (+Z in local) is `b`.
        // Rotating by +PI/2 around Y maps local -Z -> -X (a faces -X), +Z -> +X (b faces +X).
        // Rotating by -PI/2 around Y maps local -Z -> +X (a faces +X), +Z -> -X (b faces -X).
        let rotY = 0;
        if (isDouble) {
          rotY = 0;
        } else if (dirX === -1) {
          // Outer end is -X (leftVal). So if tile.a === leftVal, a should face -X => rotY = +PI/2
          rotY = item.tile.a === item.leftVal ? Math.PI / 2 : -Math.PI / 2;
        } else {
          // Extending +X: outer end is +X (rightVal). If tile.a === rightVal, a should face +X => rotY = -PI/2
          rotY = item.tile.a === item.rightVal ? -Math.PI / 2 : Math.PI / 2;
        }

        placed.push({
          tile: item.tile,
          leftVal: item.leftVal,
          rightVal: item.rightVal,
          seatIndex: item.seatIndex,
          order: item.order,
          x: cx,
          z: cz,
          rotY,
        });
        cursorX += dirX * (alongLen + TILE_GAP);
      } else if (state === 'turning') {
        const cx = cursorX;
        const cz = cursorZ + dirZ * (alongLen / 2 + TILE_WIDTH * 0.25);
        let rotY = Math.PI / 2;
        if (!isDouble) {
          // Moving along Z (dirZ = +1 or -1)
          const outerVal = initialDirX === -1 ? item.leftVal : item.rightVal;
          if (dirZ === 1) {
            // Outer is +Z: tile.b faces +Z when rotY = 0
            rotY = item.tile.b === outerVal ? 0 : Math.PI;
          } else {
            // Outer is -Z: tile.a faces -Z when rotY = 0
            rotY = item.tile.a === outerVal ? 0 : Math.PI;
          }
        }
        placed.push({
          tile: item.tile,
          leftVal: item.leftVal,
          rightVal: item.rightVal,
          seatIndex: item.seatIndex,
          order: item.order,
          x: cx,
          z: cz,
          rotY,
        });
        cursorZ = cz + dirZ * (alongLen / 2 + TILE_GAP);
        turnTilesLeft -= 1;
        if (turnTilesLeft <= 0) {
          state = 'return';
          dirX = initialDirX === 1 ? -1 : 1;
          dirZ = 0;
        }
      } else {
        // Return leg parallel to center
        const cx = cursorX + dirX * (alongLen / 2);
        const cz = cursorZ;
        let rotY = 0;
        if (!isDouble) {
          const outerVal = initialDirX === -1 ? item.leftVal : item.rightVal;
          if (dirX === -1) {
            rotY = item.tile.a === outerVal ? Math.PI / 2 : -Math.PI / 2;
          } else {
            rotY = item.tile.a === outerVal ? -Math.PI / 2 : Math.PI / 2;
          }
        }
        placed.push({
          tile: item.tile,
          leftVal: item.leftVal,
          rightVal: item.rightVal,
          seatIndex: item.seatIndex,
          order: item.order,
          x: cx,
          z: cz,
          rotY,
        });
        cursorX += dirX * (alongLen + TILE_GAP);
      }
    }
  };

  placeBranch(leftItems, -1);
  placeBranch(rightItems, 1);

  return placed.sort((a, b) => a.order - b.order);
}

/**
 * Smart Dominican AI move selector: prioritizes doubles early, sheds high-pip
 * tiles, and tracks suit frequency in hand.
 */
export function chooseAiMove(
  hand: DominoTile[],
  openLeft: number | null,
  openRight: number | null,
  mustPlayDoubleSix: boolean,
  difficulty: AiDifficulty = 'normal'
): LegalMove | null {
  const legal = getLegalMoves(hand, openLeft, openRight, mustPlayDoubleSix);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  if (difficulty === 'easy') {
    return legal[Math.floor(Math.random() * legal.length)];
  }

  const suitCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const t of hand) {
    suitCounts[t.a] += 1;
    if (t.b !== t.a) suitCounts[t.b] += 1;
  }

  let best = legal[0];
  let bestScore = -9999;

  for (const move of legal) {
    const pips = move.tile.a + move.tile.b;
    const doubleBonus = move.tile.isDouble ? (difficulty === 'hard' ? 12 : 7) : 0;
    const suitStrength = suitCounts[move.tile.a] + suitCounts[move.tile.b];
    const noise = difficulty === 'normal' ? Math.random() * 2.5 : 0;
    const score = pips + doubleBonus + suitStrength * (difficulty === 'hard' ? 3 : 2) + noise;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}
