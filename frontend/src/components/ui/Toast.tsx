import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { CheckIcon, XIcon, WarnIcon, InfoIcon } from './icons'
import './Toast.css'

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, 'id'>) => string;
  hideToast: (id: string) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000,
    };
    setToasts(prev => [...prev, newToast]);
    return id;
  }, []);

  const hideToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, hideToast, removeToast, clearToasts }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({ toast, removeToast }: { toast: Toast; removeToast: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), toast.duration ?? 5000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, removeToast]);

  const icons = {
    success: <CheckIcon size={14} />,
    error: <XIcon size={14} />,
    warning: <WarnIcon size={14} />,
    info: <InfoIcon size={14} />,
  } as const;

  return (
    <div className={`toast toast-${toast.type}`} role="alert">
      <span className="toast-icon" aria-hidden="true">{icons[toast.type]}</span>
      <div className="toast-content">
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
      {toast.action && (
        <button className="toast-action" onClick={() => { toast.action!.onClick(); removeToast(toast.id); }}>
          {toast.action.label}
        </button>
      )}
      <button className="toast-close" onClick={() => removeToast(toast.id)} aria-label="Dismiss">
        <XIcon size={12} />
      </button>
    </div>
  );
}