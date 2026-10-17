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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshPost } = vi.hoisted(() => ({ refreshPost: vi.fn() }));

vi.mock('axios', () => ({
  default: { create: () => ({ post: refreshPost }) },
}));

const HINT = 'new_api_has_session';
const bundle = {
  access_token: 'token-1',
  user: { id: 1, role: 100 },
  session: { sid: 'session-1' },
};

const loadAuthSession = async () => {
  vi.resetModules();
  return import('../authSession');
};

const setHint = (value) => {
  document.cookie = `${HINT}=${value}; Path=/`;
};

describe('restoreAuthentication', () => {
  beforeEach(() => {
    setHint('1');
    refreshPost.mockReset();
  });

  afterEach(() => {
    document.cookie = `${HINT}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  });

  it('resumes the session before the first paint when the hint is present', async () => {
    refreshPost.mockResolvedValue({ data: { data: bundle } });
    const { restoreAuthentication, getCommonAuthHeaders } =
      await loadAuthSession();

    await restoreAuthentication();

    expect(refreshPost).toHaveBeenCalledTimes(1);
    expect(getCommonAuthHeaders()).toEqual({ Authorization: 'Bearer token-1' });
  });

  it('skips the doomed request for anonymous visitors', async () => {
    document.cookie = `${HINT}=; Path=/; Max-Age=0`;
    const { restoreAuthentication, getCommonAuthHeaders } =
      await loadAuthSession();

    await expect(restoreAuthentication()).resolves.toBeNull();

    expect(refreshPost).not.toHaveBeenCalled();
    expect(getCommonAuthHeaders()).toEqual({});
  });

  it('restores only once per page load', async () => {
    refreshPost.mockResolvedValue({ data: { data: bundle } });
    const { restoreAuthentication } = await loadAuthSession();

    await restoreAuthentication();
    await restoreAuthentication();

    expect(refreshPost).toHaveBeenCalledTimes(1);
  });

  it('resolves instead of blocking render when the refresh fails', async () => {
    refreshPost.mockRejectedValue(
      Object.assign(new Error('gone'), { response: { status: 401 } }),
    );
    const { restoreAuthentication, getCommonAuthHeaders } =
      await loadAuthSession();

    await expect(restoreAuthentication()).resolves.toBeNull();

    expect(getCommonAuthHeaders()).toEqual({});
  });
});
