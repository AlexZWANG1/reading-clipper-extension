import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Generate a test encryption key
const TEST_KEY = crypto.randomBytes(32).toString('hex');

// Inline encrypt/decrypt for testing (mirrors spec §2 P0-4)
function encryptApiKey(plainKey, encryptionKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'hex'), iv);
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decryptApiKey(encryptedKey, encryptionKey) {
  if (!encryptedKey || !encryptionKey) return null;
  try {
    const [ivHex, tagHex, data] = encryptedKey.split(':');
    if (!ivHex || !tagHex || !data) {
      return Buffer.from(encryptedKey, 'base64').toString('utf-8');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'hex'), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

describe('API key encryption', () => {
  it('should encrypt and decrypt correctly', () => {
    const plainKey = 'sk-test-1234567890abcdef';
    const encrypted = encryptApiKey(plainKey, TEST_KEY);
    assert.notEqual(encrypted, plainKey, 'encrypted should differ from plain');
    assert.ok(encrypted.includes(':'), 'encrypted format should be iv:tag:data');

    const decrypted = decryptApiKey(encrypted, TEST_KEY);
    assert.equal(decrypted, plainKey, 'decrypted should match original');
  });

  it('should handle base64 fallback for migration', () => {
    const plainKey = 'sk-old-key';
    const base64 = Buffer.from(plainKey).toString('base64');
    const decrypted = decryptApiKey(base64, TEST_KEY);
    assert.equal(decrypted, plainKey, 'should fall back to base64 decode');
  });

  it('should return null for invalid input', () => {
    assert.equal(decryptApiKey(null, TEST_KEY), null);
    assert.equal(decryptApiKey('', TEST_KEY), null);
  });

  it('should return null when decryption fails with corrupted ciphertext', () => {
    // 3 colon-separated parts but invalid hex — triggers AES path which throws
    const corrupted = 'deadbeef:deadbeef:deadbeef';
    assert.equal(decryptApiKey(corrupted, TEST_KEY), null);
  });
});
