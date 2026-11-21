import React, { useMemo } from 'react';
import { Bot, Mic, MicOff } from 'lucide-react';
import {
  DominoRoomState,
  DominoTile,
  PlacedTile,
  TILE_LENGTH,
  TILE_WIDTH,
} from '../shared/dominoEngine';
import { DominoTile2D } from './DominoTile2D';
import { PlayerAvatar2D } from './PlayerAvatar2D';

interface DominoTable2DProps {
  room: DominoRoomState | null;
  myUid: string;
  selectedTileId: string | null;
  legalTileIds: Set<string>;
  isMyTurn: boolean;
  videoStreams: Record<string, MediaStream>;
  topSlot?: React.ReactNode;
  actionBarSlot?: React.ReactNode;
  onSelectTile?: (tileId: string) => void;
  onPlayEnd?: (side: 'left' | 'right') => void;
}

const PIP_COORDS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[50, 50]],
  2: [
    [25, 25],
    [75, 75],
  ],
  3: [
    [24, 24],
    [50, 50],
    [76, 76],
  ],
  4: [
    [25, 25],
    [75, 25],
    [25, 75],
    [75, 75],
  ],
  5: [
    [24, 24],
    [76, 24],
    [50, 50],
    [24, 76],
    [76, 76],
  ],
  6: [
    [27, 21],
    [73, 21],
    [27, 50],
    [73, 50],
    [27, 79],
    [73, 79],
  ],
};

// Classic White & Black Domino Pip Color
const BLACK_PIP = '#0D0D0F';

const DEMO_PLACED: PlacedTile[] = [
  { tile: { id: '6-6', a: 6, b: 6, isDouble: true }, leftVal: 6, rightVal: 6, seatIndex: 0, order: 0, x: 0, z: 0, rotY: 0 },
  { tile: { id: '6-4', a: 6, b: 4, isDouble: false }, leftVal: 6, rightVal: 4, seatIndex: 1, order: 1, x: 0.62, z: 0, rotY: -Math.PI / 2 },
  { tile: { id: '4-4', a: 4, b: 4, isDouble: true }, leftVal: 4, rightVal: 4, seatIndex: 2, order: 2, x: 1.24, z: 0, rotY: 0 },
  { tile: { id: '4-2', a: 4, b: 2, isDouble: false }, leftVal: 4, rightVal: 2, seatIndex: 3, order: 3, x: 1.86, z: 0, rotY: -Math.PI / 2 },
  { tile: { id: '5-6', a: 5, b: 6, isDouble: false }, leftVal: 5, rightVal: 6, seatIndex: 1, order: 4, x: -0.62, z: 0, rotY: Math.PI / 2 },
  { tile: { id: '3-5', a: 3, b: 5, isDouble: false }, leftVal: 3, rightVal: 5, seatIndex: 2, order: 5, x: -1.44, z: 0, rotY: Math.PI / 2 },
  { tile: { id: '3-3', a: 3, b: 3, isDouble: true }, leftVal: 3, rightVal: 3, seatIndex: 0, order: 6, x: -2.06, z: 0, rotY: 0 },
];

const DEMO_LOCAL_HAND: DominoTile[] = [
  { id: '6-1', a: 6, b: 1, isDouble: false },
  { id: '5-5', a: 5, b: 5, isDouble: true },
  { id: '5-2', a: 5, b: 2, isDouble: false },
  { id: '4-3', a: 4, b: 3, isDouble: false },
  { id: '3-0', a: 3, b: 0, isDouble: false },
  { id: '2-2', a: 2, b: 2, isDouble: true },
  { id: '1-0', a: 1, b: 0, isDouble: false },
];

