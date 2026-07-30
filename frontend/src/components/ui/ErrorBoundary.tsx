import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };
  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Optionally show toast
    // Note: We can't use useToast here since it's a class component
    // You could use a ref to a toast function or use a separate toast service
  }

  private resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return React.createElement(this.props.fallback, {
          error: this.state.error!,
          resetError: this.resetError,
        });
      }

      return (
        <div className="error-boundary-fallback" role="alert">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message || 'An unexpected error occurred'}</p>
          <button onClick={this.resetError} className="btn-primary">
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

// Functional component alternative for hooks
export function ErrorBoundaryWrapper({ 
  children, 
  fallback 
}: { 
  children: ReactNode; 
  fallback?: (error: Error, resetError: () => void) => ReactNode; 
}) {
  const [error, setError] = React.useState<Error | null>(null);

  if (error) {
    if (fallback) {
      return <>{fallback(error, () => setError(null))}</>;
    }
    return (
      <div className="error-boundary-fallback" role="alert">
        <h2>Something went wrong</h2>
        <p>{error.message || 'An unexpected error occurred'}</p>
        <button onClick={() => setError(null)} className="btn-primary">
          Try again
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

// Hook for functional error handling
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);
  
  const handleError = React.useCallback((err: Error) => {
    setError(err);
    console.error('Error caught by handler:', err);
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  return { error, handleError, clearError };
}