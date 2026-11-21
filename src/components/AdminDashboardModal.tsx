import React, { useEffect, useState } from 'react';
import { Coins, Shield, Trophy, X } from 'lucide-react';
import { I18nStrings } from '../lib/i18n';
import { EncryptedTransactionItem, TournamentItem } from '../types/app';

interface AdminDashboardModalProps {
  open: boolean;
  onClose: () => void;
  token: string | null;
  labels: I18nStrings;
  onRefreshUser: () => void;
}

interface AdminOverview {
  totalUsers: number;
  totalMatches: number;
  totalTransactions: number;
  totalFiatRevenueCents: number;
  recentUsers: Array<{
    id: number;
    email: string;
    displayName: string;
    role: string;
    coinBalance: number;
    eloRating: number;
    gamesPlayed: number;
  }>;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  open,
  onClose,
  token,
  labels,
  onRefreshUser,
}) => {
  const [tab, setTab] = useState<'tournaments' | 'ledger' | 'users'>('tournaments');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [tournaments, setTournaments] = useState<TournamentItem[]>([]);
  const [ledger, setLedger] = useState<EncryptedTransactionItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // Create Tournament form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'2v2' | '1v1'>('2v2');
  const [targetScore, setTargetScore] = useState<100 | 200>(200);
  const [entryFeeCoins, setEntryFeeCoins] = useState(200);
  const [prizePoolCoins, setPrizePoolCoins] = useState(4000);
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [weekLabel, setWeekLabel] = useState('Semana 47 · 2026');

  // Grant coins state
  const [grantUserId, setGrantUserId] = useState<number>(0);
  const [grantAmount, setGrantAmount] = useState<number>(1000);

  const loadAdminData = async () => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [ovRes, tRes, lRes] = await Promise.all([
      fetch('/api/admin/overview', { headers }),
      fetch('/api/tournaments', { headers }),
      fetch('/api/admin/transactions', { headers }),
    ]);
    if (ovRes.ok) {
      const ov = (await ovRes.json()) as AdminOverview;
      setOverview(ov);
      if (ov.recentUsers.length > 0 && grantUserId === 0) {
        setGrantUserId(ov.recentUsers[0].id);
      }
    }
    if (tRes.ok) {
      const td = await tRes.json();
      setTournaments(td.tournaments || []);
    }
    if (lRes.ok) {
      const ld = await lRes.json();
      setLedger(ld.transactions || []);
    }
  };

  useEffect(() => {
    if (open) {
      setMsg(null);
      loadAdminData();
    }
  }, [open, token]);

  if (!open) return null;

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const res = await fetch('/api/admin/tournaments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title,
        description,
        mode,
        targetScore,
        entryFeeCoins,
        prizePoolCoins,
        maxPlayers,
        weekLabel,
      }),
    });
    if (res.ok) {
      setMsg(`Torneo "${title}" creado y anunciado en tiempo real.`);
      setTitle('');
      setDescription('');
      await loadAdminData();
    }
  };

  const handleUpdateTournament = async (
    id: number,
    status: string,
    winnerUserId?: number
  ) => {
    if (!token) return;
    const res = await fetch(`/api/admin/tournaments/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status, winnerUserId }),
    });
    if (res.ok) {
      setMsg('Torneo actualizado correctamente.');
      await loadAdminData();
      onRefreshUser();
    }
  };

  const handleGrantCoins = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !grantUserId) return;
    const res = await fetch('/api/admin/grant-coins', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        targetUserId: grantUserId,
        amount: grantAmount,
        reason: 'Asignación directa desde consola Admin',
      }),
    });
    if (res.ok) {
      setMsg(`Se acreditaron ${grantAmount.toLocaleString()} monedas con registro encriptado.`);
      await loadAdminData();
      onRefreshUser();
    } else {
      const errData = await res.json().catch(() => ({}));
      setMsg(`Error: ${errData.error || 'No se pudo acreditar las monedas'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#101E17] border border-amber-500/35 p-5 sm:p-6 text-[#F5EFE6] shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-display text-xl font-bold text-amber-100">
                {labels.adminPanelTitle}
              </h2>
              <p className="text-xs text-zinc-400">
                Gestión de Torneos, Economía de Monedas y Auditoría AES-256-GCM
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="rounded-xl bg-[#0A140F] border border-white/10 p-3">
              <div className="text-[11px] text-zinc-400">Usuarios</div>
              <div className="font-mono-tabular text-lg font-bold text-white">
                {overview.totalUsers}
              </div>
            </div>
            <div className="rounded-xl bg-[#0A140F] border border-white/10 p-3">
              <div className="text-[11px] text-zinc-400">Partidas Jugadas</div>
              <div className="font-mono-tabular text-lg font-bold text-white">
                {overview.totalMatches}
              </div>
            </div>
            <div className="rounded-xl bg-[#0A140F] border border-white/10 p-3">
              <div className="text-[11px] text-zinc-400">Transacciones</div>
              <div className="font-mono-tabular text-lg font-bold text-amber-300">
                {overview.totalTransactions}
              </div>
            </div>
            <div className="rounded-xl bg-[#0A140F] border border-white/10 p-3">
              <div className="text-[11px] text-zinc-400">Ingresos Pasarelas</div>
              <div className="font-mono-tabular text-lg font-bold text-emerald-300">
                ${(overview.totalFiatRevenueCents / 100).toFixed(2)}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0A140F] rounded-lg border border-white/10 mb-5 w-fit">
          {[
            { id: 'tournaments', label: 'Torneos & Premios' },
            { id: 'users', label: 'Usuarios & Monedas' },
            { id: 'ledger', label: 'Auditoría Encriptada' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as 'tournaments' | 'ledger' | 'users')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                tab === t.id ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {msg && (
          <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-emerald-900/40 border border-emerald-500/40 text-xs text-emerald-100">
            {msg}
          </div>
        )}

        {tab === 'tournaments' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <form
              onSubmit={handleCreateTournament}
              className="rounded-xl bg-[#0A140F] border border-white/10 p-4 space-y-3"
            >
              <h3 className="text-sm font-semibold text-amber-200 flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                <span>{labels.createTournament}</span>
              </h3>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título (ej. Gran Copa Cibao 2v2)"
                className="w-full px-3 py-2 rounded-lg bg-[#12221A] border border-white/15 text-xs text-white"
              />
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Reglas y detalles del torneo..."
                className="w-full px-3 py-2 rounded-lg bg-[#12221A] border border-white/15 text-xs text-white"
              />
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Modo</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as '2v2' | '1v1')}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#12221A] border border-white/15 text-xs text-white"
                  >
                    <option value="2v2">Parejas 2v2</option>
                    <option value="1v1">Individual 1v1</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Meta Puntos</label>
                  <select
                    value={targetScore}
                    onChange={(e) => setTargetScore(Number(e.target.value) as 100 | 200)}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#12221A] border border-white/15 text-xs text-white"
                  >
                    <option value={200}>200 Puntos</option>
                    <option value={100}>100 Puntos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Entrada (Monedas)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={entryFeeCoins}
                    onChange={(e) => setEntryFeeCoins(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#12221A] border border-white/15 text-xs font-mono-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Premio Total (Monedas)
                  </label>
                  <input
                    type="number"
                    min={100}
                    value={prizePoolCoins}
                    onChange={(e) => setPrizePoolCoins(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#12221A] border border-white/15 text-xs font-mono-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Cupo Máximo</label>
                  <input
                    type="number"
                    min={4}
                    max={64}
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#12221A] border border-white/15 text-xs font-mono-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Semana</label>
                  <input
                    type="text"
                    value={weekLabel}
                    onChange={(e) => setWeekLabel(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#12221A] border border-white/15 text-xs text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs"
              >
                Publicar Torneo Semanal
              </button>
            </form>

            <div className="space-y-2.5 max-h-96 overflow-y-auto">
              {tournaments.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl bg-[#0A140F] border border-white/10 p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white">{t.title}</span>
                    <span className="uppercase text-amber-300 font-semibold">{t.status}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono-tabular">
                    Entrada: {t.entryFeeCoins} · Bolsa: {t.prizePoolCoins} · Inscritos:{' '}
                    {t.registeredCount}/{t.maxPlayers}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {t.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateTournament(t.id, 'active')}
                        className="px-2.5 py-1 rounded bg-emerald-700 text-white text-[11px] font-semibold"
                      >
                        Iniciar Torneo
                      </button>
                    )}
                    {t.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateTournament(
                            t.id,
                            'completed',
                            t.participants[0]?.userId || overview?.recentUsers[0]?.id
                          )
                        }
                        className="px-2.5 py-1 rounded bg-amber-500 text-zinc-950 text-[11px] font-bold"
                      >
                        {labels.awardWinner}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'users' && overview && (
          <div className="space-y-4">
            <form
              onSubmit={handleGrantCoins}
              className="rounded-xl bg-[#0A140F] border border-white/10 p-4 flex flex-wrap items-end gap-3"
            >
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[11px] text-zinc-400 mb-1">Jugador</label>
                <select
                  value={grantUserId}
                  onChange={(e) => setGrantUserId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-[#12221A] border border-white/15 text-xs text-white"
                >
                  {overview.recentUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} ({u.email}) — {u.coinBalance} monedas
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-36">
                <label className="block text-[11px] text-zinc-400 mb-1">Monedas (+/-)</label>
                <input
                  type="number"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-[#12221A] border border-white/15 text-xs font-mono-tabular text-white"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5"
              >
                <Coins className="w-3.5 h-3.5" />
                <span>{labels.grantCoins}</span>
              </button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-zinc-400">
                    <th className="py-2 pr-3">Nombre</th>
                    <th className="py-2 pr-3">Correo</th>
                    <th className="py-2 pr-3">Rol</th>
                    <th className="py-2 pr-3">Monedas</th>
                    <th className="py-2">ELO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {overview.recentUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2 pr-3 font-semibold text-white">{u.displayName}</td>
                      <td className="py-2 pr-3 text-zinc-300">{u.email}</td>
                      <td className="py-2 pr-3 uppercase text-amber-300">{u.role}</td>
                      <td className="py-2 pr-3 font-mono-tabular text-emerald-300">
                        {u.coinBalance.toLocaleString()}
                      </td>
                      <td className="py-2 font-mono-tabular">{u.eloRating}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'ledger' && (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {ledger.map((tx) => (
              <div
                key={tx.id}
                className="rounded-xl bg-[#0A140F] border border-white/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-mono-tabular font-bold text-amber-300">
                    {tx.txReference} · {tx.userEmail}
                  </div>
                  <div className="text-zinc-300 mt-0.5">{tx.description}</div>
                  <div className="text-[11px] text-zinc-500 font-mono-tabular mt-0.5">
                    SHA-256: {tx.integrityHash.slice(0, 22)}... ·{' '}
                    {tx.integrityVerified ? 'Íntegro' : 'Error'}
                  </div>
                </div>
                <div className="text-right font-mono-tabular">
                  <div className={tx.coinsDelta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                    {tx.coinsDelta >= 0 ? `+${tx.coinsDelta}` : tx.coinsDelta} monedas
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    ${(tx.fiatAmountCents / 100).toFixed(2)} · {tx.gateway}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
