import React, { useEffect, useState } from 'react';
import { BarChart3, Copy, Share2, Trophy, X } from 'lucide-react';
import { I18nStrings } from '../lib/i18n';
import { LeaderboardEntry, MatchHistoryItem, UserProfile } from '../types/app';

interface StatsAndShareModalProps {
  open: boolean;
  onClose: () => void;
  token: string | null;
  user: UserProfile | null;
  labels: I18nStrings;
  shareBannerText?: string | null;
}

export const StatsAndShareModal: React.FC<StatsAndShareModalProps> = ({
  open,
  onClose,
  token,
  user,
  labels,
  shareBannerText,
}) => {
  const [tab, setTab] = useState<'stats' | 'leaderboard' | 'history'>('stats');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [matches, setMatches] = useState<MatchHistoryItem[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/leaderboard')
      .then((r) => (r.ok ? r.json() : { leaderboard: [] }))
      .then((d) => setLeaderboard(d.leaderboard || []))
      .catch(() => {});

    if (token) {
      fetch('/api/matches/me', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : { matches: [] }))
        .then((d) => setMatches(d.matches || []))
        .catch(() => {});
    }
  }, [open, token]);

  if (!open) return null;

  const totalWins =
    (user?.winsIndividual || 0) +
    (user?.winsTeam || 0) +
    (user?.winsTournament || 0);
  const winRate =
    user && user.gamesPlayed > 0
      ? Math.round((totalWins / user.gamesPlayed) * 100)
      : 0;

  const shareText =
    shareBannerText ||
    `¡Jugando en Quisqueya Dominó! ${user?.displayName || 'Jugador'} · Rating ELO ${
      user?.eloRating || 1200
    } · ${totalWins} victorias (${user?.capicuas || 0} Capicúas). ¡Únete a la mesa!`;
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Quisqueya Dominó',
          text: shareText,
          url: appUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopy();
    }
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(`${shareText} ${appUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl bg-[#101E17] border border-amber-500/25 p-5 sm:p-6 text-[#F5EFE6] shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-amber-400" />
            <h2 className="font-display text-xl font-bold text-amber-100">{labels.stats}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0A140F] rounded-lg border border-white/10 mb-5 w-fit">
          {[
            { id: 'stats', label: 'Rendimiento & Compartir' },
            { id: 'history', label: labels.matchHistory },
            { id: 'leaderboard', label: labels.leaderboard },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as 'stats' | 'leaderboard' | 'history')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === t.id ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'stats' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: labels.eloRating, val: user?.eloRating ?? 1200 },
                { label: labels.teamWins, val: user?.winsTeam ?? 0 },
                { label: labels.individualWins, val: user?.winsIndividual ?? 0 },
                { label: labels.tournamentWins, val: user?.winsTournament ?? 0 },
                { label: labels.capicuas, val: user?.capicuas ?? 0 },
                { label: `${labels.zapatos} · Win%`, val: `${user?.zapatosDealt ?? 0} · ${winRate}%` },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl bg-[#0A140F] border border-white/10 p-3.5"
                >
                  <div className="text-[11px] text-zinc-400">{stat.label}</div>
                  <div className="font-mono-tabular text-xl font-bold text-amber-200 mt-1">
                    {stat.val}
                  </div>
                </div>
              ))}
            </div>

            {/* Social Sharing */}
            <div className="rounded-xl bg-[#0A140F] border border-amber-500/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-amber-200 flex items-center gap-2">
                  <Share2 className="w-4 h-4" />
                  <span>{labels.shareResult}</span>
                </h3>
              </div>
              <p className="text-xs text-zinc-300 bg-[#12221A] rounded-lg p-3 border border-white/10">
                {shareText}
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${appUrl}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold"
                >
                  WhatsApp
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(appUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold"
                >
                  X / Twitter
                </a>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(appUrl)}&quote=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold"
                >
                  Facebook
                </a>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold"
                >
                  Telegram
                </a>
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Compartir</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3.5 py-2 rounded-lg bg-[#15281F] border border-white/15 text-zinc-200 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-2.5 max-h-[54vh] overflow-y-auto">
            {!token ? (
              <p className="text-sm text-zinc-400 py-8 text-center">
                Inicia sesión para ver tu historial detallado de partidas.
              </p>
            ) : matches.length === 0 ? (
              <p className="text-sm text-zinc-400 py-8 text-center">
                Aún no has completado partidas registradas.
              </p>
            ) : (
              matches.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl bg-[#0A140F] border border-white/10 p-3.5 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          m.isWinner ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {m.isWinner ? 'Victoria' : 'Derrota'}
                      </span>
                      <span className="text-zinc-500">·</span>
                      <span>{m.mode}</span>
                      <span className="text-zinc-500">·</span>
                      <span className="font-mono-tabular">
                        {m.teamAScore} - {m.teamBScore}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-300 mt-1">{m.winnerSummary}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      Mesa {m.roomCode} · {m.roundsCount} manos · {m.capicuasScored} capicúas ·{' '}
                      {new Date(m.playedAt).toLocaleDateString()}
                    </div>
                  </div>
                  {m.coinsDelta !== 0 && (
                    <div
                      className={`font-mono-tabular text-sm font-bold ${
                        m.coinsDelta > 0 ? 'text-amber-300' : 'text-rose-300'
                      }`}
                    >
                      {m.coinsDelta > 0 ? `+${m.coinsDelta}` : m.coinsDelta}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'leaderboard' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Jugador</th>
                  <th className="py-2 pr-3">ELO</th>
                  <th className="py-2 pr-3">2v2</th>
                  <th className="py-2 pr-3">1v1</th>
                  <th className="py-2 pr-3">Torneos</th>
                  <th className="py-2">Capicúas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {leaderboard.map((row, idx) => (
                  <tr key={row.id} className="text-zinc-200">
                    <td className="py-2.5 pr-3 font-mono-tabular text-amber-300">
                      {idx === 0 ? <Trophy className="w-3.5 h-3.5 text-amber-400 inline" /> : idx + 1}
                    </td>
                    <td className="py-2.5 pr-3 font-semibold text-white">{row.displayName}</td>
                    <td className="py-2.5 pr-3 font-mono-tabular text-emerald-300">
                      {row.eloRating}
                    </td>
                    <td className="py-2.5 pr-3 font-mono-tabular">{row.winsTeam}</td>
                    <td className="py-2.5 pr-3 font-mono-tabular">{row.winsIndividual}</td>
                    <td className="py-2.5 pr-3 font-mono-tabular">{row.winsTournament}</td>
                    <td className="py-2.5 font-mono-tabular">{row.capicuas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
