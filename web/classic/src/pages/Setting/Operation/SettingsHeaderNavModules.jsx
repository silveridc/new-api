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

import React, { useEffect, useState, useContext } from 'react';
import {
  Button,
  Card,
  Col,
  Form,
  Row,
  Switch,
  Typography,
} from '@douyinfe/semi-ui';
import { API, showError, showSuccess } from '../../../helpers';
import { useTranslation } from 'react-i18next';
import { StatusContext } from '../../../context/Status';

const { Text } = Typography;

// pricing / rankings 是「可开关 + 可选登录限制」的模块；home/console/docs/about 只是布尔开关。
// 契约来源：后端 middleware/header_nav.go getHeaderNavAccess（缺失时 enabled=true、
// requireAuth=false，且兼容历史布尔写法）与新版 web/src/lib/nav-modules.ts。
const ACCESS_MODULES = ['pricing', 'rankings'];
const ACCESS_MODULE_DEFAULT = { enabled: true, requireAuth: false };

function defaultHeaderNavModules() {
  return {
    home: true,
    console: true,
    pricing: { ...ACCESS_MODULE_DEFAULT },
    rankings: { ...ACCESS_MODULE_DEFAULT },
    docs: true,
    about: true,
  };
}

// 归一化：pricing/rankings 兼容布尔写法与缺失字段，布尔模块转成布尔值
function normalizeHeaderNavModules(raw) {
  const modules = { ...raw };
  for (const key of ACCESS_MODULES) {
    const value = modules[key];
    if (typeof value === 'boolean') {
      modules[key] = { enabled: value, requireAuth: false };
    } else if (value && typeof value === 'object') {
      modules[key] = {
        enabled: value.enabled !== false,
        requireAuth: value.requireAuth === true,
      };
    } else {
      modules[key] = { ...ACCESS_MODULE_DEFAULT };
    }
  }
  return modules;
}

