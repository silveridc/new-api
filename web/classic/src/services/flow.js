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

import { API } from '../helpers';

/**
 * 流量分析（Flow）。契约来源：
 * - 新版 web/src/features/dashboard/lib/flow.ts（阶段定义与聚合思路）
 * - 后端 GET /api/data/flow（管理员/Root）、GET /api/data/flow/self（用户）
 *   返回 FlowQuotaData[]：
 *   { user_id?, username?, node_name?, token_id?, token_name?, use_group,
 *     channel_id?, channel_name?, model_name, token_used, count, quota }
 */

// 各角色的桑基图阶段链：root 全维（含节点名），admin 不含节点，user 不含用户/节点
export const FLOW_STAGES = {
  root: ['user', 'node', 'token', 'group', 'model', 'channel'],
  admin: ['user', 'group', 'model', 'channel'],
  user: ['token', 'group', 'model'],
};

export const FLOW_STAGE_LABELS = {
  user: '用户',
  node: '节点',
  token: '令牌',
  group: '分组',
  model: '模型',
  channel: '渠道',
};

export const MIN_FLOW_STAGES = 2;
export const DEFAULT_FLOW_TOP_N = 10;

const STAGE_FALLBACK = {
  user: 'unknown',
  node: 'unknown',
  token: 'unknown',
  group: 'unknown',
  model: 'Unknown Model',
  channel: 'Unknown',
};

// 每个阶段一种主色，节点在阶段内用明度区分由调用方处理（此处直接统一主色）
export const FLOW_STAGE_COLORS = {
  user: '#1664FF',
  node: '#1AC6FF',
  token: '#FF8A00',
  group: '#3CC780',
  model: '#7442D4',
  channel: '#009488',
};

function text(value, fallback) {
  const trimmed = String(value ?? '').trim();
  return trimmed || fallback;
}

/** 依据阶段从一行聚合记录中取出 {id, label} 节点。 */
export function flowNodeForStage(row, stage) {
  switch (stage) {
    case 'user':
      return { id: `user:${row.user_id ?? row.username}`, label: text(row.username, STAGE_FALLBACK.user) };
    case 'node':
      return { id: `node:${text(row.node_name, '')}`, label: text(row.node_name, STAGE_FALLBACK.node) };
    case 'token':
      return {
        id: `token:${row.token_id ?? text(row.token_name, '')}`,
        label: text(row.token_name, row.token_id ? `token-${row.token_id}` : STAGE_FALLBACK.token),
      };
    case 'group':
      return { id: `group:${text(row.use_group, '')}`, label: text(row.use_group, STAGE_FALLBACK.group) };
    case 'model':
      return { id: `model:${text(row.model_name, '')}`, label: text(row.model_name, STAGE_FALLBACK.model) };
    case 'channel':
      return {
        id: `channel:${row.channel_id > 0 ? row.channel_id : text(row.channel_name, '')}`,
        label: text(row.channel_name, row.channel_id > 0 ? `channel-${row.channel_id}` : STAGE_FALLBACK.channel),
      };
    default:
      return { id: `${stage}:unknown`, label: STAGE_FALLBACK[stage] || stage };
  }
}

/**
 * 把行聚合为桑基图 {nodes, links, summary}。
 * - metric: 'quota' | 'count'
 * - 每阶段只保留用量最高的前 topN 个节点，其余并入该阶段「其他」，
 *   避免节点过多导致桑基图不可读。
 */
export function buildFlowGraph(rows, { stages, metric = 'quota', topN = DEFAULT_FLOW_TOP_N } = {}) {
  const metricField = metric === 'count' ? 'count' : 'quota';
  const safeRows = Array.isArray(rows) ? rows : [];
  const visibleStages = stages.filter(Boolean);
  const valueOf = (row) => Number(row?.[metricField]) || 0;

  // 1. 统计各阶段节点的总量，取前 topN
  const stageTotals = new Map(); // stage -> Map(nodeId -> {label, total})
  for (const row of safeRows) {
    for (const stage of visibleStages) {
      const node = flowNodeForStage(row, stage);
      if (!stageTotals.has(stage)) stageTotals.set(stage, new Map());
      const bucket = stageTotals.get(stage);
      const entry = bucket.get(node.id) || { label: node.label, total: 0 };
      entry.total += valueOf(row);
      bucket.set(node.id, entry);
    }
  }

  const keep = new Map(); // stage -> Set(nodeId)
  for (const [stage, bucket] of stageTotals) {
    const top = [...bucket.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, Math.max(1, topN))
      .map(([id]) => id);
    keep.set(stage, new Set(top));
  }

  const isKept = (stage, nodeId) => {
    const set = keep.get(stage);
    return set ? set.has(nodeId) : false;
  };

  // 2. 聚合节点与链路；未进前 N 的行计入该阶段「其他」
  const nodeMap = new Map(); // id -> {key, name, kind, value}
  const linkMap = new Map(); // `src->dst` -> value
  const summary = { quota: 0, count: 0 };

  for (const row of safeRows) {
    const value = valueOf(row);
    summary.quota += Number(row?.quota) || 0;
    summary.count += Number(row?.count) || 0;
    if (value <= 0) continue;

    const path = visibleStages.map((stage) => {
      const node = flowNodeForStage(row, stage);
      if (isKept(stage, node.id)) return node;
      return { id: `other:${stage}`, label: '其他' };
    });

    for (let i = 0; i < path.length; i += 1) {
      const stage = visibleStages[i];
      const node = path[i];
      const entry = nodeMap.get(node.id) || {
        key: node.id,
        name: node.label,
        kind: stage,
        color: FLOW_STAGE_COLORS[stage],
        value: 0,
      };
      entry.value += value;
      nodeMap.set(node.id, entry);
      if (i > 0) {
        const prev = path[i - 1];
        const key = `${prev.id}->${node.id}`;
        linkMap.set(key, {
          source: prev.id,
          target: node.id,
          linkColor: FLOW_STAGE_COLORS[visibleStages[i - 1]],
          value: (linkMap.get(key)?.value || 0) + value,
        });
      }
    }
  }

  const nodes = [...nodeMap.values()].sort((a, b) => b.value - a.value);
  const links = [...linkMap.values()].filter((link) => link.value > 0);

  return { nodes, links, summary, metric: metricField, stages: visibleStages };
}

/** 拉取流量聚合数据（管理员/Root 走全量接口，普通用户走 self）。 */
export async function getFlowData({ isAdminUser = false, startTimestamp, endTimestamp, defaultTime = 'hour', username = '' }) {
  const endpoint = isAdminUser ? '/api/data/flow' : '/api/data/flow/self';
  const params = {
    start_timestamp: startTimestamp,
    end_timestamp: endTimestamp,
    default_time: defaultTime,
  };
  if (username) params.username = username;
  const res = await API.get(endpoint, { params });
  const { success, message, data } = res.data || {};
  if (!success) throw new Error(message || '获取流量数据失败');
  return Array.isArray(data) ? data : [];
}
