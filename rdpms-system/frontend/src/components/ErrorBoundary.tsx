import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * ErrorBoundary — 捕获未处理的前端异常
 *
 * 说明：API 错误由 ApiError 在页面内处理，不会走到这里。
 * 这里只兜底渲染异常，展示 requestId 便于与后端日志关联排查。
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 生产环境应接入前端监控上报
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass max-w-lg p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900">页面出错了</h1>
          <p className="mt-2 text-sm text-gray-500">
            请刷新页面重试；若持续出现，请截图下方信息联系管理员。
          </p>
          <pre className="glass-panel mt-4 max-h-40 overflow-auto p-3 text-left text-xs text-gray-600">
            {error.message}
          </pre>
          <button
            type="button"
            className="btn btn-primary mt-5"
            onClick={() => window.location.reload()}
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }
}
