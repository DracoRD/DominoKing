import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Lock, Mail, User, X } from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import { UserProfile } from '../types/app';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (token: string, user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  onClose,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error de autenticación');
      } else {
        onAuthenticated(data.token, data.user);
        onClose();
      }
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/auth/firebase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error con Google Sign-In');
      } else {
        onAuthenticated(idToken, data.user);
        onClose();
      }
    } catch {
      setError('Google Sign-In cancelado o no disponible en este navegador');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#101E17] border border-amber-500/25 p-6 text-[#F5EFE6] shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-xl font-bold text-amber-100">
              {mode === 'login' ? 'Entrar al Club' : 'Crear Cuenta de Jugador'}
            </h2>
            <p className="text-xs text-emerald-200/70 mt-0.5">
              Guarda tus victorias, torneos y monedas encriptadas
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

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl bg-white text-zinc-900 font-semibold text-sm hover:bg-amber-50 transition-colors min-h-[44px]"
        >
          <span>Continuar con Google</span>
        </button>

        <div className="flex items-center gap-3 my-4 text-xs text-zinc-400">
          <div className="h-px flex-1 bg-white/10" />
          <span>o con correo</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="block text-xs text-zinc-300 mb-1">Nombre en la Mesa</label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ej. Pedro El Salidor"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#09130E] border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-300 mb-1">Correo electrónico</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jugador@correo.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#09130E] border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-300 mb-1">Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#09130E] border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {error && (
            <div className="text-xs text-rose-300 bg-rose-950/50 border border-rose-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition-colors min-h-[44px]"
          >
            {loading
              ? 'Procesando...'
              : mode === 'login'
              ? 'Iniciar Sesión'
              : 'Registrar Cuenta (+1,000 Monedas)'}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
            className="text-amber-300 hover:underline"
          >
            {mode === 'login' ? '¿Nuevo aquí? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
          </button>
          <span className="text-zinc-500">Acceso seguro HTTPS/HMAC</span>
        </div>
      </div>
    </div>
  );
};
