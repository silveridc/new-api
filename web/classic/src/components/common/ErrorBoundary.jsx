import React from 'react';
import { Empty, Button } from '@douyinfe/semi-ui';
import {
  IllustrationFailure,
  IllustrationFailureDark,
} from '@douyinfe/semi-illustrations';
import { withTranslation } from 'react-i18next';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    // 懒加载 chunk 失效（发版后旧资源 404）：自动整页重载一次即可恢复。
    // sessionStorage 按错误消息打标记防死循环，持续失败仍显示错误页
    // （与新版前端 general-error 的处理一致）。
    if (error instanceof Error) {
      const isChunkError =
        error.name === 'ChunkLoadError' ||
        /^Loading (CSS )?chunk .+ failed\./.test(error.message || '');
      if (isChunkError) {
        try {
          const marker = 'error_boundary_reload:' + error.message;
          if (!sessionStorage.getItem(marker)) {
            sessionStorage.setItem(marker, '1');
            window.location.reload();
            return;
          }
        } catch (storageError) {
          // sessionStorage 不可用时不自动重载，交给手动刷新
        }
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className='flex flex-col justify-center items-center h-screen p-8'>
          <Empty
            image={
              <IllustrationFailure style={{ width: 250, height: 250 }} />
            }
            darkModeImage={
              <IllustrationFailureDark style={{ width: 250, height: 250 }} />
            }
            description={t('页面渲染出错，请刷新页面重试')}
          />
          <Button
            theme='solid'
            type='primary'
            style={{ marginTop: 16 }}
            onClick={() => window.location.reload()}
          >
            {t('刷新页面')}
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);
