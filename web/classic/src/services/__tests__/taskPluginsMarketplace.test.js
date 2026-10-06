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
*/

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  SUPPORTED_INDEX_VERSION,
  parseMarketplaceIndex,
  resolvePluginSourceUrl,
  findMarketplaceVersion,
  deriveInstallState,
  indexHasIntegrityHashes,
  isDefaultMarketplaceSource,
  fetchPluginSourceText,
  computeSourceSha256,
  pluginSourceByteLength,
  PluginSourceFetchError,
} from '../taskPluginsMarketplace';

const indexPayload = {
  indexVersion: 1,
  name: 'Official',
  plugins: [
    {
      key: 'suno',
      name: 'Suno',
      sortPriority: 10,
      channelTypes: [30],
      models: ['suno-v4'],
      latest: '1.1.0',
      versions: [
        { version: '1.1.0', path: 'plugins/suno/plugin.js', sha256: 'aa' },
        { version: '1.0.0', path: 'plugins/suno/plugin.js' },
      ],
    },
    {
      key: 'other-kind',
      versions: [{ version: '2.0.0', path: 'x.js', kind: 'image' }],
    },
    'garbage-entry',
  ],
};

describe('taskPluginsMarketplace pure helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parseMarketplaceIndex validates, filters and sorts plugins', () => {
    const index = parseMarketplaceIndex(indexPayload);
    expect(index.indexVersion).toBe(1);
    expect(index.name).toBe('Official');
    expect(index.plugins.map((p) => p.key)).toEqual(['suno']);
    const suno = index.plugins[0];
    expect(suno.latest).toBe('1.1.0');
    expect(suno.versions).toHaveLength(2);
    expect(suno.versions[0].sha256).toBe('aa');
    // latest 不在 versions 中时回退到第一个版本
    const fallback = parseMarketplaceIndex({
      indexVersion: 1,
      plugins: [
        {
          key: 'k',
          versions: [{ version: '0.9', path: 'a.js' }],
          latest: 'missing',
        },
      ],
    });
    expect(fallback.plugins[0].latest).toBe('0.9');
  });

  it('parseMarketplaceIndex rejects invalid payloads', () => {
    expect(() => parseMarketplaceIndex(null)).toThrowError();
    expect(() => parseMarketplaceIndex({})).toThrowError(/indexVersion/);
    expect(() =>
      parseMarketplaceIndex({ indexVersion: SUPPORTED_INDEX_VERSION + 1 }),
    ).toThrowError(/unsupported indexVersion/);
  });

  it('resolvePluginSourceUrl keeps paths on the index origin', () => {
    const base = 'https://raw.example.com/repo/main/index.json';
    expect(resolvePluginSourceUrl(base, 'plugins/a.js')).toBe(
      'https://raw.example.com/repo/main/plugins/a.js',
    );
    expect(resolvePluginSourceUrl(base, 'https://other.com/x.js')).toBeNull();
    expect(resolvePluginSourceUrl(base, '/abs.js')).toBe(
      'https://raw.example.com/abs.js',
    );
    expect(resolvePluginSourceUrl('not-a-url', 'a.js')).toBeNull();
    expect(resolvePluginSourceUrl(base, '  ')).toBeNull();
  });

  it('deriveInstallState distinguishes install states', () => {
    const plugin = {
      key: 'suno',
      latest: '1.1.0',
      versions: [
        { version: '1.1.0', path: 'a' },
        { version: '1.0.0', path: 'a' },
      ],
    };
    expect(deriveInstallState(plugin, [])).toEqual({ status: 'not_installed' });
    expect(
      deriveInstallState(plugin, [{ meta: { key: 'suno', version: '1.1.0' } }]),
    ).toEqual({ status: 'up_to_date', installedVersion: '1.1.0' });
    expect(
      deriveInstallState(plugin, [{ meta: { key: 'suno', version: '1.0.0' } }]),
    ).toEqual({
      status: 'upgradable',
      installedVersion: '1.0.0',
      latestVersion: '1.1.0',
    });
    expect(
      deriveInstallState(plugin, [{ meta: { key: 'suno', version: '0.5' } }]),
    ).toEqual({
      status: 'diverged',
      installedVersion: '0.5',
      latestVersion: '1.1.0',
    });
  });

  it('indexHasIntegrityHashes requires sha256 on every version', () => {
    expect(indexHasIntegrityHashes(parseMarketplaceIndex(indexPayload))).toBe(
      false,
    );
    const full = parseMarketplaceIndex({
      indexVersion: 1,
      plugins: [
        {
          key: 'k',
          versions: [{ version: '1', path: 'p', sha256: 'ab' }],
        },
      ],
    });
    expect(indexHasIntegrityHashes(full)).toBe(true);
  });

  it('isDefaultMarketplaceSource only trusts built-in indexes', () => {
    expect(isDefaultMarketplaceSource(
      'https://raw.githubusercontent.com/QuantumNous/new-api-plugins/main/index.json',
    )).toBe(true);
    expect(isDefaultMarketplaceSource(
      'https://www.newapi.ai/api/v1/plugins/index.json',
    )).toBe(true);
    expect(isDefaultMarketplaceSource('https://evil.example/index.json')).toBe(
      false,
    );
  });

  it('fetchPluginSourceText revalidates and enforces the size limit', async () => {
    const text = 'export default {};';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: { get: () => String(text.length) },
      text: async () => text,
    }));
    await expect(
      fetchPluginSourceText('https://x/a.js', fetchMock),
    ).resolves.toBe(text);
    expect(fetchMock).toHaveBeenCalledWith('https://x/a.js', {
      cache: 'no-cache',
    });

    await expect(
      fetchPluginSourceText('https://x/a.js', async () => ({
        ok: false,
        status: 404,
        headers: { get: () => null },
      })),
    ).rejects.toMatchObject({ reason: 'not_found', status: 404 });

    await expect(
      fetchPluginSourceText('https://x/a.js', async () => {
        throw new Error('network');
      }),
    ).rejects.toBeInstanceOf(PluginSourceFetchError);

    const huge = 'x'.repeat(8 * 1024 * 1024 + 1);
    await expect(
      fetchPluginSourceText(
        'https://x/a.js',
        async () => ({
          ok: true,
          headers: { get: () => String(huge.length) },
          text: async () => huge,
        }),
      ),
    ).rejects.toMatchObject({ reason: 'too_large' });
  });

  it('computeSourceSha256 hashes source text when WebCrypto is available', async () => {
    if (!globalThis.crypto?.subtle) {
      expect(await computeSourceSha256('abc')).toBeNull();
      return;
    }
    // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(await computeSourceSha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('pluginSourceByteLength counts UTF-8 bytes', () => {
    expect(pluginSourceByteLength('a')).toBe(1);
    expect(pluginSourceByteLength('中')).toBe(3);
  });

  it('findMarketplaceVersion locates a version entry', () => {
    const plugin = parseMarketplaceIndex(indexPayload).plugins[0];
    expect(findMarketplaceVersion(plugin, '1.0.0').path).toBe(
      'plugins/suno/plugin.js',
    );
    expect(findMarketplaceVersion(plugin, 'nope')).toBeUndefined();
  });
});
