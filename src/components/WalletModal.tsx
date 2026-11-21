import React, { useEffect, useState } from 'react';
import { CheckCircle2, Coins, CreditCard, Lock, ShieldCheck, X } from 'lucide-react';
import { I18nStrings } from '../lib/i18n';
import { soundFx } from '../lib/sound';
import {
  CoinPackageItem,
  EncryptedTransactionItem,
  UserProfile,
} from '../types/app';

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
  token: string | null;
  user: UserProfile | null;
  labels: I18nStrings;
  onRequireAuth: () => void;
  onRefreshUser: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  open,
  onClose,
  token,
  user,
  labels,
  onRequireAuth,
  onRefreshUser,
}) => {
  const [tab, setTab] = useState<'store' | 'history'>('store');
  const [packages, setPackages] = useState<CoinPackageItem[]>([]);
  const [transactions, setTransactions] = useState<EncryptedTransactionItem[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<CoinPackageItem | null>(null);
  const [gateway, setGateway] = useState<'stripe' | 'paypal' | 'azul_rd'>('stripe');
  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 4242');
  const [processing, setProcessing] = useState(false);
  const [receiptMsg, setReceiptMsg] = useState<string | null>(null);

  const loadWalletData = async () => {
    const pkgRes = await fetch('/api/wallet/packages');
    if (pkgRes.ok) {
      const pData = await pkgRes.json();
      const list = pData.packages || [];
      setPackages(list);
      if (!selectedPkg && list.length > 0) setSelectedPkg(list[1] || list[0]);
    }
    if (token) {
      const txRes = await fetch('/api/wallet/transactions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (txRes.ok) {
        const tData = await txRes.json();
        setTransactions(tData.transactions || []);
      }
    }
  };

  useEffect(() => {
    if (open) {
      setReceiptMsg(null);
      loadWalletData();
    }
  }, [open, token]);

  if (!open) return null;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      onRequireAuth();
      return;
    }
    if (!selectedPkg) return;
    setProcessing(true);
    setReceiptMsg(null);
    try {
      const res = await fetch('/api/wallet/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageId: selectedPkg.id,
          gateway,
          cardLast4: cardNumber.slice(-4),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        soundFx.playCoinChime();
        setReceiptMsg(
          `Pago verificado (${data.txReference}): +${data.coinsAdded.toLocaleString()} monedas acreditadas.`
        );
        await loadWalletData();
        onRefreshUser();
      } else {
        setReceiptMsg(data.error || 'Error procesando el pago');
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl bg-[#101E17] border border-amber-500/25 p-5 sm:p-6 text-[#F5EFE6] shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-amber-100">
              {labels.wallet}
            </h2>
            <p className="text-xs text-emerald-300/80 flex items-center gap-1.5 mt-0.5">
              <Lock className="w-3.5 h-3.5" />
              <span>{labels.encryptedBadge}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance + Tab Switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Coins className="w-6 h-6 text-amber-400" />
            <div>
              <div className="text-xs text-zinc-400">Balance Actual</div>
              <div className="font-mono-tabular text-xl font-bold text-amber-300">
                {(user?.coinBalance ?? 0).toLocaleString()} {labels.coins}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0A140F] rounded-lg border border-white/10">
            <button
              type="button"
              onClick={() => setTab('store')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === 'store' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300 hover:text-white'
              }`}
            >
              {labels.buyCoins}
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === 'history' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300 hover:text-white'
              }`}
            >
              {labels.txHistory}
            </button>
          </div>
        </div>

        {receiptMsg && (
          <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-emerald-900/40 border border-emerald-500/40 text-xs text-emerald-100 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{receiptMsg}</span>
          </div>
        )}

        {tab === 'store' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2.5">
              {packages.map((pkg) => {
                const isSelected = selectedPkg?.id === pkg.id;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelectedPkg(pkg)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400'
                        : 'bg-[#0A140F] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-white">{pkg.name}</div>
                      <div className="text-xs text-amber-300 font-mono-tabular mt-0.5">
                        {pkg.coinsAmount.toLocaleString()} + {pkg.bonusCoins.toLocaleString()} bono
                      </div>
                    </div>
                    <div className="font-mono-tabular text-sm font-bold text-emerald-300">
                      ${(pkg.priceCents / 100).toFixed(2)} {pkg.currency}
                    </div>
                  </button>
                );
              })}
            </div>

            <form
              onSubmit={handleCheckout}
              className="rounded-xl bg-[#0A140F] border border-white/10 p-4 space-y-3.5"
            >
              <h3 className="text-sm font-semibold text-amber-200 flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                <span>Pasarela de Pago Segura</span>
              </h3>

              <div className="space-y-2">
                {[
                  { id: 'stripe', label: labels.gatewayStripe },
                  { id: 'paypal', label: labels.gatewayPayPal },
                  { id: 'azul_rd', label: labels.gatewayAzul },
                ].map((gw) => (
                  <label
                    key={gw.id}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer text-xs ${
                      gateway === gw.id
                        ? 'bg-emerald-950/60 border-emerald-500/50 text-white'
                        : 'bg-[#12221A] border-white/10 text-zinc-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="gateway"
                      checked={gateway === gw.id}
                      onChange={() => setGateway(gw.id as 'stripe' | 'paypal' | 'azul_rd')}
                      className="accent-amber-500"
                    />
                    <span>{gw.label}</span>
                  </label>
                ))}
              </div>

              {gateway !== 'paypal' && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Referencia / Últimos 4 dígitos de Tarjeta
                  </label>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#12221A] border border-white/15 text-xs font-mono-tabular text-white"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={processing || !selectedPkg}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs min-h-[44px]"
              >
                {processing
                  ? 'Cifrando y Procesando...'
                  : `${labels.payNow} · $${selectedPkg ? (selectedPkg.priceCents / 100).toFixed(2) : '0.00'}`}
              </button>
            </form>
          </div>
        ) : !token ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm text-zinc-300">
              Inicia sesión para consultar tu historial detallado de transacciones encriptadas.
            </p>
            <button
              type="button"
              onClick={onRequireAuth}
              className="px-4 py-2 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs"
            >
              {labels.signIn}
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-10 text-center text-sm text-zinc-400">
            No tienes transacciones registradas todavía.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[52vh] overflow-y-auto">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="rounded-xl bg-[#0A140F] border border-white/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono-tabular font-bold text-amber-300">
                      {tx.txReference}
                    </span>
                    <span className="text-zinc-500">·</span>
                    <span className="text-zinc-300">{tx.description}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                    <span>{new Date(tx.createdAt).toLocaleString()}</span>
                    <span>·</span>
                    <span className="uppercase">{tx.gateway}</span>
                    {tx.maskedMeta?.methodLabel && (
                      <>
                        <span>·</span>
                        <span>{tx.maskedMeta.methodLabel}</span>
                      </>
                    )}
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {tx.integrityVerified ? 'AES-256-GCM / SHA-256 OK' : 'Alerta'}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div
                    className={`font-mono-tabular text-sm font-bold ${
                      tx.coinsDelta >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {tx.coinsDelta >= 0 ? `+${tx.coinsDelta.toLocaleString()}` : tx.coinsDelta.toLocaleString()}
                  </div>
                  <div className="font-mono-tabular text-[11px] text-zinc-400">
                    Saldo: {tx.balanceAfter.toLocaleString()}
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
