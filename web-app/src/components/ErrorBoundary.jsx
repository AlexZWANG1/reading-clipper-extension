import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#71717a' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#18181b' }}>
            页面出错了
          </h2>
          <p style={{ marginBottom: '1rem' }}>
            {this.state.error?.message || '发生了未知错误'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d4d4d8',
              borderRadius: '0.375rem',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
