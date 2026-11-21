import React, { useState } from 'react';
import {
  Bot,
  ChevronDown,
  Coins,
  Crown,
  Eye,
  EyeOff,
  Headphones,
  LogOut,
  Mic,
  MicOff,
  Share2,
  X,
} from 'lucide-react';
import { AiDifficulty, DominoRoomState, SeatState } from '../shared/dominoEngine';

interface WaitingRoomOverlayProps {
  room: DominoRoomState;
  myUid: string;
  isInCall?: boolean;
  onToggleQuickCall?: () => void;
  onLeaveRoom: () => void;
  onStartMatch: () => void;
  onAddBot: (seatIndex: number) => void;
  onRemoveBot: (seatIndex: number) => void;
  onSitSeat: (seatIndex: number) => void;
  onUpdateRules: (patch: {
    aiDifficulty?: AiDifficulty;
    isPublic?: boolean;
    targetScore?: 100 | 200;
    turnSeconds?: number;
  }) => void;
}

export const WaitingRoomOverlay: React.FC<WaitingRoomOverlayProps> = ({
  room,
  myUid,
  isInCall = false,
  onToggleQuickCall,
  onLeaveRoom,
  onStartMatch,
  onAddBot,
  onRemoveBot,
  onSitSeat,
  onUpdateRules,
}) => {
  const [copied, setCopied] = useState(false);
  const [rulesExpanded, setRulesExpanded] = useState(false);

  const isHost = room.hostUid === myUid;
  const mySeat = room.seats.find((s) => s.uid === myUid);
  const mySeatIdx = mySeat ? mySeat.seatIndex : 0;

  const activeIndices =
    room.mode === '1v1'
      ? [0, 2]
      : room.mode === 'ffa' && room.maxPlayers === 3
      ? [0, 1, 2]
      : [0, 1, 2, 3];

  const getRelSeatIndex = (relOffset: number) => (mySeatIdx + relOffset) % 4;
  const seatAt = (seatIndex: number): SeatState | undefined =>
    room.seats.find((s) => s.seatIndex === seatIndex);

  const occupiedCount = room.seats.filter((s) => activeIndices.includes(s.seatIndex)).length;
  const missingCount = Math.max(0, activeIndices.length - occupiedCount);

  const modeTitle =
    room.mode === '2v2'
      ? 'En parejas'
      : room.mode === '1v1'
      ? '1 vs 1'
      : room.mode === 'ffa'
      ? 'Todos contra todos'
      : 'Torneo';

  const statusText =
    missingCount === 0
      ? '¡Mesa completa! Todo listo para repartir.'
      : room.mode === '2v2'
      ? `En parejas hacen falta los 4: ${missingCount === 1 ? 'falta 1' : `faltan ${missingCount}`}.`
      : room.mode === '1v1'
      ? 'Mano a mano: falta 1 jugador.'
      : `Faltan ${missingCount} por sentarse.`;

  const handleInvite = async () => {
    const shareText = `¡Únete a mi mesa de Quisqueya Dominó! Código: ${room.roomCode}`;
    const shareUrl = `${window.location.origin}/?mesa=${room.roomCode}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Quisqueya Dominó', text: shareText, url: shareUrl });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${room.roomCode}`);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      try {
        await navigator.clipboard?.writeText(room.roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2400);
      } catch {
        // Ignore clipboard fallback error
      }
    }
  };

  const renderSeatCard = (
    seatIndex: number,
    roleLabel: string,
    isSelf = false
  ) => {
    const s = seatAt(seatIndex);

    return (
      <div
        className={`w-full max-w-[200px] rounded-xl px-3 py-2.5 text-center transition-colors ${
          s
            ? 'bg-[#17130E] border border-white/15 shadow-lg'
            : 'bg-[#14100C]/80 border border-dashed border-white/18'
        }`}
      >
        <div className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mb-1">
          {roleLabel}
        </div>

        {s ? (
          <div className="flex items-center justify-center gap-1.5 min-h-[28px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-sm font-bold text-white truncate max-w-[110px]">
              {s.name}
            </span>
            {s.uid === room.hostUid && (
              <Crown className="w-3.5 h-3.5 text-[#EAA938] shrink-0" />
            )}
            {s.isAi ? (
              <>
                <Bot className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                {isHost && (
                  <button
                    type="button"
                    onClick={() => onRemoveBot(s.seatIndex)}
                    aria-label="Quitar bot"
                    className="ml-0.5 p-0.5 rounded hover:bg-white/10 text-zinc-400 hover:text-rose-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </>
            ) : (
              <Headphones
                className={`w-3.5 h-3.5 shrink-0 ${
                  s.micOn ? 'text-emerald-400' : 'text-zinc-500'
                }`}
              />
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="text-xs text-zinc-400 font-medium">Libre</div>
            {!isSelf && (
              <div className="flex items-center justify-center gap-1.5">
                {isHost && (
                  <button
                    type="button"
                    onClick={() => onAddBot(seatIndex)}
                    className="px-2.5 py-1 rounded-full bg-[#1C1711] hover:bg-[#2A2218] border border-[#EAA938]/55 text-[11px] font-bold text-[#EAA938] transition-colors"
                  >
                    + Bot
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSitSeat(seatIndex)}
                  className="px-2.5 py-1 rounded-full bg-[#241E17] hover:bg-[#322920] border border-white/15 text-[11px] font-semibold text-zinc-200 transition-colors"
                >
                  Sentarme
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Seat layout offsets depending on mode
  const topSeatIdx =
    room.mode === 'ffa' && room.maxPlayers === 3 ? -1 : getRelSeatIndex(2);
  const leftSeatIdx =
    room.mode === '1v1'
      ? -1
      : room.mode === 'ffa' && room.maxPlayers === 3
      ? (mySeatIdx + 2) % 3
      : getRelSeatIndex(3);
  const rightSeatIdx =
    room.mode === '1v1'
      ? -1
      : room.mode === 'ffa' && room.maxPlayers === 3
      ? (mySeatIdx + 1) % 3
      : getRelSeatIndex(1);

  return (
    <div className="fixed inset-0 z-30 bg-[#120E0A] text-[#F5EFE6] overflow-y-auto pointer-events-auto">
      <div className="min-h-full w-full max-w-lg mx-auto px-4 sm:px-6 py-5 flex flex-col justify-between">
        {/* Top Bar matching Screenshot 2 */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onLeaveRoom}
            aria-label="Salir de la mesa"
            className="p-2 -ml-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <LogOut className="w-5 h-5 rotate-180" />
          </button>

          <div className="text-center">
            <h2 className="text-base sm:text-lg font-extrabold text-white">{modeTitle}</h2>
            {room.wagerCoins > 0 && (
              <div className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-[#EAA938]">
                <Coins className="w-3 h-3" />
                <span>{room.wagerCoins.toLocaleString()} monedas</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleQuickCall}
            aria-label={isInCall ? 'Silenciar voz/video' : 'Activar voz/video'}
            className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
              isInCall
                ? 'bg-emerald-700/35 border-emerald-400/50 text-emerald-300'
                : 'bg-[#1D1813] border-white/10 text-zinc-400 hover:text-white'
            }`}
          >
            {isInCall ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
        </div>

        {/* Code Keycaps + Invite Row matching Screenshot 2 */}
        <div className="mt-5 space-y-3 text-center">
          <div className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">
            CÓDIGO DE LA MESA
          </div>

          <div className="flex items-center justify-center gap-2 sm:gap-2.5">
            {room.roomCode.split('').map((ch, idx) => (
              <div
                key={`${ch}-${idx}`}
                className="w-11 h-12 sm:w-12 sm:h-14 rounded-xl bg-[#F5F1E6] text-[#140E08] font-black text-2xl flex items-center justify-center shadow-[0_4px_0_#BEB6A2] select-all"
              >
                {ch}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1 max-w-md mx-auto">
            <button
              type="button"
              onClick={handleInvite}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#EAA938] hover:bg-[#F3B84E] text-[#140E08] font-extrabold text-sm shadow transition-colors min-h-[44px]"
            >
              <Share2 className="w-4 h-4" />
              <span>{copied ? '¡Código copiado!' : 'Invitar'}</span>
            </button>

            <button
              type="button"
              disabled={!isHost}
              onClick={() => onUpdateRules({ isPublic: !room.isPublic })}
              title={room.isPublic ? 'Mesa pública (visible)' : 'Mesa privada'}
              aria-label={room.isPublic ? 'Mesa pública' : 'Mesa privada'}
              className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-colors shrink-0 ${
                room.isPublic
                  ? 'bg-[#1B1611] border-white/12 text-zinc-200 hover:border-white/25'
                  : 'bg-amber-950/50 border-amber-500/40 text-amber-300'
              }`}
            >
              {room.isPublic ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Cross-Shaped Interactive Seating Table matching Screenshot 2 */}
        <div className="my-6 flex flex-col items-center gap-3">
          {/* Top Seat */}
          {topSeatIdx !== -1 && (
            <div className="flex justify-center w-full">
              {renderSeatCard(
                topSeatIdx,
                room.mode === '2v2' ? 'COMPAÑERO' : 'RIVAL'
              )}
            </div>
          )}

          {/* Middle Row: Left Seat | Miniature Wooden Table | Right Seat */}
          <div className="flex items-center justify-center gap-2.5 sm:gap-4 w-full">
            {leftSeatIdx !== -1 ? (
              <div className="flex-1 flex justify-end">
                {renderSeatCard(leftSeatIdx, 'RIVAL')}
              </div>
            ) : (
              <div className="flex-1" />
            )}

            {/* Center Dominican Flag Mini Table */}
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl border-2 border-white/25 shadow-lg shrink-0 overflow-hidden grid grid-cols-2 grid-rows-2">
              <div className="bg-[#002D62]" />
              <div className="bg-[#CE1126]" />
              <div className="bg-[#CE1126]" />
              <div className="bg-[#002D62]" />
              <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-1.5 bg-white/90" />
              <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-white/90" />
            </div>

            {rightSeatIdx !== -1 ? (
              <div className="flex-1 flex justify-start">
                {renderSeatCard(rightSeatIdx, 'RIVAL')}
              </div>
            ) : (
              <div className="flex-1" />
            )}
          </div>

          {/* Bottom Seat (TÚ) */}
          <div className="flex justify-center w-full">
            {renderSeatCard(mySeatIdx, 'TÚ', true)}
          </div>
        </div>

        {/* Footer Controls: Status + Start CTA + AI Difficulty + Reglas */}
        <div className="space-y-3 pb-2 max-w-md mx-auto w-full">
          <p className="text-center text-xs sm:text-sm text-zinc-400">
            {statusText}
          </p>

          {isHost ? (
            <button
              type="button"
              onClick={onStartMatch}
              className="w-full py-3.5 px-5 rounded-xl bg-[#EAA938] hover:bg-[#F3B84E] text-[#140E08] font-extrabold text-base shadow-lg transition-colors min-h-[48px]"
            >
              {missingCount > 0
                ? `Jugar con ${missingCount} ${missingCount === 1 ? 'bot' : 'bots'}`
                : 'Iniciar partida'}
            </button>
          ) : (
            <div className="w-full py-3 px-4 rounded-xl bg-[#1A1510] border border-white/10 text-center text-xs font-semibold text-amber-200">
              Esperando a que el anfitrión inicie la partida...
            </div>
          )}

          {/* AI Difficulty Selector (Fácil | Normal | Difícil) */}
          <div className="grid grid-cols-3 p-1 rounded-xl bg-[#17120D] border border-white/12">
            {(['easy', 'normal', 'hard'] as const).map((lvl) => {
              const label =
                lvl === 'easy' ? 'Fácil' : lvl === 'normal' ? 'Normal' : 'Difícil';
              const active = room.aiDifficulty === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  disabled={!isHost}
                  onClick={() => onUpdateRules({ aiDifficulty: lvl })}
                  className={`py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors ${
                    active
                      ? 'bg-[#F5F1E6] text-[#140E08] shadow'
                      : 'text-zinc-300 hover:text-white disabled:opacity-60'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Expandable Reglas de la mesa */}
          <div className="pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setRulesExpanded((v) => !v)}
              className="w-full flex items-center justify-between text-left py-1"
            >
              <div>
                <div className="text-sm font-bold text-white">Reglas de la mesa</div>
                <div className="text-xs text-zinc-400">
                  A {room.targetScore} · {room.turnSeconds || 30} s por jugada ·{' '}
                  {room.isPublic ? 'Pública' : 'Privada'}
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-zinc-400 transition-transform ${
                  rulesExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>

            {rulesExpanded && (
              <div className="mt-2.5 grid grid-cols-2 gap-2.5 rounded-xl bg-[#17120D] border border-white/10 p-3 text-xs">
                <div>
                  <span className="block text-[11px] text-zinc-400 mb-1">Meta de tantos</span>
                  <div className="flex gap-1.5">
                    {([100, 200] as const).map((pts) => (
                      <button
                        key={pts}
                        type="button"
                        disabled={!isHost}
                        onClick={() => onUpdateRules({ targetScore: pts })}
                        className={`flex-1 py-1.5 rounded-lg font-mono font-bold ${
                          room.targetScore === pts
                            ? 'bg-[#EAA938] text-[#140E08]'
                            : 'bg-[#120E0A] text-zinc-300'
                        }`}
                      >
                        A {pts}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="block text-[11px] text-zinc-400 mb-1">Turno</span>
                  <div className="flex gap-1">
                    {([15, 30, 45] as const).map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        disabled={!isHost}
                        onClick={() => onUpdateRules({ turnSeconds: sec })}
                        className={`flex-1 py-1.5 rounded-lg font-mono font-bold ${
                          room.turnSeconds === sec
                            ? 'bg-[#EAA938] text-[#140E08]'
                            : 'bg-[#120E0A] text-zinc-300'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
