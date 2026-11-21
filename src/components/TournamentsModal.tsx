import React, { useEffect, useState } from 'react';
import { Calendar, Coins, Trophy, Users, X } from 'lucide-react';
import { I18nStrings } from '../lib/i18n';
import { TournamentItem, UserProfile } from '../types/app';

interface TournamentsModalProps {
  open: boolean;
  onClose: () => void;
  token: string | null;
  user: UserProfile | null;
  labels: I18nStrings;
  onRequireAuth: () => void;
  onRefreshUser: () => void;
  onPlayTournamentMatch: (t: TournamentItem) => void;
}

export const TournamentsModal: React.FC<TournamentsModalProps> = ({
  open,
  onClose,
  token,
  labels,
  onRequireAuth,
  onRefreshUser,
  onPlayTournamentMatch,
}) => {
  const [tournaments, setTournaments] = useState<TournamentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadTournaments = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tournaments', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setTournaments(data.tournaments || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setFeedback(null);
      loadTournaments();
    }
  }, [open, token]);

  if (!open) return null;

  const handleJoin = async (t: TournamentItem) => {
    if (!token) {
      onRequireAuth();
      return;
    }
    setFeedback(null);
    const res = await fetch(`/api/tournaments/${t.id}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error === 'INSUFFICIENT_COINS') {
        setFeedback('Monedas insuficientes para la inscripción. Adquiere monedas en la Billetera.');
      } else {
        setFeedback(data.error || 'No se pudo completar la inscripción.');
      }
    } else {
      setFeedback(`¡Inscrito en ${t.title}!`);
      await loadTournaments();
      onRefreshUser();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl bg-[#101E17] border border-amber-500/25 p-5 sm:p-6 text-[#F5EFE6] shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="font-display text-xl font-bold text-amber-100">
              {labels.weeklyTournaments}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {feedback && (
          <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/35 text-xs text-amber-100">
            {feedback}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-zinc-400">Cargando torneos...</div>
        ) : (
          <div className="space-y-4">
            {tournaments.map((t) => (
              <div
                key={t.id}
                className="rounded-xl bg-[#0A140F] border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <span>{t.weekLabel}</span>
                    <span>·</span>
                    <span>{t.mode}</span>
                    <span>·</span>
                    <span className="font-mono-tabular">{t.targetScore} pts</span>
                    <span>·</span>
                    <span
                      className={
                        t.status === 'open'
                          ? 'text-emerald-300 font-semibold'
                          : t.status === 'active'
                          ? 'text-amber-300 font-semibold'
                          : 'text-zinc-400'
                      }
                    >
                      {t.status === 'open'
                        ? 'Inscripciones Abiertas'
                        : t.status === 'active'
                        ? 'En Juego'
                        : `Finalizado${t.winnerName ? ` · Ganador: ${t.winnerName}` : ''}`}
                    </span>
                  </div>

                  <h3 className="font-display text-lg font-bold text-white">{t.title}</h3>
                  <p className="text-xs text-zinc-300 leading-relaxed">{t.description}</p>

                  <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                    <span className="flex items-center gap-1.5 text-amber-300 font-mono-tabular">
                      <Coins className="w-3.5 h-3.5" />
                      {labels.entryFee}: {t.entryFeeCoins}
                    </span>
                    <span className="flex items-center gap-1.5 text-emerald-300 font-mono-tabular font-semibold">
                      <Trophy className="w-3.5 h-3.5" />
                      {labels.prizePool}: {t.prizePoolCoins.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1.5 text-zinc-300 font-mono-tabular">
                      <Users className="w-3.5 h-3.5" />
                      {t.registeredCount}/{t.maxPlayers}
                    </span>
                    <span className="flex items-center gap-1.5 text-zinc-400">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(t.startsAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex sm:flex-col gap-2 shrink-0">
                  {t.isRegistered ? (
                    <>
                      <span className="px-3.5 py-2 rounded-lg bg-emerald-900/40 border border-emerald-500/35 text-xs font-semibold text-emerald-200 text-center">
                        {labels.registered}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onPlayTournamentMatch(t);
                          onClose();
                        }}
                        className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs min-h-[40px]"
                      >
                        Jugar Mesa Torneo
                      </button>
                    </>
                  ) : t.status === 'open' ? (
                    <button
                      type="button"
                      onClick={() => handleJoin(t)}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs min-h-[42px] whitespace-nowrap"
                    >
                      {labels.registerTournament} ({t.entryFeeCoins})
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
