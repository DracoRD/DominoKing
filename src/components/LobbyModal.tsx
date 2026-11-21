import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  Coins,
  Globe,
  Lock,
  RefreshCw,
  Users,
} from 'lucide-react';
import { I18nStrings } from '../lib/i18n';
import { AiDifficulty, GameMode } from '../shared/dominoEngine';
import { PublicRoomSummary } from '../types/app';

interface LobbyModalProps {
  open: boolean;
  onClose: () => void;
  labels: I18nStrings;
  playerName: string;
  coinBalance?: number;
  onCreateRoom: (opts: {
    mode: GameMode;
    maxPlayers?: 2 | 3 | 4;
    targetScore: 100 | 200;
    wagerCoins: number;
    customCode?: string;
    isPublic?: boolean;
    aiDifficulty?: AiDifficulty;
    turnSeconds?: number;
    autoStartWithAi: boolean;
  }) => void;
  onJoinRoom: (roomCode: string) => void;
}

const ModeTableIcon: React.FC<{ variant: '1v1' | '2v2' | 'ffa' }> = ({ variant }) => {
  const miniTable = (sizeClass: string) => (
    <div className={`relative ${sizeClass} rounded-md border border-white/25 shadow-inner overflow-hidden grid grid-cols-2 grid-rows-2`}>
      <div className="bg-[#002D62]" />
      <div className="bg-[#CE1126]" />
      <div className="bg-[#CE1126]" />
      <div className="bg-[#002D62]" />
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/90" />
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-white/90" />
    </div>
  );

  if (variant === '1v1') {
    return (
      <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
        {miniTable('w-6 h-8')}
        <span className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-[#CE1126] shadow" />
        <span className="absolute bottom-0.5 w-2.5 h-2.5 rounded-full bg-[#2563EB] shadow" />
      </div>
    );
  }
  if (variant === '2v2') {
    return (
      <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
        {miniTable('w-7 h-7')}
        <span className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-[#F5F1E6] shadow" />
        <span className="absolute bottom-0.5 w-2.5 h-2.5 rounded-full bg-[#2563EB] shadow" />
        <span className="absolute left-0.5 w-2.5 h-2.5 rounded-full bg-[#CE1126] shadow" />
        <span className="absolute right-0.5 w-2.5 h-2.5 rounded-full bg-[#CE1126] shadow" />
      </div>
    );
  }
  return (
    <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
      {miniTable('w-7 h-7')}
      <span className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-[#F59E0B] shadow" />
      <span className="absolute bottom-0.5 w-2.5 h-2.5 rounded-full bg-[#2563EB] shadow" />
      <span className="absolute left-0.5 w-2.5 h-2.5 rounded-full bg-[#CE1126] shadow" />
      <span className="absolute right-0.5 w-2.5 h-2.5 rounded-full bg-[#10B981] shadow" />
    </div>
  );
};

const WAGER_PRESETS = [0, 50, 100, 250, 500, 1000];

export const LobbyModal: React.FC<LobbyModalProps> = ({
  open,
  onClose,
  labels,
  playerName,
  coinBalance,
  onCreateRoom,
  onJoinRoom,
}) => {
  const [activeView, setActiveView] = useState<'create' | 'browse'>('create');
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // Create Public Table form (matches Screenshot 1)
  const [mode, setMode] = useState<'1v1' | '2v2' | 'ffa'>('2v2');
  const [ffaPlayers, setFfaPlayers] = useState<3 | 4>(4);
  const [codeType, setCodeType] = useState<'auto' | 'custom'>('auto');
  const [customCode, setCustomCode] = useState('');
  const [wagerCoins, setWagerCoins] = useState<number>(0);
  const [rulesOpen, setRulesOpen] = useState(true);
  const [targetScore, setTargetScore] = useState<100 | 200>(200);
  const [turnSeconds, setTurnSeconds] = useState<15 | 30 | 45>(30);
  const [isPublic, setIsPublic] = useState(true);

  const [joinCode, setJoinCode] = useState('');

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rooms');
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchRooms();
  }, [open]);

  if (!open) return null;

  const handleCreate = () => {
    onCreateRoom({
      mode,
      maxPlayers: mode === '1v1' ? 2 : mode === 'ffa' ? ffaPlayers : 4,
      targetScore,
      wagerCoins,
      customCode: codeType === 'custom' && customCode.trim().length >= 3 ? customCode.trim() : undefined,
      isPublic,
      turnSeconds,
      aiDifficulty: 'normal',
      autoStartWithAi: false,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#120E0A] text-[#F5EFE6] overflow-y-auto">
      <div className="min-h-full w-full max-w-xl mx-auto px-4 sm:px-6 py-5 sm:py-7 flex flex-col">
        {/* Top Bar matching Screenshot 1 */}
        <div className="relative flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Volver"
            className="p-2 -ml-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-white">
            {activeView === 'create' ? 'Nueva mesa' : labels.activeRooms}
          </h2>

          <button
            type="button"
            onClick={() => {
              const next = activeView === 'create' ? 'browse' : 'create';
              setActiveView(next);
              if (next === 'browse') fetchRooms();
            }}
            className="px-3 py-1.5 rounded-lg bg-[#1E1812] hover:bg-[#2A221A] border border-white/12 text-xs font-semibold text-amber-300 transition-colors"
          >
            {activeView === 'create' ? 'Unirse / Mesas' : 'Crear mesa'}
          </button>
        </div>

        {activeView === 'create' ? (
          <div className="space-y-5 pb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                ¿Cómo van a jugar, {playerName || 'Jugador'}?
              </h1>
            </div>

            {/* 3 Mode Cards matching Screenshot 1 */}
            <div className="space-y-3">
              {/* 1 vs 1 */}
              <button
                type="button"
                onClick={() => setMode('1v1')}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl text-left border transition-all ${
                  mode === '1v1'
                    ? 'bg-[#1D1710] border-[#EAA938] ring-1 ring-[#EAA938]/50'
                    : 'bg-[#17120D] border-white/10 hover:border-white/25'
                }`}
              >
                <ModeTableIcon variant="1v1" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-extrabold text-white">1 vs 1</span>
                    <span className="text-[11px] font-extrabold tracking-wider text-[#EAA938] uppercase">
                      MANO A MANO
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1 leading-snug">
                    Tú contra otro, frente a frente. Siete fichas cada uno y catorce en el pozo.
                  </p>
                </div>
              </button>

              {/* En parejas 2 vs 2 */}
              <button
                type="button"
                onClick={() => setMode('2v2')}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl text-left border transition-all ${
                  mode === '2v2'
                    ? 'bg-[#1D1710] border-[#EAA938] ring-1 ring-[#EAA938]/50'
                    : 'bg-[#17120D] border-white/10 hover:border-white/25'
                }`}
              >
                <ModeTableIcon variant="2v2" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-extrabold text-white">En parejas</span>
                    <span className="text-[11px] font-extrabold tracking-wider text-[#EAA938] uppercase">
                      2 VS 2
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1 leading-snug">
                    Tú y tu compañero contra la otra pareja. Si faltan jugadores, completan bots.
                  </p>
                </div>
              </button>

              {/* Todos contra todos */}
              <div
                className={`w-full rounded-2xl border transition-all ${
                  mode === 'ffa'
                    ? 'bg-[#1D1710] border-[#EAA938] ring-1 ring-[#EAA938]/50'
                    : 'bg-[#17120D] border-white/10 hover:border-white/25'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setMode('ffa')}
                  className="w-full flex items-center gap-4 p-4 text-left"
                >
                  <ModeTableIcon variant="ffa" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-extrabold text-white">
                        Todos contra todos
                      </span>
                      <span className="text-[11px] font-extrabold tracking-wider text-[#EAA938] uppercase">
                        3 Ó 4
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-400 mt-1 leading-snug">
                      Cada quien juega por su cuenta y suma sus propios tantos.
                    </p>
                  </div>
                </button>

                {mode === 'ffa' && (
                  <div className="px-4 pb-3.5 pt-1 flex items-center gap-2 border-t border-white/10">
                    <span className="text-xs text-zinc-400">Jugadores en mesa:</span>
                    {([3, 4] as const).map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setFfaPlayers(cnt)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                          ffaPlayers === cnt
                            ? 'bg-[#F5F1E6] text-[#140E08]'
                            : 'bg-[#120E0A] text-zinc-300 border border-white/10'
                        }`}
                      >
                        {cnt} jugadores
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Código de la mesa matching Screenshot 1 */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-white">
                Código de la mesa
              </label>
              <div className="grid grid-cols-2 p-1 rounded-xl bg-[#17120D] border border-white/12">
                <button
                  type="button"
                  onClick={() => setCodeType('auto')}
                  className={`py-2.5 rounded-lg text-sm font-bold transition-colors ${
                    codeType === 'auto'
                      ? 'bg-[#F5F1E6] text-[#140E08] shadow'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  Uno nuevo
                </button>
                <button
                  type="button"
                  onClick={() => setCodeType('custom')}
                  className={`py-2.5 rounded-lg text-sm font-bold transition-colors ${
                    codeType === 'custom'
                      ? 'bg-[#F5F1E6] text-[#140E08] shadow'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  Escoger código
                </button>
              </div>
              {codeType === 'auto' ? (
                <p className="text-xs text-zinc-400">
                  Se crea un código nuevo para invitar.
                </p>
              ) : (
                <div className="pt-1">
                  <input
                    type="text"
                    maxLength={6}
                    value={customCode}
                    onChange={(e) =>
                      setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                    }
                    placeholder="Ej. RD2026 (3 a 6 caracteres)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#17120D] border border-[#EAA938]/50 text-sm font-mono font-bold tracking-widest text-amber-100 uppercase focus:outline-none focus:border-[#EAA938]"
                  />
                </div>
              )}
            </div>

            {/* Cantidad de Monedas a Jugar */}
            <div className="space-y-2.5 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-sm font-bold text-white">
                  <Coins className="w-4 h-4 text-[#EAA938]" />
                  <span>Monedas a jugar (Apuesta)</span>
                </label>
                {typeof coinBalance === 'number' && (
                  <span className="text-xs font-mono text-amber-300">
                    Saldo: {coinBalance.toLocaleString()}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {WAGER_PRESETS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setWagerCoins(amt)}
                    className={`py-2 px-2 rounded-xl text-xs font-mono font-bold border transition-colors ${
                      wagerCoins === amt
                        ? 'bg-[#EAA938] text-[#140E08] border-[#F5C563]'
                        : 'bg-[#17120D] text-zinc-300 border-white/10 hover:border-white/25'
                    }`}
                  >
                    {amt === 0 ? 'Gratis' : amt.toLocaleString()}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Personalizada:</span>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step={50}
                  value={wagerCoins}
                  onChange={(e) => setWagerCoins(Math.max(0, Math.min(10000, Number(e.target.value) || 0)))}
                  className="w-32 px-3 py-1.5 rounded-lg bg-[#17120D] border border-white/15 text-xs font-mono font-bold text-amber-200 focus:outline-none focus:border-[#EAA938]"
                />
                <span className="text-xs text-zinc-400">monedas</span>
              </div>
            </div>

            {/* Personalizar reglas matching Screenshot 1 */}
            <div className="pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setRulesOpen((o) => !o)}
                className="w-full flex items-center justify-between py-1 text-left"
              >
                <span className="text-sm font-bold text-white">Personalizar reglas</span>
                <ChevronDown
                  className={`w-4 h-4 text-zinc-400 transition-transform ${
                    rulesOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {rulesOpen && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-[#17120D] border border-white/10 p-3.5">
                  <div>
                    <span className="block text-[11px] text-zinc-400 mb-1.5">Meta de tantos</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {([100, 200] as const).map((pts) => (
                        <button
                          key={pts}
                          type="button"
                          onClick={() => setTargetScore(pts)}
                          className={`py-1.5 rounded-lg text-xs font-mono font-bold border ${
                            targetScore === pts
                              ? 'bg-[#F5F1E6] text-[#140E08] border-[#F5F1E6]'
                              : 'bg-[#120E0A] text-zinc-300 border-white/10'
                          }`}
                        >
                          A {pts}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block text-[11px] text-zinc-400 mb-1.5">Tiempo por jugada</span>
                    <div className="grid grid-cols-3 gap-1">
                      {([15, 30, 45] as const).map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setTurnSeconds(sec)}
                          className={`py-1.5 rounded-lg text-xs font-mono font-bold border ${
                            turnSeconds === sec
                              ? 'bg-[#F5F1E6] text-[#140E08] border-[#F5F1E6]'
                              : 'bg-[#120E0A] text-zinc-300 border-white/10'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block text-[11px] text-zinc-400 mb-1.5">Visibilidad</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsPublic(true)}
                        className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold border ${
                          isPublic
                            ? 'bg-emerald-600 text-white border-emerald-400'
                            : 'bg-[#120E0A] text-zinc-300 border-white/10'
                        }`}
                      >
                        <Globe className="w-3 h-3" />
                        <span>Pública</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPublic(false)}
                        className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold border ${
                          !isPublic
                            ? 'bg-amber-600 text-white border-amber-400'
                            : 'bg-[#120E0A] text-zinc-300 border-white/10'
                        }`}
                      >
                        <Lock className="w-3 h-3" />
                        <span>Privada</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Primary CTA */}
            <button
              type="button"
              onClick={handleCreate}
              className="w-full py-3.5 rounded-xl bg-[#EAA938] hover:bg-[#F3B84E] text-[#140E08] font-extrabold text-base shadow-lg transition-colors min-h-[50px]"
            >
              Crear mesa {wagerCoins > 0 ? `(${wagerCoins} monedas)` : ''}
            </button>
          </div>
        ) : (
          /* Join by Code & Public Rooms Browser */
          <div className="space-y-5 pb-6">
            <div className="rounded-2xl bg-[#17120D] border border-white/10 p-4 space-y-2.5">
              <h3 className="text-sm font-bold text-amber-200">{labels.joinByCode}</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Código (ej. EPF3T)"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#120E0A] border border-white/15 text-sm font-mono font-bold tracking-widest text-white uppercase focus:outline-none focus:border-[#EAA938]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (joinCode.trim()) {
                      onJoinRoom(joinCode.trim());
                      onClose();
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#EAA938] hover:bg-[#F3B84E] text-[#140E08] font-extrabold text-sm"
                >
                  {labels.join}
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-[#17120D] border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-amber-200">{labels.activeRooms}</h3>
                <button
                  type="button"
                  onClick={fetchRooms}
                  aria-label="Actualizar"
                  className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {rooms.length === 0 ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-xs text-zinc-400 leading-relaxed">{labels.noRooms}</p>
                  <button
                    type="button"
                    onClick={() => setActiveView('create')}
                    className="px-4 py-2 rounded-xl bg-[#EAA938] text-[#140E08] font-bold text-xs"
                  >
                    Crear primera mesa pública
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {rooms.map((r) => (
                    <div
                      key={r.roomCode}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#120E0A] border border-white/10"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-bold text-white">
                          <span className="font-mono text-[#EAA938]">{r.roomCode}</span>
                          <span className="text-zinc-600">·</span>
                          <span className="uppercase text-xs">
                            {r.mode === '2v2'
                              ? 'En parejas'
                              : r.mode === '1v1'
                              ? '1 vs 1'
                              : r.mode === 'ffa'
                              ? 'Todos vs todos'
                              : 'Torneo'}
                          </span>
                          <span className="text-zinc-600">·</span>
                          <span className="font-mono text-xs text-zinc-300">
                            A {r.targetScore}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
                          <Users className="w-3.5 h-3.5" />
                          <span>
                            {r.playersCount}/{r.maxSeats} · {r.hostName}
                          </span>
                          {r.wagerCoins > 0 && (
                            <span className="text-[#EAA938] font-mono font-bold">
                              · {r.wagerCoins} monedas
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onJoinRoom(r.roomCode);
                          onClose();
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shrink-0"
                      >
                        Entrar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
