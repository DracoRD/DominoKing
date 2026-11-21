import crypto from 'crypto';

const SESSION_SECRET =
  process.env.AUTH_SESSION_SECRET ||
  crypto.createHash('sha256').update('quisqueya-domino-session-key-v1').digest('hex');

const TX_MASTER_KEY = crypto
  .createHash('sha256')
  .update(process.env.TX_ENCRYPTION_KEY || 'quisqueya-domino-aes256-gcm-master-key-v1')
  .digest();

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export interface SessionTokenPayload {
  uid: string;
  email: string;
  role: string;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionTokenPayload, 'exp'>): string {
  const fullPayload: SessionTokenPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const data = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `qd.${data}.${sig}`;
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  if (!token.startsWith('qd.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, data, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionTokenPayload;
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface EncryptedEnvelope {
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
  keyFingerprint: string;
}

export function encryptTransactionPayload(payload: Record<string, unknown>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', TX_MASTER_KEY, iv);
  const json = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const keyFingerprint = crypto
    .createHash('sha256')
    .update(TX_MASTER_KEY)
    .digest('hex')
    .slice(0, 12);

  const envelope: EncryptedEnvelope = {
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
    keyFingerprint,
  };
  return JSON.stringify(envelope);
}

export function decryptTransactionPayload(envelopeJson: string): Record<string, unknown> | null {
  try {
    const envelope = JSON.parse(envelopeJson) as EncryptedEnvelope;
    if (envelope.alg !== 'aes-256-gcm') return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      TX_MASTER_KEY,
      Buffer.from(envelope.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function computeTransactionIntegrityHash(params: {
  txReference: string;
  userId: number;
  type: string;
  coinsDelta: number;
  balanceAfter: number;
  fiatAmountCents: number;
  gateway: string;
  encryptedPayload: string;
  previousHash: string;
}): string {
  return crypto
    .createHash('sha256')
    .update(
      [
        params.txReference,
        params.userId,
        params.type,
        params.coinsDelta,
        params.balanceAfter,
        params.fiatAmountCents,
        params.gateway,
        params.encryptedPayload,
        params.previousHash,
      ].join('|')
    )
    .digest('hex');
}
