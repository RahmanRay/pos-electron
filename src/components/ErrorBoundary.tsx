import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TEXT } from '@/text';

/** Shows a short message with a reload button instead of a blank window when rendering fails. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui-error]', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="grid h-full place-content-center gap-4 bg-bg p-8 text-center text-fg">
        <p className="text-xl font-bold">{TEXT.errorTitle}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mx-auto rounded-full bg-accent px-5 py-2.5 font-semibold text-accent-fg hover:bg-accent-strong"
        >
          {TEXT.reload}
        </button>
      </div>
    );
  }
}
