import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          padding: 40,
          textAlign: 'center',
          color: 'var(--blood, #c44)',
          fontFamily: 'var(--font-ui, sans-serif)',
          background: 'var(--void, #0a0a0a)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}>
          <div style={{ fontSize: 'calc(18px * var(--system-ratio, 1))', fontFamily: 'var(--font-heading, Georgia)' }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 'calc(12px * var(--system-ratio, 1))', color: 'var(--ink-subtle, #888)', maxWidth: 500, wordBreak: 'break-word' }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 12,
              padding: '8px 24px',
              background: 'transparent',
              border: '1px solid var(--gold, #c4a855)',
              color: 'var(--gold, #c4a855)',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui, sans-serif)',
              fontSize: 'calc(12px * var(--system-ratio, 1))',
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
