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

import { describe, it, expect } from 'vitest';

import { buildEmailOptionWrites } from '../emailSettings';

const smtp = {
  EmailProvider: 'smtp',
  SMTPServer: 'smtp.example',
  SMTPPort: '465',
  SMTPAccount: 'noreply@example.com',
  SMTPFrom: 'noreply@example.com',
  SMTPToken: '',
  ResendApiKey: '',
  ResendFrom: 'notify@example.com',
};
const resend = { ...smtp, EmailProvider: 'resend' };
const keys = (writes) => writes.map((opt) => opt.key);

describe('buildEmailOptionWrites', () => {
  it('sends only the changed SMTP fields', () => {
    expect(
      buildEmailOptionWrites(smtp, { ...smtp, SMTPServer: 'new.example' }),
    ).toEqual([{ key: 'SMTPServer', value: 'new.example' }]);
  });

  it('sends nothing when the form still matches the baseline', () => {
    expect(buildEmailOptionWrites(smtp, smtp)).toEqual([]);
  });

  it('never overwrites port or credential with an empty value', () => {
    // 后端对空串照单全收，等于把发信配置清空；沿用既有 SMTP 卡片的约定跳过。
    expect(
      keys(
        buildEmailOptionWrites(smtp, { ...smtp, SMTPPort: '', SMTPToken: '' }),
      ),
    ).toEqual([]);
  });

  it('treats fields Semi dropped as empty instead of writing undefined', () => {
    // Semi 的 onValueChange 会把值为空串的字段整个丢掉，读出来是 undefined。
    // PUT body 里的 undefined 会被 JSON.stringify 抹掉，后端落库成字面量 "<nil>"。
    const dropped = { ...smtp, SMTPServer: undefined, SMTPAccount: undefined };
    expect(
      keys(
        buildEmailOptionWrites(
          { ...smtp, SMTPServer: '', SMTPAccount: '' },
          dropped,
        ),
      ),
    ).toEqual([]);
    // 用户确实清空了已保存的服务器地址时，要写成空串（不是不写，也不是写 undefined）
    expect(
      buildEmailOptionWrites(smtp, { ...smtp, SMTPServer: undefined }),
    ).toEqual([{ key: 'SMTPServer', value: '' }]);
    // 发信方式读不到值时不能把它切走
    expect(
      keys(
        buildEmailOptionWrites(resend, {
          ...resend,
          EmailProvider: undefined,
          ResendApiKey: 'secret',
        }),
      ),
    ).toEqual(['ResendApiKey']);
  });

  it('treats a missing or unknown provider as smtp', () => {
    // 老库里 EmailProvider 可能是空串；两边都归一成 smtp 才不会凭空多一条写入
    const legacy = { ...smtp, EmailProvider: '' };
    expect(buildEmailOptionWrites(legacy, legacy)).toEqual([]);
    expect(
      buildEmailOptionWrites(
        { ...smtp, EmailProvider: 'carrier-pigeon' },
        { ...smtp, EmailProvider: 'carrier-pigeon', SMTPServer: 'new.example' },
      ),
    ).toEqual([{ key: 'SMTPServer', value: 'new.example' }]);
  });

  it('trims the Resend key and sends it only when it is not left blank', () => {
    // GET /api/option 不回传 ResendApiKey，留空必须是「不修改」而不是清空
    expect(
      buildEmailOptionWrites(resend, { ...resend, ResendApiKey: '  ' }),
    ).toEqual([]);
    expect(
      buildEmailOptionWrites(resend, { ...resend, ResendApiKey: '  secret  ' }),
    ).toEqual([{ key: 'ResendApiKey', value: 'secret' }]);
  });

  it('sends the Resend sender only when it changed', () => {
    expect(
      buildEmailOptionWrites(resend, {
        ...resend,
        ResendFrom: '"New API" <a@b.com>',
      }),
    ).toEqual([{ key: 'ResendFrom', value: '"New API" <a@b.com>' }]);
  });

  it('ignores the provider that is not selected', () => {
    // 只有选中的方式会发信，另一套设置原样留着，所以不该被顺带写回
    expect(
      keys(
        buildEmailOptionWrites(resend, {
          ...resend,
          SMTPServer: 'unused.example',
          SMTPToken: 'unused-secret',
        }),
      ),
    ).toEqual([]);
    expect(
      keys(
        buildEmailOptionWrites(smtp, {
          ...smtp,
          ResendApiKey: 'unused-secret',
          ResendFrom: 'unused@example.com',
        }),
      ),
    ).toEqual([]);
  });

  it('writes the provider selector last so credentials land first', () => {
    const writes = buildEmailOptionWrites(smtp, {
      ...smtp,
      EmailProvider: 'resend',
      ResendApiKey: 'secret',
      ResendFrom: 'notify@example.com',
    });
    expect(keys(writes)).toEqual(['ResendApiKey', 'EmailProvider']);
  });

  it('switches back to smtp only after the SMTP fields are saved', () => {
    const writes = buildEmailOptionWrites(resend, {
      ...resend,
      EmailProvider: 'smtp',
      SMTPServer: 'new.example',
    });
    expect(keys(writes)).toEqual(['SMTPServer', 'EmailProvider']);
  });

  it('sends just the selector when the saved Resend configuration is reused', () => {
    // 已经配好 Key 与发件人，切方式时不必也不能重发凭据（Key 前端根本没有值）
    expect(
      buildEmailOptionWrites(
        { ...smtp, ResendFrom: 'notify@example.com' },
        { ...resend, ResendApiKey: '' },
      ),
    ).toEqual([{ key: 'EmailProvider', value: 'resend' }]);
  });

  it('never emits the read-only ResendKeyConfigured status', () => {
    const writes = buildEmailOptionWrites(
      { ...smtp, ResendKeyConfigured: 'false' },
      { ...resend, ResendKeyConfigured: 'true', ResendApiKey: 'secret' },
    );
    expect(keys(writes)).not.toContain('ResendKeyConfigured');
  });
});
