import crypto from 'crypto';

const KEY_PREFIX = 'shg_live_';
const RANDOM_BYTES = 32;

export interface GeneratedApiKey {
  rawKey: string;
  hash: string;
  prefix: string;
}

/**
 * Generates a cryptographically random API key prefixed with 'shg_live_'.
 * Returns the plaintext key (show once to the user) and its SHA-256 hex digest.
 */
export function generateApiKey(): GeneratedApiKey {
  const randomPart = crypto.randomBytes(RANDOM_BYTES).toString('base64url');
  const rawKey = `${KEY_PREFIX}${randomPart}`;
  return {
    rawKey,
    hash: hashApiKey(rawKey),
    prefix: KEY_PREFIX,
  };
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
}
