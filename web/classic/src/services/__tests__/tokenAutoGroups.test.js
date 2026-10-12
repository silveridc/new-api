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

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { API } = vi.hoisted(() => ({
  API: { get: vi.fn() },
}));

vi.mock('../../helpers', () => ({ API }));

import {
  DEFAULT_MAX_TOKEN_AUTO_GROUPS,
  getTokenAutoGroups,
  deriveTokenAutoGroupsForm,
  buildTokenAutoGroupsPayload,
} from '../tokenAutoGroups';

describe('tokenAutoGroups 契约', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTokenAutoGroups', () => {
    it('解析后端 groups 与 max_count', async () => {
      API.get.mockResolvedValue({
        data: {
          success: true,
          data: { groups: ['vip', 'default'], max_count: 3 },
        },
      });
      const res = await getTokenAutoGroups();
      expect(API.get).toHaveBeenCalledWith('/api/token/auto-groups');
      expect(res).toEqual({ groups: ['vip', 'default'], maxCount: 3 });
    });

    it('缺字段/非法 max_count 回退默认', async () => {
      API.get.mockResolvedValue({ data: { success: true, data: {} } });
      const res = await getTokenAutoGroups();
      expect(res.groups).toEqual([]);
      expect(res.maxCount).toBe(DEFAULT_MAX_TOKEN_AUTO_GROUPS);
    });

    it('success=false 抛错', async () => {
      API.get.mockResolvedValue({ data: { success: false, message: 'nope' } });
      await expect(getTokenAutoGroups()).rejects.toThrow('nope');
    });
  });

  describe('deriveTokenAutoGroupsForm', () => {
    it('已存自定义分组 → custom，过滤失效分组并截断到上限', () => {
      const form = deriveTokenAutoGroupsForm(
        { auto_groups: ['vip', 'gone', 'default', 'extra'] },
        ['vip', 'default', 'extra'],
        2,
      );
      expect(form.auto_groups_mode).toBe('custom');
      // 'gone' 不在可选集被过滤；截断到 2 个
      expect(form.auto_groups).toEqual(['vip', 'default']);
    });

    it('空/缺省 → inherit', () => {
      expect(deriveTokenAutoGroupsForm({ auto_groups: [] }, ['vip'])).toEqual({
        auto_groups_mode: 'inherit',
        auto_groups: [],
      });
      expect(deriveTokenAutoGroupsForm({}, ['vip'])).toEqual({
        auto_groups_mode: 'inherit',
        auto_groups: [],
      });
    });

    it('全部分组已失效时仍为 custom 但列表为空', () => {
      const form = deriveTokenAutoGroupsForm({ auto_groups: ['gone'] }, [
        'vip',
      ]);
      expect(form.auto_groups_mode).toBe('custom');
      expect(form.auto_groups).toEqual([]);
    });

    it('可选集为空（未加载）时跳过过滤、仅按上限截断', () => {
      const form = deriveTokenAutoGroupsForm(
        { auto_groups: ['vip', 'default', 'extra'] },
        [],
        2,
      );
      expect(form.auto_groups_mode).toBe('custom');
      expect(form.auto_groups).toEqual(['vip', 'default']);
    });
  });

  describe('buildTokenAutoGroupsPayload', () => {
    it('group=auto 且 custom → 回传所选分组', () => {
      expect(
        buildTokenAutoGroupsPayload({
          group: 'auto',
          auto_groups_mode: 'custom',
          auto_groups: ['vip', 'default'],
        }),
      ).toEqual(['vip', 'default']);
    });

    it('inherit 模式 → 空数组（继承全局）', () => {
      expect(
        buildTokenAutoGroupsPayload({
          group: 'auto',
          auto_groups_mode: 'inherit',
          auto_groups: ['vip'],
        }),
      ).toEqual([]);
    });

    it('group 非 auto → 空数组（清除）', () => {
      expect(
        buildTokenAutoGroupsPayload({
          group: 'default',
          auto_groups_mode: 'custom',
          auto_groups: ['vip'],
        }),
      ).toEqual([]);
    });
  });
});