const SvgDominoTile: React.FC<{
  tile: DominoTile;
  x: number;
  y: number;
  angleDeg: number;
  isLatest?: boolean;
}> = ({ tile, x, y, angleDeg, isLatest }) => {
  const w = TILE_WIDTH * 100; // 39
  const h = TILE_LENGTH * 100; // 78
  const halfW = w / 2;
  const halfH = h / 2;

  const renderHalf = (val: number, offsetY: number) =>
    (PIP_COORDS[val] || []).map(([px, py], idx) => {
      const cx = -halfW + 3.2 + (px / 100) * (w - 6.4);
      const cy = offsetY + 3.2 + (py / 100) * (halfH - 6.4);
      return (
        <g key={`${val}-${idx}`}>
          <circle cx={cx} cy={cy - 0.5} r={4.4} fill="rgba(0,0,0,0.2)" />
          <circle cx={cx} cy={cy} r={4.15} fill={BLACK_PIP} />
          <circle cx={cx - 1.1} cy={cy - 1.1} r={0.95} fill="rgba(255,255,255,0.28)" />
        </g>
      );
    });

  return (
    <g transform={`translate(${x}, ${y}) rotate(${angleDeg})`}>
      {isLatest && (
        <rect
          x={-halfW - 4.5}
          y={-halfH - 4.5}
          width={w + 9}
          height={h + 9}
          rx={8}
          fill="rgba(234, 169, 56, 0.3)"
          stroke="#EAA938"
          strokeWidth={2.8}
        />
      )}

      {/* Strong dark contact shadow so white & black dominoes pop over any Dominican quadrant */}
      <rect
        x={-halfW + 2.5}
        y={-halfH + 4.8}
        width={w}
        height={h}
        rx={6}
        fill="rgba(0, 0, 0, 0.68)"
      />

      {/* Classic Jet-Black 3D Side Thickness Rim */}
      <rect
        x={-halfW}
        y={-halfH + 3.2}
        width={w}
        height={h}
        rx={6}
        fill="#141417"
        stroke="#000000"
        strokeWidth={1.2}
      />

      {/* Crisp White Face */}
      <rect
        x={-halfW}
        y={-halfH}
        width={w}
        height={h}
        rx={6}
        fill="url(#ivoryGrad)"
        stroke={isLatest ? '#EAA938' : '#18181B'}
        strokeWidth={isLatest ? 2.4 : 1.6}
      />

      {/* Classic Black Divider Line + Pin */}
      <line
        x1={-halfW + 4.5}
        y1={0}
        x2={halfW - 4.5}
        y2={0}
        stroke="#111113"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <circle cx={0} cy={0} r={2.4} fill="#111113" stroke="#E4E4E7" strokeWidth={0.7} />

      {renderHalf(tile.a, -halfH)}
      {renderHalf(tile.b, 0)}
    </g>
  );
};

/* Classic Matte Black Tile Backs for opponents */
const MiniTileBack: React.FC<{ orientation: 'vertical' | 'horizontal' }> = ({
  orientation,
}) => (
  <div
    className={`rounded-[3px] bg-gradient-to-b from-[#232329] to-[#0D0D10] border border-[#52525B] shadow-[0_2px_5px_rgba(0,0,0,0.72)] flex items-center justify-center shrink-0 ${
      orientation === 'vertical'
        ? 'w-3 h-[22px] sm:w-4 sm:h-7 border-b-[2px] border-b-[#000000]'
        : 'w-[22px] h-3 sm:w-7 sm:h-4 border-b-[2px] border-b-[#000000]'
    }`}
  >
    <span className="w-1 h-1 rounded-full bg-white/45" />
  </div>
);

const MiniTileFace: React.FC<{ tile: DominoTile; orientation: 'vertical' | 'horizontal' }> = ({
  tile,
  orientation,
}) => (
  <div
    className={`rounded-[3px] bg-gradient-to-b from-[#FFFFFF] to-[#EFEFEF] border border-[#18181B] border-b-[2px] border-b-[#09090B] shadow-md flex items-center justify-center text-[9px] sm:text-[10px] font-mono font-black text-[#0D0D0F] shrink-0 ${
      orientation === 'vertical' ? 'w-4 h-7 flex-col leading-none' : 'w-7 h-4 flex-row gap-0.5 leading-none'
    }`}
  >
    <span>{tile.a}</span>
    <span>{tile.b}</span>
  </div>
);

interface TableSeatView {
  seatIndex: number;
  uid: string;
  name: string;
  isAi: boolean;
  teamSide: 'A' | 'B';
  handCount: number;
  hand: DominoTile[];
  score: number;
  isTurn: boolean;
  micOn: boolean;
  camOn: boolean;
}

