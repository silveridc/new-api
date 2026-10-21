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

import React, { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Modal,
  Spin,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';

import {
  getSystemReleaseUrl,
  getUpdateErrorMessage,
  parseSystemVersion,
} from '../../services/systemUpdate';

const { Text } = Typography;

// 发行说明要渲染 Markdown，而 MarkdownRenderer 会拖进 mermaid/katex/highlight.js。
// 顶栏按钮是全站挂载的，所以这里必须懒加载：只有真正打开对话框才拉那个 chunk
// （对齐新版 system-update-dialog.tsx 的 lazy(() => import('@/components/ui/markdown'))）。
const MarkdownRenderer = lazy(() =>
  import('./markdown/MarkdownRenderer').then((module) => ({
    default: module.MarkdownRenderer,
  })),
);

/**
 * 系统更新对话框，字段与状态文案对齐新版 system-update-dialog.tsx。
 * 数据一律由调用方注入（useSystemUpdate 的返回值），组件自己不发请求，
 * 这样顶栏按钮和设置页能共用同一个 hook 实例语义。
 *
 * 状态文案的三个坑（照抄上游的分支顺序）：
 * - comparison === null（版本号对不上、或本站版本无法解析）时上游是**空文案**，
 *   这里改成明确提示「无法比较」：本 fork 的运行版本硬编码为 v0.0.0-zhaoyj
 *   （common/constants.go:14），它天然解析不出合法 semver，留空会让管理员以为功能坏了。
 * - 已忽略的版本仍然展示发行说明，只是不再提醒；「恢复提醒」必须能在忽略态下出现。
 * - 检查失败时若快照里还留着上次的 release，要继续展示它并说明是缓存。
 */
const SystemUpdateDialog = ({ visible, onCancel, update }) => {
  const { t } = useTranslation();

  const release = update?.release ?? null;
  const snapshot = update?.snapshot ?? null;
  const checking = Boolean(update?.checking);
  const releaseUrl = release ? getSystemReleaseUrl(release) : null;
  const isPrerelease = Boolean(
    release &&
    (release.prerelease ||
      (parseSystemVersion(release.tag_name)?.stage ?? 3) < 3),
  );
  const canIgnore = Boolean(
    release && (update?.hasUpdate || update?.comparison === null),
  );

  let statusText = t('尚未检查更新。');
  if (checking) {
    statusText = t('正在检查更新…');
  } else if (release) {
    if (update?.isIgnored) {
      statusText = t('此版本已被忽略');
    } else if (update?.comparison === null) {
      statusText = t('当前版本号无法与 GitHub 发行版比较');
    } else if (update?.hasUpdate) {
      statusText = t('发现新版本：{{version}}', { version: release.tag_name });
    } else {
      statusText = t('已是最新版本。');
    }
  } else if (snapshot?.lastCheckedAt) {
    statusText = t('未找到发行版。');
  }

  const handleCheckNow = async () => {
    // 失败详情由 snapshot.error 的横幅承载，这里不再弹 toast，避免同一件事两种提示。
    try {
      await update?.checkNow?.();
    } catch {
      /* runCheck 内部已把错误归进快照，这里只防住未处理的 rejection。 */
    }
  };

  const footer = (
    <>
      {(canIgnore || update?.isIgnored) && (
        <Button
          theme='borderless'
          type='tertiary'
          onClick={() => update?.setIgnored?.(!update.isIgnored)}
        >
          {update?.isIgnored ? t('恢复提醒') : t('忽略此版本')}
        </Button>
      )}
      <Button
        theme='light'
        type='tertiary'
        disabled={checking || !update?.online}
        loading={checking}
        onClick={handleCheckNow}
      >
        {checking ? t('正在检查更新…') : t('重新检查')}
      </Button>
      {releaseUrl && (
        <Button
          type='primary'
          onClick={() =>
            window.open(releaseUrl, '_blank', 'noopener,noreferrer')
          }
        >
          {t('前往 GitHub')}
        </Button>
      )}
      <Button theme='light' type='tertiary' onClick={onCancel}>
        {t('关闭')}
      </Button>
    </>
  );

  return (
    <Modal
      title={t('系统更新')}
      visible={visible}
      onCancel={onCancel}
      footer={footer}
      width={720}
      bodyStyle={{ maxHeight: '70vh', overflow: 'auto' }}
    >
      <div className='space-y-4'>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <div>
            <Text type='tertiary' size='small'>
              {t('当前版本')}
            </Text>
            <div className='font-medium break-all'>
              {update?.currentVersion || t('未知版本')}
            </div>
          </div>
          <div>
            <Text type='tertiary' size='small'>
              {t('最新版本')}
            </Text>
            <div className='flex flex-wrap items-center gap-2 font-medium break-all'>
              {release?.tag_name || t('未知')}
              {isPrerelease && <Tag size='small'>{t('预发布')}</Tag>}
            </div>
          </div>
          {release?.published_at && (
            <div>
              <Text type='tertiary' size='small'>
                {t('发布时间')}
              </Text>
              <div>{formatReleaseDate(release.published_at)}</div>
            </div>
          )}
        </div>

        {statusText && (
          <p role='status' aria-live='polite'>
            {statusText}
          </p>
        )}

        {!update?.online && (
          <Banner
            type='info'
            description={t('当前处于离线状态，恢复网络后会自动检查更新。')}
            closeIcon={null}
          />
        )}

        {snapshot?.error && (
          <Banner
            type='warning'
            description={getUpdateErrorMessage(snapshot.error, t)}
            closeIcon={null}
          />
        )}
        {snapshot?.error && release && (
          <Text type='tertiary' size='small'>
            {t('显示的是上次成功检查到的发行版。')}
          </Text>
        )}

        {visible && release && (
          <Suspense
            fallback={
              <div className='flex justify-center py-6'>
                <Spin />
              </div>
            }
          >
            {release.body ? (
              <MarkdownRenderer content={release.body} fontSize={13} />
            ) : (
              <Text type='tertiary' size='small'>
                {t('该发行版没有说明内容。')}
              </Text>
            )}
          </Suspense>
        )}
      </div>
    </Modal>
  );
};

/** GitHub 返回的是 ISO 字符串，这里统一按本地时区展示到分钟。 */
function formatReleaseDate(isoString) {
  const timestamp = Date.parse(isoString);
  if (Number.isNaN(timestamp)) return isoString;
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default SystemUpdateDialog;
