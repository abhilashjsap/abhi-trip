import crypto from "node:crypto";
import { promisify } from "node:util";

// scrypt (not a plain SHA hash) deliberately — it's slow and memory-hard by
// design, which is the actual point for password storage: makes brute-
// forcing a stolen hash expensive. Built into Node, so no new dependency.
const scrypt = promisify(crypto.scrypt);
const KEYLEN = 64;

/** @returns {Promise<string>} "salt:hash", both hex-encoded */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, KEYLEN)).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * @param {string} password - plaintext candidate
 * @param {string} stored - "salt:hash" as produced by hashPassword
 */
export async function verifyPassword(password, stored) {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;

  const hashBuf = Buffer.from(hash, "hex");
  const candidateBuf = await scrypt(password, salt, KEYLEN);

  // timingSafeEqual requires equal-length buffers — a length mismatch
  // alone (e.g. a corrupted record) must still fail safely, not throw.
  return hashBuf.length === candidateBuf.length && crypto.timingSafeEqual(hashBuf, candidateBuf);
}
