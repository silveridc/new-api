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
  requestVerification,
  registerRequestVerificationHandler,
  unregisterRequestVerificationHandler,
  isVerificationRequiredError,
} from '../secureApiCall';

afterEach(() => {
  unregisterRequestVerificationHandler();
});

describe('requestVerification', () => {
  it('resolves null when no handler is registered', async () => {
    await expect(requestVerification({ scope: 'admin.user.delete' })).resolves.toBeNull();
  });

  it('forwards options to the registered handler and returns its proof', async () => {
    const handler = vi.fn(async (options) => ({
      proof_token: 'p1',
      scope: options.scope,
    }));
    registerRequestVerificationHandler(handler);

    const proof = await requestVerification({
      scope: 'admin.user.manage',
      context: { user_id: 7 },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      scope: 'admin.user.manage',
      context: { user_id: 7 },
    });
    expect(proof).toEqual({ proof_token: 'p1', scope: 'admin.user.manage' });
  });

  it('unregistering falls back to null resolution', async () => {
    const handler = vi.fn(async () => ({ proof_token: 'p2' }));
    registerRequestVerificationHandler(handler);
    unregisterRequestVerificationHandler(handler);

    await expect(requestVerification({ scope: 'admin.user.update' })).resolves.toBeNull();
  });

  it('isVerificationRequiredError only matches 403 verification codes', () => {
    const error = (status, code) => ({
      response: { status, data: { code } },
    });
    expect(isVerificationRequiredError(error(403, 'VERIFICATION_REQUIRED'))).toBe(true);
    expect(isVerificationRequiredError(error(403, 'SECURITY_PROOF_REQUIRED'))).toBe(false);
    expect(isVerificationRequiredError(error(401, 'VERIFICATION_REQUIRED'))).toBe(false);
    expect(isVerificationRequiredError({})).toBe(false);
  });
});
