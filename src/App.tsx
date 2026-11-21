import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  Bell,
  BookOpen,
  Coins,
  LogIn,
  LogOut,
  MessageSquare,
  Send,
  Shield,
  SlidersHorizontal,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AdminDashboardModal } from './components/AdminDashboardModal';
import { AuthModal } from './components/AuthModal';
import { DominoTable2D } from './components/DominoTable2D';
import { LobbyModal } from './components/LobbyModal';
import { StatsAndShareModal } from './components/StatsAndShareModal';
import { TournamentsModal } from './components/TournamentsModal';
import { VideoCallBar } from './components/VideoCallBar';
import { WaitingRoomOverlay } from './components/WaitingRoomOverlay';
import { WalletModal } from './components/WalletModal';
import { tDict } from './lib/i18n';
import { soundFx } from './lib/sound';
import { AiDifficulty, DominoRoomState, GameMode, getLegalMoves } from './shared/dominoEngine';
import {
  ChatMessage,
  Locale,
  NotificationItem,
  TournamentItem,
  UserProfile,
} from './types/app';

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem('qd_locale');
    return saved === 'en' || saved === 'fr' ? saved : 'es';
  });
  const labels = useMemo(() => tDict(locale), [locale]);

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('qd_token'));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [guestName, setGuestName] = useState<string>(() => localStorage.getItem('qd_guest_name') || '');

  const [ws, setWs] = useState<WebSocket | null>(null);
  const [myUid, setMyUid] = useState<string>('');
  const [room, setRoom] = useState<DominoRoomState | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoStreams, setVideoStreams] = useState<Record<string, MediaStream>>({});
  const [callStatus, setCallStatus] = useState({ inCall: false, micOn: false, camOn: false });
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Modals & Drawers
  const [authOpen, setAuthOpen] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const [tournamentsOpen, setTournamentsOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [shareBannerText, setShareBannerText] = useState<string | null>(null);

  // Live Chat & Push Notifications
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toastAlert, setToastAlert] = useState<NotificationItem | null>(null);

  const rtcSignalRef = useRef<((msg: Record<string, unknown>) => void) | null>(null);
  const toggleCallActionRef = useRef<(() => void) | null>(null);
  const lastEventTsRef = useRef<number>(0);
  const pendingInviteCodeRef = useRef<string | null>(null);
  const [actionRightSlotEl, setActionRightSlotEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mesa = params.get('mesa')?.trim().toUpperCase();
    if (mesa) {
      pendingInviteCodeRef.current = mesa;
      params.delete('mesa');
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, []);

  const refreshProfile = useCallback(async (activeToken?: string | null) => {
    const t = activeToken ?? token;
    if (!t) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else if (res.status === 401) {
        localStorage.removeItem('qd_token');
        setToken(null);
        setUser(null);
      }
    } catch {
      // Ignore network hiccup
    }
  }, [token]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    fetch('/api/notifications', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : { notifications: [] }))
      .then((d) => setNotifications(d.notifications || []))
      .catch(() => {});
  }, [token]);

  // Smooth countdown timer tick for active turn progress bar
  useEffect(() => {
    if (!room || room.status !== 'playing') return;
    const id = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(id);
  }, [room]);

  // Persistent WebSocket connection with automatic reconnect
  useEffect(() => {
    let closed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${proto}//${window.location.host}/ws`);
      setWs(socket);

      socket.onopen = () => {
        socket?.send(
          JSON.stringify({
            type: 'auth:identify',
            token: localStorage.getItem('qd_token'),
            displayName: localStorage.getItem('qd_guest_name') || undefined,
          })
        );
      };

      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'ws:welcome') {
            setMyUid(`guest_${String(msg.clientId).slice(0, 8)}`);
          } else if (msg.type === 'auth:identified') {
            setMyUid(msg.uid);
            const inviteCode = pendingInviteCodeRef.current;
            if (inviteCode && socket && socket.readyState === WebSocket.OPEN) {
              pendingInviteCodeRef.current = null;
              socket.send(JSON.stringify({ type: 'room:join', roomCode: inviteCode }));
            }
          } else if (msg.type === 'room:state') {
            setRoom(msg.room);
            setSelectedTileId(null);
          } else if (msg.type === 'error') {
            setToastAlert({
              title: 'Aviso de Mesa',
              body: String(msg.message || 'Acción no disponible'),
              category: 'system',
            });
            setTimeout(() => setToastAlert(null), 3600);
          } else if (msg.type === 'chat:message') {
            setChatMessages((prev) => [...prev.slice(-40), msg as ChatMessage]);
          } else if (msg.type === 'push:notification') {
            const note = msg.notification as NotificationItem;
            setNotifications((prev) => [note, ...prev.slice(0, 24)]);
            setToastAlert(note);
            setTimeout(() => setToastAlert(null), 4800);
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(note.title, { body: note.body, icon: '/icon.svg' });
            }
          } else if (String(msg.type).startsWith('rtc:')) {
            rtcSignalRef.current?.(msg);
          }
        } catch {
          // Ignore malformed message
        }
      };

      socket.onclose = () => {
        if (!closed) {
          retryTimer = setTimeout(connect, 1800);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  // Re-identify WebSocket when auth token or guest nickname changes
  useEffect(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'auth:identify',
          token,
          displayName: !token && guestName.trim() ? guestName.trim() : undefined,
        })
      );
    }
  }, [token, guestName, ws]);

  // Trigger procedural Web Audio feedback on server room events
  useEffect(() => {
    if (!room?.lastEvent) return;
    if (room.lastEvent.timestamp === lastEventTsRef.current) return;
    lastEventTsRef.current = room.lastEvent.timestamp;

    if (room.lastEvent.type === 'play') {
      if (room.lastEvent.isPasoCorrido) {
        soundFx.playCapicuaFanfare();
        setToastAlert({
          title: '¡PASO CORRIDO! (+30 pts)',
          body: room.lastEvent.message,
          category: 'match',
        });
        setTimeout(() => setToastAlert(null), 4000);
      } else {
        const isDoubleSix = room.lastEvent.tileId === '6-6';
        soundFx.playDominoSlam(isDoubleSix);
      }
    } else if (room.lastEvent.type === 'pass') {
      soundFx.playTableKnock();
    } else if (room.lastEvent.type === 'round_end' || room.lastEvent.type === 'match_end') {
      if (room.lastEvent.isCapicua || room.lastEvent.isZapato || room.lastEvent.isPasoCorrido) {
        soundFx.playCapicuaFanfare();
      } else {
        soundFx.playDominoSlam(true);
      }
      refreshProfile();
    }
  }, [room?.lastEvent, refreshProfile]);

  const handleChangeLocale = (next: Locale) => {
    setLocale(next);
    localStorage.setItem('qd_locale', next);
    if (token) {
      fetch('/api/auth/locale', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ locale: next }),
      }).catch(() => {});
    }
  };

  const handleAuthenticated = (newToken: string, newUser: UserProfile) => {
    localStorage.setItem('qd_token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const handleSignOut = () => {
    localStorage.removeItem('qd_token');
    setToken(null);
    setUser(null);
  };

  const handleCreateRoom = useCallback(
    (opts: {
      mode: GameMode;
      maxPlayers?: 2 | 3 | 4;
      targetScore: 100 | 200;
      wagerCoins: number;
      customCode?: string;
      isPublic?: boolean;
      aiDifficulty?: AiDifficulty;
      turnSeconds?: number;
      autoStartWithAi: boolean;
      tournamentId?: number;
    }) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      setChatMessages([]);
      setTableMenuOpen(false);
      ws.send(JSON.stringify({ type: 'room:create', ...opts }));
    },
    [ws]
  );

  const handleJoinRoom = useCallback(
    (roomCode: string) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      setChatMessages([]);
      setTableMenuOpen(false);
      ws.send(JSON.stringify({ type: 'room:join', roomCode }));
    },
    [ws]
  );

  const handleLeaveRoom = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'room:leave' }));
    }
    setRoom(null);
    setSelectedTileId(null);
    setTableMenuOpen(false);
    setChatOpen(false);
  };

  const mySeat = useMemo(
    () => room?.seats.find((s) => s.uid === myUid) || null,
    [room, myUid]
  );

  const isMyTurn = Boolean(
    room && room.status === 'playing' && mySeat && room.currentTurnSeat === mySeat.seatIndex
  );

  const mustPlayDoubleSix = Boolean(
    room &&
      mySeat &&
      room.roundNumber === 1 &&
      room.board.length === 0 &&
      mySeat.hand.some((t) => t.a === 6 && t.b === 6)
  );

  const legalMoves = useMemo(() => {
    if (!room || !mySeat || !isMyTurn) return [];
    return getLegalMoves(mySeat.hand, room.openLeft, room.openRight, mustPlayDoubleSix);
  }, [room, mySeat, isMyTurn, mustPlayDoubleSix]);

  const legalTileIds = useMemo(
    () => new Set(legalMoves.map((m) => m.tile.id)),
    [legalMoves]
  );

  const playTileOnSide = useCallback(
    (tileId: string, side: 'left' | 'right') => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'game:play-tile', tileId, side }));
      setSelectedTileId(null);
    },
    [ws]
  );

  const handleRackTileClick = (tileId: string) => {
    if (!isMyTurn) return;
    const movesForTile = legalMoves.filter((m) => m.tile.id === tileId);
    if (movesForTile.length === 0) return;

    if (room?.board.length === 0 || movesForTile.length === 1) {
      playTileOnSide(tileId, movesForTile[0].side);
    } else {
      setSelectedTileId((prev) => (prev === tileId ? null : tileId));
    }
  };

  const handlePassOrDraw = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !isMyTurn) return;
    ws.send(JSON.stringify({ type: 'game:pass' }));
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ws || ws.readyState !== WebSocket.OPEN || !chatDraft.trim()) return;
    ws.send(JSON.stringify({ type: 'chat:send', text: chatDraft.trim() }));
    setChatDraft('');
  };

  const handleQuickTaunt = (phrase: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'chat:send', text: phrase }));
  };

  const handleRequestPush = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setToastAlert({
        title: 'Notificaciones Activadas',
        body: 'Recibirás alertas en tiempo real de torneos y mesas.',
        category: 'community',
      });
      setTimeout(() => setToastAlert(null), 3500);
    }
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (!room && (ev.key === 'Enter' || ev.key === ' ')) {
        if (!authOpen && !lobbyOpen && !tournamentsOpen && !walletOpen && !statsOpen && !adminOpen) {
          ev.preventDefault();
          handleCreateRoom({
            mode: '2v2',
            targetScore: 200,
            wagerCoins: 0,
            autoStartWithAi: true,
          });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [room, authOpen, lobbyOpen, tournamentsOpen, walletOpen, statsOpen, adminOpen, handleCreateRoom]);

  const currentTurnPlayerName =
    room?.seats.find((s) => s.seatIndex === room.currentTurnSeat)?.name || '';

  // Compute remaining turn bar percentage (0..100%)
  const turnPct = useMemo(() => {
    if (!room || room.status !== 'playing') return 0;
    const totalMs = Math.max(10, room.turnSeconds || 30) * 1000;
    const elapsed = Math.max(0, nowMs - (room.turnStartedAt || nowMs));
    return Math.max(4, Math.min(100, 100 - (elapsed / totalMs) * 100));
  }, [room, nowMs]);

  const myTeamSide = mySeat?.teamSide || 'A';
  const myTeamScore = room ? (myTeamSide === 'A' ? room.teamAScore : room.teamBScore) : 0;
  const rivalTeamScore = room ? (myTeamSide === 'A' ? room.teamBScore : room.teamAScore) : 0;

  // Top Scoreboard Slot (Screenshot 3 Header)
  const topScoreboardSlot = room ? (
    <div className="relative flex items-center justify-between gap-3 pt-1">
      {room.mode === 'ffa' ? (
        <div className="flex-1 flex items-center justify-between gap-2 overflow-x-auto pb-1 border-b border-white/15">
          <div className="flex items-center gap-3 sm:gap-5">
            {room.seats.map((s) => (
              <div key={s.seatIndex} className="flex items-baseline gap-1.5 shrink-0">
                <span className="text-xs text-zinc-300 font-semibold">
                  {s.uid === myUid ? 'Tú' : s.name}
                </span>
                <span
                  className={`text-xl sm:text-2xl font-black font-mono tabular-nums ${
                    s.uid === myUid ? 'text-[#2563EB]' : 'text-[#EF4444]'
                  }`}
                >
                  {s.score}
                </span>
              </div>
            ))}
          </div>
          <div className="text-xs font-semibold text-zinc-300 shrink-0">
            a {room.targetScore}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-end justify-between gap-3">
          {/* Left: Nosotros + Blue Score */}
          <div className="flex-1 flex items-baseline gap-2 sm:gap-3 pb-1.5 border-b border-white/15">
            <span className="text-xs sm:text-sm font-medium text-zinc-300">Nosotros</span>
            <span className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-[#1E6BFF] leading-none">
              {myTeamScore}
            </span>
          </div>

          {/* Center: a 200 (+ Pozo or Apuesta badge if relevant) */}
          <div className="px-2 pb-1 text-center shrink-0">
            <div className="text-xs sm:text-sm font-semibold text-zinc-300">
              a {room.targetScore}
            </div>
            {(room.wagerCoins > 0 || (room.mode === '1v1' && room.boneyardCount > 0)) && (
              <div className="text-[10px] font-mono font-bold text-[#EAA938]">
                {room.wagerCoins > 0 ? `${room.wagerCoins} mon.` : `Pozo: ${room.boneyardCount}`}
              </div>
            )}
          </div>

          {/* Right: Red Score + Ellos */}
          <div className="flex-1 flex items-baseline justify-end gap-2 sm:gap-3 pb-1.5 border-b border-white/15">
            <span className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-[#EF4444] leading-none">
              {rivalTeamScore}
            </span>
            <span className="text-xs sm:text-sm font-medium text-zinc-300">Ellos</span>
          </div>
        </div>
      )}

      {/* Far Right Settings / Menu Button matching Screenshot 3 */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setTableMenuOpen((v) => !v)}
          aria-label="Opciones de mesa"
          className="w-10 h-10 rounded-xl bg-[#1D1711] hover:bg-[#2A221A] border border-white/12 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {tableMenuOpen && (
          <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-[#18130E] border border-white/15 p-3 shadow-2xl z-40 space-y-2.5 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="text-zinc-400">Código de mesa</span>
              <span className="font-mono font-extrabold text-[#EAA938]">{room.roomCode}</span>
            </div>
            <div className="flex items-center justify-between text-zinc-300">
              <span>Mano #{room.roundNumber}</span>
              <span>Meta: {room.targetScore}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setMuted((m) => {
                  soundFx.muted = !m;
                  return !m;
                });
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#221B14] hover:bg-[#2C231A] text-zinc-200"
            >
              <span>Sonido de fichas</span>
              {muted ? <VolumeX className="w-4 h-4 text-zinc-400" /> : <Volume2 className="w-4 h-4 text-[#EAA938]" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setTableMenuOpen(false);
                setRulesOpen(true);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#221B14] hover:bg-[#2C231A] text-zinc-200"
            >
              <span>Reglas del Dominó RD</span>
              <BookOpen className="w-4 h-4 text-[#EAA938]" />
            </button>
            <button
              type="button"
              onClick={handleLeaveRoom}
              className="w-full py-2 px-3 rounded-xl bg-rose-700/85 hover:bg-rose-600 text-white font-bold text-center"
            >
              {labels.leaveTable}
            </button>
          </div>
        )}
      </div>
    </div>
  ) : undefined;

  // Bottom Action Bar directly below Mahogany Table (Screenshot 3 Row 3)
  const actionBarSlot = room ? (
    <div className="flex items-center justify-between gap-2 sm:gap-4 px-1">
      {/* Left: Chat Button */}
      <button
        type="button"
        onClick={() => setChatOpen((o) => !o)}
        aria-label="Chat de mesa"
        className={`relative w-10 h-10 rounded-xl border flex items-center justify-center transition-colors shrink-0 ${
          chatOpen
            ? 'bg-[#EAA938] border-[#EAA938] text-[#140E08]'
            : 'bg-[#1D1711] hover:bg-[#2A221A] border-white/12 text-zinc-200'
        }`}
      >
        <MessageSquare className="w-4 h-4" />
        {chatMessages.length > 0 && !chatOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#EAA938] text-[#140E08] text-[9px] font-black flex items-center justify-center">
            {Math.min(9, chatMessages.length)}
          </span>
        )}
      </button>

      {/* Center: Turn Prompt + Gold Countdown Bar + Inline Move Controls */}
      <div className="flex-1 flex flex-col items-center justify-center min-w-0">
        {selectedTileId && isMyTurn ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => playTileOnSide(selectedTileId, 'left')}
              className="px-3 py-1.5 rounded-lg bg-[#EAA938] hover:bg-[#F3B84E] text-[#140E08] font-extrabold text-xs"
            >
              Izquierda ({room.openLeft})
            </button>
            <button
              type="button"
              onClick={() => playTileOnSide(selectedTileId, 'right')}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#140E08] font-extrabold text-xs"
            >
              Derecha ({room.openRight})
            </button>
          </div>
        ) : isMyTurn && legalMoves.length === 0 ? (
          <button
            type="button"
            onClick={handlePassOrDraw}
            className="px-4 py-1.5 rounded-lg bg-[#CE1126] hover:bg-rose-600 text-white font-extrabold text-xs shadow"
          >
            {room.boneyardCount > 0 ? `${labels.drawTile} (${room.boneyardCount})` : labels.passTurn}
          </button>
        ) : (
          <>
            <div
              className={`text-xs sm:text-sm font-bold truncate max-w-full ${
                isMyTurn ? 'text-[#EAA938]' : 'text-zinc-300'
              }`}
            >
              {isMyTurn
                ? mustPlayDoubleSix && room.board.length === 0
                  ? 'Sales con el doble 6'
                  : labels.yourTurn
                : `${labels.waitingTurn} ${currentTurnPlayerName}`}
            </div>

            <div className="w-36 sm:w-44 h-1 rounded-full bg-white/12 overflow-hidden mt-1.5">
              <div
                className="h-full rounded-full bg-[#EAA938] transition-all duration-200"
                style={{ width: `${turnPct}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Right: Portal anchor for persistent VideoCallBar (zero teardown across state transitions!) */}
      <div ref={setActionRightSlotEl} className="shrink-0 min-w-[40px] flex justify-end" />
    </div>
  ) : undefined;

  const videoBarElement = (
    <VideoCallBar
      ws={ws}
      roomCode={room?.roomCode || null}
      myUid={myUid}
      labels={labels}
      hiddenUi={!room || room.status === 'waiting'}
      onRtcSignalRef={rtcSignalRef}
      onVideoStreamsChange={setVideoStreams}
      onCallStatusChange={setCallStatus}
      toggleCallActionRef={toggleCallActionRef}
    />
  );

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#120E0A] text-[#F5EFE6]">
      {/* Dedicated Full-Bleed Mahogany 2D Dominoes Table */}
      <DominoTable2D
        room={room}
        myUid={myUid}
        selectedTileId={selectedTileId}
        legalTileIds={legalTileIds}
        isMyTurn={isMyTurn}
        videoStreams={videoStreams}
        topSlot={room && room.status !== 'waiting' ? topScoreboardSlot : undefined}
        actionBarSlot={room && room.status !== 'waiting' ? actionBarSlot : undefined}
        onSelectTile={handleRackTileClick}
        onPlayEnd={(side) => {
          if (selectedTileId) playTileOnSide(selectedTileId, side);
        }}
      />

      {/* Persistent VideoCallBar portaled cleanly into Row 3 when playing, never unmounting */}
      {actionRightSlotEl && room && room.status !== 'waiting'
        ? createPortal(videoBarElement, actionRightSlotEl)
        : videoBarElement}

      {/* Real-time Push & System Toast Banner */}
      {toastAlert && (
        <div className="fixed top-4 right-4 z-50 max-w-xs rounded-xl bg-[#1A140F] border border-[#EAA938]/55 px-4 py-3 shadow-2xl pointer-events-auto">
          <div className="text-xs font-bold text-[#EAA938]">{toastAlert.title}</div>
          <div className="text-xs text-zinc-200 mt-0.5">{toastAlert.body}</div>
        </div>
      )}

      {/* TITLE SCREEN OVERLAY */}
      {!room && (
        <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-6 pt-safe pb-safe">
          {/* Minimal Top Utility Bar */}
          <div className="flex items-center justify-between gap-3 pointer-events-auto">
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#18130E]/95 border border-white/15 rounded-lg p-0.5 text-xs">
                {(['es', 'en', 'fr'] as Locale[]).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => handleChangeLocale(loc)}
                    className={`px-2 py-1 rounded-md font-semibold uppercase transition-colors ${
                      locale === loc ? 'bg-[#EAA938] text-[#140E08]' : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setMuted((m) => {
                    soundFx.muted = !m;
                    return !m;
                  })
                }
                aria-label="Audio"
                className="p-2 rounded-lg bg-[#18130E]/95 border border-white/15 text-zinc-200 hover:text-[#EAA938]"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((o) => !o)}
                  aria-label={labels.notifications}
                  className="p-2 rounded-lg bg-[#18130E]/95 border border-white/15 text-zinc-200 hover:text-[#EAA938] relative"
                >
                  <Bell className="w-4 h-4" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#EAA938] text-[10px] font-bold text-[#140E08] flex items-center justify-center">
                      {Math.min(9, notifications.length)}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute left-0 mt-2 w-72 rounded-xl bg-[#18130E] border border-[#EAA938]/35 p-3 shadow-2xl z-30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-200">
                        {labels.notifications}
                      </span>
                      <button
                        type="button"
                        onClick={handleRequestPush}
                        className="text-[11px] text-emerald-300 hover:underline"
                      >
                        {labels.enablePush}
                      </button>
                    </div>
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {notifications.map((n, i) => (
                        <div key={n.id || i} className="text-xs border-t border-white/10 pt-2">
                          <div className="font-semibold text-white">{n.title}</div>
                          <div className="text-zinc-400 text-[11px] mt-0.5">{n.body}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setRulesOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#18130E]/95 border border-white/15 text-xs font-semibold text-zinc-200 hover:text-[#EAA938] whitespace-nowrap"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#EAA938]" />
                <span>Reglas RD</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => setWalletOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#18130E]/95 border border-[#EAA938]/40 text-xs font-mono font-bold text-[#EAA938] whitespace-nowrap"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>{user.coinBalance.toLocaleString()}</span>
                  </button>
                  {user.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => setAdminOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#EAA938] text-[#140E08] text-xs font-bold whitespace-nowrap"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>{labels.admin}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    aria-label={labels.signOut}
                    className="p-2 rounded-lg bg-[#18130E]/95 border border-white/15 text-zinc-300 hover:text-white"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#18130E]/95 hover:bg-[#241C14] border border-[#EAA938]/40 text-xs font-semibold text-amber-100 whitespace-nowrap min-h-[40px]"
                >
                  <LogIn className="w-4 h-4 text-[#EAA938]" />
                  <span>{labels.signIn}</span>
                </button>
              )}
            </div>
          </div>

          {/* Center-Left Calm Title Lockup & Primary Play CTAs */}
          <div className="my-auto max-w-lg pointer-events-auto bg-[#140F0B]/92 border border-[#EAA938]/30 rounded-2xl p-6 sm:p-7 shadow-2xl">
            <div className="flex items-center gap-3.5 mb-4">
              <svg viewBox="0 0 64 64" className="w-12 h-12 shrink-0" aria-hidden="true">
                <rect
                  x="14"
                  y="4"
                  width="36"
                  height="56"
                  rx="6"
                  fill="#FFFFFF"
                  stroke="#18181B"
                  strokeWidth="3"
                />
                <line x1="18" y1="32" x2="46" y2="32" stroke="#0D0D0F" strokeWidth="2.6" />
                <circle cx="32" cy="32" r="2.4" fill="#0D0D0F" />
                <circle cx="24" cy="12" r="2.7" fill="#0D0D0F" />
                <circle cx="40" cy="12" r="2.7" fill="#0D0D0F" />
                <circle cx="24" cy="19" r="2.7" fill="#0D0D0F" />
                <circle cx="40" cy="19" r="2.7" fill="#0D0D0F" />
                <circle cx="24" cy="26" r="2.7" fill="#0D0D0F" />
                <circle cx="40" cy="26" r="2.7" fill="#0D0D0F" />
                <circle cx="24" cy="38" r="2.7" fill="#0D0D0F" />
                <circle cx="40" cy="38" r="2.7" fill="#0D0D0F" />
                <circle cx="24" cy="45" r="2.7" fill="#0D0D0F" />
                <circle cx="40" cy="45" r="2.7" fill="#0D0D0F" />
                <circle cx="24" cy="52" r="2.7" fill="#0D0D0F" />
                <circle cx="40" cy="52" r="2.7" fill="#0D0D0F" />
              </svg>
              <div>
                <h1 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-amber-50 leading-tight">
                  {labels.brand}
                </h1>
                <p className="text-xs sm:text-sm text-amber-200/80 mt-0.5">
                  {labels.subtitle}
                </p>
              </div>
            </div>

            {!user && (
              <div className="mt-4 flex items-center gap-2">
                <label htmlFor="guest-name-input" className="text-xs font-semibold text-zinc-300 shrink-0">
                  Tu apodo:
                </label>
                <input
                  id="guest-name-input"
                  type="text"
                  maxLength={24}
                  value={guestName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGuestName(val);
                    if (val.trim()) {
                      localStorage.setItem('qd_guest_name', val.trim());
                    } else {
                      localStorage.removeItem('qd_guest_name');
                    }
                  }}
                  placeholder="Invitado (opcional)"
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[#1A140F] border border-white/15 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#EAA938]"
                />
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
              <button
                type="button"
                onClick={() => setLobbyOpen(true)}
                className="flex-1 py-3 px-5 rounded-xl bg-[#EAA938] hover:bg-[#F3B84E] text-[#140E08] font-extrabold text-sm transition-colors min-h-[46px] whitespace-nowrap"
              >
                Crear / Mesas Públicas
              </button>
              <button
                type="button"
                onClick={() =>
                  handleCreateRoom({
                    mode: '2v2',
                    targetScore: 200,
                    wagerCoins: 0,
                    autoStartWithAi: true,
                  })
                }
                className="py-3 px-4 rounded-xl bg-[#221A12] hover:bg-[#2F2419] border border-[#EAA938]/35 text-amber-100 font-semibold text-sm transition-colors min-h-[46px] whitespace-nowrap"
              >
                {labels.quickSolo2v2}
              </button>
            </div>

            {/* Secondary Ecosystem Hub Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3.5 pt-3.5 border-t border-white/10">
              <button
                type="button"
                onClick={() => setLobbyOpen(true)}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl bg-[#1A140F] hover:bg-[#261D16] border border-white/10 text-xs font-semibold text-zinc-100 min-h-[42px]"
              >
                <Users className="w-3.5 h-3.5 text-[#EAA938]" />
                <span className="truncate">{labels.lobby}</span>
              </button>
              <button
                type="button"
                onClick={() => setTournamentsOpen(true)}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl bg-[#1A140F] hover:bg-[#261D16] border border-white/10 text-xs font-semibold text-zinc-100 min-h-[42px]"
              >
                <Trophy className="w-3.5 h-3.5 text-[#EAA938]" />
                <span className="truncate">{labels.tournaments}</span>
              </button>
              <button
                type="button"
                onClick={() => setWalletOpen(true)}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl bg-[#1A140F] hover:bg-[#261D16] border border-white/10 text-xs font-semibold text-zinc-100 min-h-[42px]"
              >
                <Coins className="w-3.5 h-3.5 text-[#EAA938]" />
                <span className="truncate">{labels.wallet}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShareBannerText(null);
                  setStatsOpen(true);
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl bg-[#1A140F] hover:bg-[#261D16] border border-white/10 text-xs font-semibold text-zinc-100 min-h-[42px]"
              >
                <BarChart3 className="w-3.5 h-3.5 text-[#EAA938]" />
                <span className="truncate">{labels.stats}</span>
              </button>
            </div>
          </div>

          {/* Single Flat Control-Hint Line */}
          <div className="text-center text-xs text-zinc-300/80 pointer-events-none">
            {labels.controlHint}
          </div>
        </div>
      )}

      {/* SCREEN 2: WAITING ROOM OVERLAY */}
      {room && room.status === 'waiting' && (
        <WaitingRoomOverlay
          room={room}
          myUid={myUid}
          isInCall={callStatus.inCall && callStatus.micOn}
          onToggleQuickCall={() => toggleCallActionRef.current?.()}
          onLeaveRoom={handleLeaveRoom}
          onStartMatch={() => ws?.send(JSON.stringify({ type: 'room:start' }))}
          onAddBot={(seatIndex) =>
            ws?.send(JSON.stringify({ type: 'room:add-bot', seatIndex }))
          }
          onRemoveBot={(seatIndex) =>
            ws?.send(JSON.stringify({ type: 'room:remove-bot', seatIndex }))
          }
          onSitSeat={(seatIndex) =>
            ws?.send(JSON.stringify({ type: 'room:sit', seatIndex }))
          }
          onUpdateRules={(patch) =>
            ws?.send(JSON.stringify({ type: 'room:update-rules', ...patch }))
          }
        />
      )}

      {/* LIVE CHAT DRAWER (during active gameplay) */}
      {room && room.status !== 'waiting' && chatOpen && (
        <div className="fixed bottom-32 left-3 sm:left-6 z-30 w-72 sm:w-80 rounded-2xl bg-[#18130E]/96 border border-[#EAA938]/35 p-3 shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#EAA938]">Chat de Mesa</span>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              aria-label="Cerrar chat"
              className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {['¡Capicúa!', '¡Trancao!', '¡Paso!', '¡Buen juego!'].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleQuickTaunt(q)}
                className="px-2 py-1 rounded-lg bg-[#241C14] hover:bg-[#EAA938]/20 border border-white/10 text-[11px] text-amber-200"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="h-36 overflow-y-auto space-y-1.5 mb-2 text-xs">
            {chatMessages.map((m) => (
              <div key={m.id}>
                <span className="font-semibold text-[#EAA938]">{m.senderName}: </span>
                <span className="text-zinc-200">{m.text}</span>
              </div>
            ))}
          </div>
          <form onSubmit={handleSendChat} className="flex gap-1.5">
            <input
              type="text"
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              placeholder={labels.chatPlaceholder}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#120E0A] border border-white/15 text-xs text-white focus:outline-none focus:border-[#EAA938]"
            />
            <button
              type="submit"
              aria-label={labels.send}
              className="p-2 rounded-lg bg-[#EAA938] text-[#140E08]"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* ROUND OVER / MATCH FINISHED MODAL */}
      {room && (room.status === 'round_over' || room.status === 'finished') && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/60 pointer-events-auto">
          <div className="max-w-md w-full rounded-2xl bg-[#18130E] border border-[#EAA938]/55 p-6 shadow-2xl text-center space-y-4">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#EAA938]">
              {room.status === 'finished' ? 'Partida Finalizada' : 'Fin de Mano'}
            </div>
            <h2 className="font-display text-xl font-bold text-white">
              {room.lastEvent?.message}
            </h2>
            {room.mode === 'ffa' ? (
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {room.seats.map((s) => (
                  <div
                    key={s.seatIndex}
                    className="rounded-lg bg-[#120E0A] border border-white/10 p-2"
                  >
                    <div className="text-zinc-300 truncate">{s.name}</div>
                    <div className="text-base font-black text-[#EAA938]">{s.score} pts</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex justify-center gap-8 font-mono text-base font-bold">
                <div>
                  <span className="text-[#1E6BFF]">Nosotros:</span> {myTeamScore}
                </div>
                <div>
                  <span className="text-[#EF4444]">Ellos:</span> {rivalTeamScore}
                </div>
              </div>
            )}

            {room.status === 'finished' && (
              <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => ws?.send(JSON.stringify({ type: 'room:rematch' }))}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#EAA938] hover:bg-[#F3B84E] text-[#140E08] font-extrabold text-xs min-h-[42px]"
                >
                  {labels.rematch}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShareBannerText(
                      `¡Gran partida en Quisqueya Dominó (${myTeamScore} - ${rivalTeamScore})! ${room.lastEvent?.message || ''}`
                    );
                    setStatsOpen(true);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs min-h-[42px]"
                >
                  {labels.shareResult}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ECOSYSTEM MODALS */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={handleAuthenticated}
      />

      <LobbyModal
        open={lobbyOpen}
        onClose={() => setLobbyOpen(false)}
        labels={labels}
        playerName={user?.displayName || guestName.trim() || 'Jugador'}
        coinBalance={user?.coinBalance}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
      />

      <TournamentsModal
        open={tournamentsOpen}
        onClose={() => setTournamentsOpen(false)}
        token={token}
        user={user}
        labels={labels}
        onRequireAuth={() => setAuthOpen(true)}
        onRefreshUser={() => refreshProfile()}
        onPlayTournamentMatch={(t: TournamentItem) => {
          handleCreateRoom({
            mode: 'tournament',
            targetScore: t.targetScore === 100 ? 100 : 200,
            wagerCoins: 0,
            autoStartWithAi: true,
            tournamentId: t.id,
          });
        }}
      />

      <WalletModal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        token={token}
        user={user}
        labels={labels}
        onRequireAuth={() => setAuthOpen(true)}
        onRefreshUser={() => refreshProfile()}
      />

      <StatsAndShareModal
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        token={token}
        user={user}
        labels={labels}
        shareBannerText={shareBannerText}
      />

      <AdminDashboardModal
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        token={token}
        labels={labels}
        onRefreshUser={() => refreshProfile()}
      />

      {/* DOMINICAN DOMINO RULES MODAL */}
      {rulesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 pointer-events-auto">
          <div className="max-w-lg w-full rounded-2xl bg-[#121622] border border-white/15 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex flex-col w-2 h-5 rounded-xs overflow-hidden shrink-0">
                  <span className="flex-1 bg-[#002D62]" />
                  <span className="flex-1 bg-white" />
                  <span className="flex-1 bg-[#CE1126]" />
                </span>
                <h2 className="text-lg font-extrabold text-white">
                  Reglas del Dominó Dominicano
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setRulesOpen(false)}
                aria-label="Cerrar reglas"
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs sm:text-sm text-zinc-200 leading-relaxed max-h-[65vh] overflow-y-auto pr-1">
              <div className="rounded-xl bg-[#0B101B] border border-white/10 p-3">
                <div className="font-bold text-[#EAA938]">1. La Salida (Doble Seis)</div>
                <p className="text-zinc-300 mt-0.5">
                  En la primera mano sale obligatoriamente quien tenga el doble seis (6-6). En las manos siguientes sale el ganador anterior con cualquier ficha. El turno corre hacia la derecha.
                </p>
              </div>
              <div className="rounded-xl bg-[#0B101B] border border-white/10 p-3">
                <div className="font-bold text-[#EAA938]">2. Paso Corrido (+30 puntos)</div>
                <p className="text-zinc-300 mt-0.5">
                  En mesa de 4 jugadores sin pozo, si colocas una ficha y los otros 3 jugadores pasan de corrido devolviéndote el turno para seguir jugando, sumas +30 puntos al instante.
                </p>
              </div>
              <div className="rounded-xl bg-[#0B101B] border border-white/10 p-3">
                <div className="font-bold text-[#EAA938]">3. Capicúa (+30 puntos)</div>
                <p className="text-zinc-300 mt-0.5">
                  Cuando pegas tu última ficha y encaja por ambos extremos abiertos de la mesa, logras Capicúa y sumas +30 puntos adicionales a todas las pintas rivales.
                </p>
              </div>
              <div className="rounded-xl bg-[#0B101B] border border-white/10 p-3">
                <div className="font-bold text-[#EAA938]">4. Tranque y Empate</div>
                <p className="text-zinc-300 mt-0.5">
                  Si ningún jugador puede colocar ficha, gana la pareja (o jugador en Todos vs Todos) con menor suma de pintas en mano y se lleva todos los puntos de la mesa. Si empatan, no hay puntos y repite el mismo salidor.
                </p>
              </div>
              <div className="rounded-xl bg-[#0B101B] border border-white/10 p-3">
                <div className="font-bold text-[#EAA938]">5. Meta y Zapato</div>
                <p className="text-zinc-300 mt-0.5">
                  Se juega a 200 puntos (o 100 en partidas rápidas). Si ganas dejando al rival con 0 puntos, ¡le das un Zapato oficial!
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setRulesOpen(false)}
              className="w-full py-2.5 rounded-xl bg-[#EAA938] hover:bg-[#F3B84E] text-[#140E08] font-extrabold text-sm"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
