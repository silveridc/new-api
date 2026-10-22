/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { API } from './api';

const KEY_CACHE_TTL_MS = 5 * 60 * 1000;
// OAEP-SHA256 需要 2*32 字节哈希与 2 字节分隔，超过模数减 66 就必须改用信封加密。
const OAEP_OVERHEAD_BYTES = 66;
const ENVELOPE_LABEL = 'password-v2';

let cachedKey = null;
let cachedAt = 0;

export function clearPasswordEncryptionCache() {
  cachedKey = null;
  cachedAt = 0;
}

// WebCrypto 的 RSA-OAEP 只在安全上下文可用，HTTP 站点必须提前降级该方式。
export function isPasswordEncryptionSupported() {
  return (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto?.subtle?.importKey === 'function'
  );
}

async function getPasswordEncryptionKey() {
  const now = Date.now();
  if (cachedKey && now - cachedAt < KEY_CACHE_TTL_MS) {
    return cachedKey;
  }
  const response = await API.get('/api/user/login/encryption-key', {
    skipAuthRefresh: false,
    skipErrorHandler: true,
  });
  const key = response.data?.data;
  if (!response.data?.success || !key?.kid || !key?.public_key) {
    throw new Error('未获取到密码加密公钥');
  }
  cachedKey = { kid: key.kid, public_key: key.public_key };
  cachedAt = now;
  return cachedKey;
}

/**
 * 按后端 common.DecryptPassword 的契约加密密码：短密码直接用 RSA-OAEP(SHA-256)
 * 包裹，长密码走 v2 信封（RSA 包裹 AES-GCM 密钥）。
 */
export async function encryptPassword(password) {
  try {
    const key = await getPasswordEncryptionKey();
    const ciphertext = await rsaOaepEncrypt(password, key.public_key, key.kid);
    return { password_encrypted: ciphertext, encryption_key_id: key.kid };
  } catch (error) {
    clearPasswordEncryptionCache();
    if (error instanceof Error && error.message === '未获取到密码加密公钥') {
      throw error;
    }
    throw new Error('当前浏览器或站点环境不支持密码加密，请改用其他验证方式');
  }
}

async function rsaOaepEncrypt(password, publicKeyPEM, keyId) {
  if (!isPasswordEncryptionSupported()) {
    throw new Error('WebCrypto 不可用');
  }
  const publicKey = await globalThis.crypto.subtle.importKey(
    'spki',
    pemToDer(publicKeyPEM),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  const plaintext = new TextEncoder().encode(password);
  const modulusBytes = publicKey.algorithm.modulusLength / 8;
  if (plaintext.byteLength > modulusBytes - OAEP_OVERHEAD_BYTES) {
    return encryptEnvelope(password, publicKey, keyId);
  }
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    plaintext,
  );
  return arrayBufferToBase64(ciphertext);
}

async function encryptEnvelope(password, publicKey, keyId) {
  const secret = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await globalThis.crypto.subtle.importKey(
    'raw',
    secret,
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const [wrappedKey, ciphertext] = await Promise.all([
    globalThis.crypto.subtle.encrypt(
      {
        name: 'RSA-OAEP',
        label: new TextEncoder().encode(ENVELOPE_LABEL),
      },
      publicKey,
      secret,
    ),
    globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: new TextEncoder().encode(`${ENVELOPE_LABEL}:${keyId}`),
      },
      aesKey,
      new TextEncoder().encode(password),
    ),
  ]);
  return [
    'v2',
    arrayBufferToBase64(wrappedKey),
    arrayBufferToBase64(nonce.buffer),
    arrayBufferToBase64(ciphertext),
  ].join('.');
}

function pemToDer(pem) {
  const body = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replaceAll(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
