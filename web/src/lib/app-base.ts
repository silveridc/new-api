/*
Copyright (C) 2023-2026 QuantumNous

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
/**
 * zhaoyj add: 部署基础路径。构建期由 VITE_UI_BASE 注入（如 `/next/`），未设置时为 `/`。
 * 只影响应用内路由的跳出式导航（整页跳转、新标签打开）；接口路径始终挂在根上。
 */

/** 始终以 `/` 结尾，可直接与路由路径拼接。 */
export const APP_BASE: string = import.meta.env.VITE_UI_BASE || '/'

export function appUrl(path: string): string {
  return `${APP_BASE}${path.replace(/^\//, '')}`
}
