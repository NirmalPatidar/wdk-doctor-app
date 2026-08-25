// src/utils/payloadEncryption.ts
//
// AES-256-GCM payload encryption for cloud backup, backed by @tetherto/wdk-utils.
//
// wdk-utils provides encrypt/decrypt with AES-256-GCM + scrypt key derivation
// (via @noble/ciphers and @noble/hashes). This is the same implementation Tether
// Wallet uses in production.
//
// REQUIREMENT: @noble/ciphers uses crypto.getRandomValues, which React Native's
// Hermes engine does not provide by default. The polyfill
// `react-native-get-random-values` must be imported ONCE at app startup (before
// any encryption runs) — see src/app/_layout.tsx. That single import installs
// crypto.getRandomValues globally for the RN JS thread.
//
// These thin wrappers keep the call sites (encryptPayload / decryptPayload)
// unchanged and async-compatible with the existing cloud-backup flow.

import { encrypt, decrypt, type EncryptedPayload as WdkEncryptedPayload } from '@tetherto/wdk-utils';

// Re-export the wdk-utils payload shape so callers can type against it.
// Shape: { version, salt, iv, tag, ciphertext, scryptN, scryptR, scryptP }
export type EncryptedPayload = WdkEncryptedPayload;

/**
 * Encrypts a plaintext string with AES-256-GCM using a passphrase-derived key
 * (scrypt, DEFAULT_SCRYPT_PARAMS). Returns a JSON-serialisable payload object.
 */
export async function encryptPayload(
  plaintext: string,
  passphrase: string
): Promise<EncryptedPayload> {
  // wdk-utils encrypt() is synchronous; wrap so the call site can await it
  // and remain unchanged if the underlying impl ever becomes async.
  return encrypt(plaintext, passphrase);
}

/**
 * Decrypts an EncryptedPayload produced by encryptPayload().
 * Returns the original plaintext string.
 */
export async function decryptPayload(
  payload: EncryptedPayload,
  passphrase: string
): Promise<string> {
  try {
    return decrypt(payload, passphrase);
  } catch {
    throw new Error(
      'Decryption failed. The passphrase may be incorrect, or the ' +
      'backup payload may be corrupted.'
    );
  }
}