export default function SettingsHeaderNavModules(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [statusState, statusDispatch] = useContext(StatusContext);

  // 顶栏模块管理状态
  const [headerNavModules, setHeaderNavModules] = useState(
    defaultHeaderNavModules,
  );

  const isAccessModule = (moduleKey) => ACCESS_MODULES.includes(moduleKey);

  // 处理顶栏模块开关变更（access 模块只改 enabled）
  function handleHeaderNavModuleChange(moduleKey) {
    return (checked) => {
      setHeaderNavModules((prev) => {
        const newModules = { ...prev };
        if (isAccessModule(moduleKey)) {
          newModules[moduleKey] = {
            ...newModules[moduleKey],
            enabled: checked,
          };
        } else {
          newModules[moduleKey] = checked;
        }
        return newModules;
      });
    };
  }

  // 处理「需要登录访问」子开关变更
  function handleRequireAuthChange(moduleKey) {
    return (checked) => {
      setHeaderNavModules((prev) => ({
        ...prev,
        [moduleKey]: { ...prev[moduleKey], requireAuth: checked },
      }));
    };
  }

  // 重置顶栏模块为默认配置
  function resetHeaderNavModules() {
    setHeaderNavModules(defaultHeaderNavModules());
    showSuccess(t('已重置为默认配置'));
  }

  // 保存配置
  async function onSubmit() {
    setLoading(true);
    try {
      const res = await API.put('/api/option/', {
        key: 'HeaderNavModules',
        value: JSON.stringify(headerNavModules),
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('保存成功'));

        // 立即更新StatusContext中的状态
        statusDispatch({
          type: 'set',
          payload: {
            ...statusState.status,
            HeaderNavModules: JSON.stringify(headerNavModules),
          },
        });

        // 刷新父组件状态
        if (props.refresh) {
          await props.refresh();
        }
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('保存失败，请重试'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // 从 props.options 中获取配置
    if (props.options && props.options.HeaderNavModules) {
      try {
        setHeaderNavModules(
          normalizeHeaderNavModules(
            JSON.parse(props.options.HeaderNavModules) || {},
          ),
        );
      } catch (error) {
        // 使用默认配置
        setHeaderNavModules(defaultHeaderNavModules());
      }
    }
  }, [props.options]);

  // 模块配置数据
  const moduleConfigs = [
    {
      key: 'home',
      title: t('首页'),
      description: t('用户主页，展示系统信息'),
    },
    {
      key: 'console',
      title: t('控制台'),
      description: t('用户控制面板，管理账户'),
    },
    {
      key: 'pricing',
      title: t('模型广场'),
      description: t('模型定价，需要登录访问'),
      hasSubConfig: true, // 标识该模块有子配置
    },
    {
      key: 'rankings',
      title: t('排行榜'),
      description: t('按今日/本周/本月/本年展示用户与模型用量排行'),
      hasSubConfig: true,
    },
    {
      key: 'docs',
      title: t('文档'),
      description: t('系统文档和帮助信息'),
    },
    {
      key: 'about',
      title: t('关于'),
      description: t('关于系统的详细信息'),
    },
  ];

  return (
    <Card>
      <Form.Section
        text={t('顶栏管理')}
        extraText={t('控制顶栏模块显示状态，全局生效')}
      >
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          {moduleConfigs.map((module) => (
            <Col key={module.key} xs={24} sm={12} md={8} lg={8} xl={8}>
              <Card
                style={{
                  borderRadius: '8px',
                  border: '1px solid var(--semi-color-border)',
                  transition: 'all 0.2s ease',
                  background: 'var(--semi-color-bg-1)',
                  minHeight: '80px',
                }}
                bodyStyle={{ padding: '16px' }}
                hoverable
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    height: '100%',
                  }}
                >
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div
                      style={{
                        fontWeight: '600',
                        fontSize: '14px',
                        color: 'var(--semi-color-text-0)',
                        marginBottom: '4px',
                      }}
                    >
                      {module.title}
                    </div>
                    <Text
                      type='secondary'
                      size='small'
                      style={{
                        fontSize: '12px',
                        color: 'var(--semi-color-text-2)',
                        lineHeight: '1.4',
                        display: 'block',
                      }}
                    >
                      {module.description}
                    </Text>
                  </div>
                  <div style={{ marginLeft: '16px' }}>
                    <Switch
                      checked={
                        isAccessModule(module.key)
                          ? headerNavModules[module.key]?.enabled
                          : headerNavModules[module.key]
                      }
                      onChange={handleHeaderNavModuleChange(module.key)}
                      size='default'
                    />
                  </div>
                </div>

                {/* 为模型广场 / 排行榜添加权限控制子开关 */}
                {isAccessModule(module.key) &&
                  headerNavModules[module.key]?.enabled && (
                    <div
                      style={{
                        borderTop: '1px solid var(--semi-color-border)',
                        marginTop: '12px',
                        paddingTop: '12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div
                            style={{
                              fontWeight: '500',
                              fontSize: '12px',
                              color: 'var(--semi-color-text-1)',
                              marginBottom: '2px',
                            }}
                          >
                            {t('需要登录访问')}
                          </div>
                          <Text
                            type='secondary'
                            size='small'
                            style={{
                              fontSize: '11px',
                              color: 'var(--semi-color-text-2)',
                              lineHeight: '1.4',
                              display: 'block',
                            }}
                          >
                            {module.key === 'pricing'
                              ? t('开启后未登录用户无法访问模型广场')
                              : t('开启后未登录用户无法访问排行榜')}
                          </Text>
                        </div>
                        <div style={{ marginLeft: '16px' }}>
                          <Switch
                            checked={
                              headerNavModules[module.key]?.requireAuth || false
                            }
                            onChange={handleRequireAuthChange(module.key)}
                            size='default'
                          />
                        </div>
                      </div>
                    </div>
                  )}
              </Card>
            </Col>
          ))}
        </Row>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-start',
            alignItems: 'center',
            paddingTop: '8px',
            borderTop: '1px solid var(--semi-color-border)',
          }}
        >
          <Button
            size='default'
            type='tertiary'
            onClick={resetHeaderNavModules}
            style={{
              borderRadius: '6px',
              fontWeight: '500',
            }}
          >
            {t('重置为默认')}
          </Button>
          <Button
            size='default'
            type='primary'
            onClick={onSubmit}
            loading={loading}
            style={{
              borderRadius: '6px',
              fontWeight: '500',
              minWidth: '100px',
            }}
          >
            {t('保存设置')}
          </Button>
        </div>
      </Form.Section>
    </Card>
  );
}