const TablePlayerPod: React.FC<{
  seat: TableSeatView;
  orientation: 'top' | 'side';
  revealTiles: boolean;
  showScore?: boolean;
  stream?: MediaStream;
}> = ({ seat, orientation, revealTiles, showScore = false, stream }) => {
  const tileOrientation = orientation === 'top' ? 'vertical' : 'horizontal';
  const hasLiveVideo = Boolean(
    stream && stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live')
  );

  return (
    <div className="flex flex-col items-center gap-1.5 z-20 pointer-events-none">
      {/* Compact Dark Espresso Badge (expands into large camera frame when video is active) */}
      <div
        className={`flex ${
          hasLiveVideo ? 'flex-col items-center gap-1.5 p-1.5 sm:p-2' : 'items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-2.5 sm:py-1.5'
        } rounded-xl shadow-lg border transition-all ${
          seat.isTurn
            ? 'bg-[#291308]/95 border-[#EAA938] ring-2 ring-[#EAA938]/55'
            : 'bg-[#281208]/88 border-white/10'
        }`}
      >
        <PlayerAvatar2D
          seatIndex={seat.seatIndex}
          name={seat.name}
          teamSide={seat.teamSide}
          camOn={seat.camOn}
          stream={stream}
          sizeClass={
            hasLiveVideo
              ? 'w-24 h-[72px] sm:w-32 sm:h-24'
              : 'w-9 h-9 sm:w-11 sm:h-11'
          }
        />
        <div className={`min-w-0 leading-tight ${hasLiveVideo ? 'text-center' : ''}`}>
          <div className="flex items-center justify-center gap-1">
            {seat.isAi && <Bot className="w-3 h-3 text-zinc-300 shrink-0" />}
            <span className="text-[11px] sm:text-xs font-bold text-[#F7F1E5] truncate max-w-[82px] sm:max-w-[110px]">
              {seat.name}
            </span>
            {!seat.isAi && (
              seat.micOn ? (
                <Mic className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
              ) : (
                <MicOff className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
              )
            )}
          </div>
          {showScore && (
            <div className="text-[10px] font-mono font-bold text-[#EAA938]">
              {seat.score} pts
            </div>
          )}
        </div>
      </div>

      {/* Neat Tile Backs tucked directly underneath player badge (horizontal for top, vertical stack for sides) */}
      {seat.handCount > 0 && (
        <div
          className={`flex items-center justify-center gap-[3px] ${
            orientation === 'top' ? 'flex-row' : 'flex-col'
          }`}
        >
          {revealTiles && seat.hand.length > 0
            ? seat.hand.map((t) => (
                <MiniTileFace key={t.id} tile={t} orientation={tileOrientation} />
              ))
            : Array.from({ length: seat.handCount }).map((_, idx) => (
                <MiniTileBack key={idx} orientation={tileOrientation} />
              ))}
        </div>
      )}
    </div>
  );
};

