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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { API } = vi.hoisted(() => ({
  API: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../api', () => ({ API }));

import {
  clearPasswordEncryptionCache,
  encryptPassword,
  isPasswordEncryptionSupported,
} from '../passwordEncryption';

const PUBLIC_KEY_PEM =
  '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\n-----END PUBLIC KEY-----';

function mockKeyResponse(kid = 'key-1') {
  API.get.mockResolvedValue({
    data: {
      success: true,
      data: { enabled: true, kid, public_key: PUBLIC_KEY_PEM },
    },
  });
}

function installWebCrypto(overrides = {}) {
  const imported = [];
  const encrypted = [];
  const subtle = {
    importKey: vi.fn(async (format, bytes, algorithm) => {
      imported.push({ format, byteLength: bytes?.byteLength });
      return {
        algorithm: { name: 'RSA-OAEP', modulusLength: 2048, ...algorithm },
      };
    }),
    encrypt: vi.fn(async (algorithm, key, data) => {
      encrypted.push({ algorithm, key, length: data.byteLength });
      return new Uint8Array([1, 2, 3, 4]).buffer;
    }),
    ...overrides,
  };
  const crypto = {
    subtle,
    getRandomValues: (array) => {
      array.fill(7);
      return array;
    },
  };
  vi.stubGlobal('crypto', crypto);
  return { subtle, imported, encrypted };
}

describe('passwordEncryption availability', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports unsupported when WebCrypto is missing (HTTP 站点)', () => {
    // HTTP 站点没有 WebCrypto，只剩 crypto 命名空间本身。
    vi.stubGlobal('crypto', {});
    expect(isPasswordEncryptionSupported()).toBe(false);
  });

  it('reports supported when subtle.importKey exists', () => {
    vi.stubGlobal('crypto', { subtle: { importKey: () => undefined } });
    expect(isPasswordEncryptionSupported()).toBe(true);
  });
});

describe('encryptPassword', () => {
  beforeEach(() => {
    clearPasswordEncryptionCache();
    API.get.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('requests the server key once per cache window and returns OAEP fields', async () => {
    mockKeyResponse('kid-a');
    installWebCrypto();
    const first = await encryptPassword('hunter2');
    const second = await encryptPassword('other');

    expect(API.get).toHaveBeenCalledTimes(1);
    expect(API.get).toHaveBeenCalledWith('/api/user/login/encryption-key', {
      skipAuthRefresh: false,
      skipErrorHandler: true,
    });
    expect(first.encryption_key_id).toBe('kid-a');
    expect(second.encryption_key_id).toBe('kid-a');
    // 短密码：整段用 RSA-OAEP 包裹，结果是单个 base64 段。
    expect(first.password_encrypted).toBe('AQIDBA==');
  });

  it('switches to the v2 envelope for passwords longer than the RSA payload', async () => {
    mockKeyResponse('kid-a');
    const { encrypted } = installWebCrypto();
    const result = await encryptPassword('x'.repeat(200));

    expect(result.password_encrypted).toBe(
      // v2.<RSA 包裹的 AES 密钥>.<12 字节 IV>.<AES-GCM 密文>，IV 由
      // getRandomValues 桩固定为 0x07。
      ['v2', 'AQIDBA==', 'BwcHBwcHBwcHBwcH', 'AQIDBA=='].join('.'),
    );
    const labels = encrypted.map((item) => item.algorithm.label);
    expect(labels.some((label) => label && label.length > 0)).toBe(true);
    const gcm = encrypted.find((item) => item.algorithm.name === 'AES-GCM');
    expect(new TextDecoder().decode(gcm.algorithm.additionalData)).toBe(
      'password-v2:kid-a',
    );
  });

  it('drops the cached key and reports a browser error when encryption fails', async () => {
    mockKeyResponse('kid-a');
    installWebCrypto({
      encrypt: vi.fn(async () => {
        throw new Error('OAEP label unsupported');
      }),
    });

    const expected = '当前浏览器或站点环境不支持密码加密，请改用其他验证方式';
    await expect(encryptPassword('hunter2')).rejects.toThrow(expected);
    // 缓存被清空后，下一次调用会重新取公钥。
    await expect(encryptPassword('hunter2')).rejects.toThrow(expected);
    expect(API.get).toHaveBeenCalledTimes(2);
  });

  it('rejects when the server response has no key', async () => {
    API.get.mockResolvedValue({
      data: { success: true, data: { enabled: false } },
    });
    installWebCrypto();
    await expect(encryptPassword('hunter2')).rejects.toThrow(
      '未获取到密码加密公钥',
    );
  });

  it('refuses to encrypt outside a secure context', async () => {
    mockKeyResponse();
    vi.stubGlobal('crypto', {});
    await expect(encryptPassword('hunter2')).rejects.toThrow(
      '当前浏览器或站点环境不支持密码加密，请改用其他验证方式',
    );
  });
});
