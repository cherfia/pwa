'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '20px', 
          margin: '20px', 
          backgroundColor: '#fee', 
          border: '1px solid #f00',
          borderRadius: '8px',
          fontFamily: 'monospace',
          fontSize: '12px',
          wordBreak: 'break-word'
        }}>
          <h2 style={{ color: '#c00', marginBottom: '10px' }}>Client Error</h2>
          <p><strong>Message:</strong> {this.state.error?.message}</p>
          <p><strong>Name:</strong> {this.state.error?.name}</p>
          <pre style={{ 
            whiteSpace: 'pre-wrap', 
            backgroundColor: '#fff', 
            padding: '10px',
            marginTop: '10px',
            overflow: 'auto',
            maxHeight: '300px'
          }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