export const DominoTable2D: React.FC<DominoTable2DProps> = ({
  room,
  myUid,
  selectedTileId,
  legalTileIds,
  isMyTurn,
  videoStreams,
  topSlot,
  actionBarSlot,
  onSelectTile,
  onPlayEnd,
}) => {
  const boardItems = room ? room.board : DEMO_PLACED;

  const latestOrder = useMemo(() => {
    if (boardItems.length === 0) return -1;
    return boardItems.reduce((max, t) => Math.max(max, t.order), -1);
  }, [boardItems]);

  const boardMetrics = useMemo(() => {
    if (boardItems.length === 0) {
      return {
        viewBox: '-210 -120 420 240',
        leftEnd: { x: -80, y: 0 },
        rightEnd: { x: 80, y: 0 },
      };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const item of boardItems) {
      const px = item.x * 100;
      const py = item.z * 100;
      const padX = Math.abs(Math.sin(item.rotY)) > 0.5 ? (TILE_LENGTH * 100) / 2 : (TILE_WIDTH * 100) / 2;
      const padY = Math.abs(Math.sin(item.rotY)) > 0.5 ? (TILE_WIDTH * 100) / 2 : (TILE_LENGTH * 100) / 2;
      minX = Math.min(minX, px - padX);
      maxX = Math.max(maxX, px + padX);
      minY = Math.min(minY, py - padY);
      maxY = Math.max(maxY, py + padY);
    }

    const pad = 44;
    const rawW = Math.max(300, maxX - minX + pad * 2);
    const rawH = Math.max(155, maxY - minY + pad * 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const leftMost = boardItems.reduce((a, b) => (b.x < a.x ? b : a));
    const rightMost = boardItems.reduce((a, b) => (b.x > a.x ? b : a));

    return {
      viewBox: `${cx - rawW / 2} ${cy - rawH / 2} ${rawW} ${rawH}`,
      leftEnd: { x: leftMost.x * 100 - 62, y: leftMost.z * 100 },
      rightEnd: { x: rightMost.x * 100 + 62, y: rightMost.z * 100 },
    };
  }, [boardItems]);

  const mySeat = room?.seats.find((s) => s.uid === myUid);
  const mySeatIdx = mySeat ? mySeat.seatIndex : 0;

  const seatsByRel = useMemo(() => {
    if (!room) {
      return {
        south: {
          seatIndex: 0,
          uid: myUid || 'local',
          name: 'Tú',
          isAi: false,
          teamSide: 'A' as const,
          handCount: 7,
          hand: DEMO_LOCAL_HAND,
          score: 0,
          isTurn: true,
          micOn: true,
          camOn: false,
        },
        east: {
          seatIndex: 1,
          uid: 'demo_1',
          name: 'Chela',
          isAi: true,
          teamSide: 'B' as const,
          handCount: 7,
          hand: [] as DominoTile[],
          score: 0,
          isTurn: false,
          micOn: false,
          camOn: false,
        },
        north: {
          seatIndex: 2,
          uid: 'demo_2',
          name: 'Wisin',
          isAi: true,
          teamSide: 'A' as const,
          handCount: 7,
          hand: [] as DominoTile[],
          score: 0,
          isTurn: false,
          micOn: false,
          camOn: false,
        },
        west: {
          seatIndex: 3,
          uid: 'demo_3',
          name: 'Tata',
          isAi: true,
          teamSide: 'B' as const,
          handCount: 7,
          hand: [] as DominoTile[],
          score: 0,
          isTurn: false,
          micOn: false,
          camOn: false,
        },
      };
    }

    const toCard = (s: typeof room.seats[number] | undefined): TableSeatView | null =>
      s
        ? {
            seatIndex: s.seatIndex,
            uid: s.uid,
            name: s.name,
            isAi: s.isAi,
            teamSide: s.teamSide,
            handCount: s.handCount,
            hand: s.hand,
            score: s.score,
            isTurn: room.status === 'playing' && room.currentTurnSeat === s.seatIndex,
            micOn: s.micOn,
            camOn: s.camOn,
          }
        : null;

    if (room.mode === 'ffa' && room.maxPlayers === 3) {
      const findMod3 = (offset: number) =>
        room.seats.find((s) => (s.seatIndex - mySeatIdx + 3) % 3 === offset);
      return {
        south: toCard(findMod3(0)),
        east: toCard(findMod3(1)),
        north: null,
        west: toCard(findMod3(2)),
      };
    }

    const findRel = (targetRel: number) =>
      room.seats.find((s) => (s.seatIndex - mySeatIdx + 4) % 4 === targetRel);

    return {
      south: toCard(findRel(0)),
      east: toCard(findRel(1)),
      north: toCard(findRel(2)),
      west: toCard(findRel(3)),
    };
  }, [room, myUid, mySeatIdx]);

  const reveal = Boolean(
    room && (room.status === 'round_over' || room.status === 'finished')
  );

  const localHandTiles = room ? mySeat?.hand || [] : DEMO_LOCAL_HAND;
  const showFfaScores = Boolean(room && room.mode === 'ffa');

  return (
    <div className="fixed inset-0 z-0 bg-[#120E0A] text-[#F5EFE6] flex flex-col items-center overflow-hidden select-none">
      <div className="w-full max-w-[1120px] h-full flex flex-col justify-between px-2.5 sm:px-6 py-2 sm:py-3.5 gap-2">
        {/* ROW 1: Top Scoreboard Strip (active during match) */}
        {topSlot && <div className="shrink-0 z-20">{topSlot}</div>}

        {/* ROW 2: HUGE DOMINICAN TRICOLOR TABLE */}
        <div className="relative flex-1 min-h-[240px] w-full rounded-2xl border-[3px] border-[#2C1810] bg-[#0B1424] shadow-[0_24px_60px_rgba(0,0,0,0.88)] overflow-hidden flex flex-col justify-between p-2.5 sm:p-4">
          {/* Dominican Flag Quadrants (Azul Ultramar & Rojo Bermellón) */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2">
            <div className="bg-gradient-to-br from-[#002D62] to-[#00193B]" />
            <div className="bg-gradient-to-bl from-[#CE1126] to-[#8C0B1A]" />
            <div className="bg-gradient-to-tr from-[#CE1126] to-[#8C0B1A]" />
            <div className="bg-gradient-to-tl from-[#002D62] to-[#00193B]" />
          </div>

          {/* Dominican White Cross */}
          <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-3.5 sm:w-4 bg-[#F8FAFC]/85 shadow-[0_0_14px_rgba(0,0,0,0.5)]" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-3.5 sm:h-4 bg-[#F8FAFC]/85 shadow-[0_0_14px_rgba(0,0,0,0.5)]" />

          {/* Soft Perimeter Vignette + Inner Bevel Line */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(6,10,18,0.58)_100%)]" />
          <div className="pointer-events-none absolute inset-1.5 rounded-xl border border-white/20" />

          {/* Corner Plaque: Darlin System */}
          <div className="pointer-events-none absolute bottom-2.5 right-3 sm:bottom-3.5 sm:right-4 z-20 flex items-center gap-2 rounded-lg bg-[#090D16]/90 border border-[#EAA938]/55 px-2.5 py-1 shadow-lg">
            <span className="flex flex-col w-1.5 h-3.5 rounded-[2px] overflow-hidden shrink-0">
              <span className="flex-1 bg-[#002D62]" />
              <span className="flex-1 bg-white" />
              <span className="flex-1 bg-[#CE1126]" />
            </span>
            <span className="text-[11px] sm:text-xs font-extrabold tracking-wide text-white whitespace-nowrap">
              Darlin System
            </span>
          </div>

          {/* TOP INSIDE TABLE: North Seat Avatar + Row of Black Tile Backs */}
          <div className="flex justify-center shrink-0 min-h-[54px] z-10">
            {seatsByRel.north && (
              <TablePlayerPod
                seat={seatsByRel.north}
                orientation="top"
                revealTiles={reveal}
                showScore={showFfaScores}
                stream={videoStreams[seatsByRel.north.uid]}
              />
            )}
          </div>

          {/* MIDDLE INSIDE TABLE: West Pod | Played Dominoes Canvas | East Pod */}
          <div className="flex-1 min-h-0 flex items-center justify-between gap-1 sm:gap-2 relative z-10">
            {/* West Pod */}
            <div className="shrink-0 flex items-center justify-center min-w-[56px] sm:min-w-[84px]">
              {seatsByRel.west && (
                <TablePlayerPod
                  seat={seatsByRel.west}
                  orientation="side"
                  revealTiles={reveal}
                  showScore={showFfaScores}
                  stream={videoStreams[seatsByRel.west.uid]}
                />
              )}
            </div>

            {/* Center Played Dominoes Surface */}
            <div className="flex-1 h-full min-w-0 flex items-center justify-center relative">
              {boardItems.length === 0 && room ? (
                <div className="text-center px-4 py-2 text-sm sm:text-base font-medium text-[#E8C5A5]/65">
                  {room.roundNumber === 1
                    ? 'Esperando la salida'
                    : 'Mesa limpia — coloca la primera ficha'}
                </div>
              ) : (
                <svg
                  viewBox={boardMetrics.viewBox}
                  className="w-full h-full p-1 sm:p-2"
                  preserveAspectRatio="xMidYMid meet"
                  aria-label="Tablero de Dominó Dominicano"
                >
                  <defs>
                    <linearGradient id="ivoryGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#FFFFFF" />
                      <stop offset="60%" stopColor="#F4F4F5" />
                      <stop offset="100%" stopColor="#E4E4E7" />
                    </linearGradient>
                  </defs>

                  {boardItems.map((placed) => {
                    const angleDeg = (-placed.rotY * 180) / Math.PI;
                    return (
                      <SvgDominoTile
                        key={placed.tile.id}
                        tile={placed.tile}
                        x={placed.x * 100}
                        y={placed.z * 100}
                        angleDeg={angleDeg}
                        isLatest={Boolean(room && placed.order === latestOrder)}
                      />
                    );
                  })}

                  {/* Open-End Click Targets when a tile fits both sides */}
                  {room && boardItems.length > 0 && isMyTurn && (
                    <>
                      <g
                        onClick={() => selectedTileId && onPlayEnd?.('left')}
                        className={selectedTileId ? 'cursor-pointer' : 'pointer-events-none'}
                        transform={`translate(${boardMetrics.leftEnd.x}, ${boardMetrics.leftEnd.y})`}
                      >
                        <circle
                          r={selectedTileId ? 24 : 16}
                          fill={
                            selectedTileId
                              ? 'rgba(234, 169, 56, 0.35)'
                              : 'rgba(18, 14, 10, 0.45)'
                          }
                          stroke={selectedTileId ? '#EAA938' : '#D4B48C'}
                          strokeWidth={selectedTileId ? 3 : 1.6}
                          strokeDasharray="5 4"
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#FAF6EC"
                          fontSize={selectedTileId ? 17 : 13}
                          fontWeight="bold"
                        >
                          {room.openLeft}
                        </text>
                      </g>

                      <g
                        onClick={() => selectedTileId && onPlayEnd?.('right')}
                        className={selectedTileId ? 'cursor-pointer' : 'pointer-events-none'}
                        transform={`translate(${boardMetrics.rightEnd.x}, ${boardMetrics.rightEnd.y})`}
                      >
                        <circle
                          r={selectedTileId ? 24 : 16}
                          fill={
                            selectedTileId
                              ? 'rgba(234, 169, 56, 0.35)'
                              : 'rgba(18, 14, 10, 0.45)'
                          }
                          stroke={selectedTileId ? '#EAA938' : '#D4B48C'}
                          strokeWidth={selectedTileId ? 3 : 1.6}
                          strokeDasharray="5 4"
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#FAF6EC"
                          fontSize={selectedTileId ? 17 : 13}
                          fontWeight="bold"
                        >
                          {room.openRight}
                        </text>
                      </g>
                    </>
                  )}
                </svg>
              )}
            </div>

            {/* East Pod */}
            <div className="shrink-0 flex items-center justify-center min-w-[56px] sm:min-w-[84px]">
              {seatsByRel.east && (
                <TablePlayerPod
                  seat={seatsByRel.east}
                  orientation="side"
                  revealTiles={reveal}
                  showScore={showFfaScores}
                  stream={videoStreams[seatsByRel.east.uid]}
                />
              )}
            </div>
          </div>

          {/* Bottom spacer inside wood table */}
          <div className="h-1 shrink-0" />
        </div>

        {/* ROW 3: Action Strip directly below the wooden table (Chat | Turn + Timer Bar | Voice/Video) */}
        {actionBarSlot && <div className="shrink-0 z-20">{actionBarSlot}</div>}

        {/* ROW 4: Bottom Player Hand Shelf with Avatar + White & Black Domino Tiles */}
        <div className="shrink-0 z-20 rounded-xl px-2.5 sm:px-4 py-2 flex items-center justify-center gap-2.5 sm:gap-4 bg-[#0D1320]/90 border border-white/10 shadow-xl">
          {seatsByRel.south && room && (() => {
            const southStream = videoStreams[seatsByRel.south.uid];
            const hasSouthVideo = Boolean(
              southStream &&
                southStream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live')
            );
            return (
              <div
                className={`${
                  hasSouthVideo ? 'flex' : 'hidden sm:flex'
                } items-center gap-2 shrink-0 bg-[#1B150E]/90 border ${
                  hasSouthVideo ? 'border-[#EAA938]/55 p-1.5' : 'border-white/10 px-2 py-1.5'
                } rounded-xl shadow-lg`}
              >
                <PlayerAvatar2D
                  seatIndex={seatsByRel.south.seatIndex}
                  name={seatsByRel.south.name}
                  teamSide={seatsByRel.south.teamSide}
                  camOn={seatsByRel.south.camOn}
                  stream={southStream}
                  isLocal
                  sizeClass={
                    hasSouthVideo
                      ? 'w-24 h-[72px] sm:w-32 sm:h-24'
                      : 'w-11 h-11 sm:w-12 sm:h-12'
                  }
                />
                <div className="leading-tight pr-1">
                  <div className="text-xs font-bold text-white max-w-[78px] truncate">
                    {seatsByRel.south.name}
                  </div>
                  <div className="text-[10px] text-[#EAA938] font-semibold">
                    {showFfaScores ? `${seatsByRel.south.score} pts` : 'Tú'}
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="flex items-center justify-start sm:justify-center gap-1.5 sm:gap-2 overflow-x-auto max-w-full py-1 px-1">
            {localHandTiles.map((tile) => (
              <DominoTile2D
                key={tile.id}
                tile={tile}
                playable={Boolean(room && isMyTurn && legalTileIds.has(tile.id))}
                selected={selectedTileId === tile.id}
                onClick={() => onSelectTile?.(tile.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
