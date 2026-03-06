import React, { useEffect, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { COLORS } from '../themes/colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from '../themes/typography.js';
import { SPACING, RADIUS } from '../themes/spacing.js';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  /** Auto-dismiss after this many ms (0 = never) */
  duration?: number;
}

export interface ToastProps extends ToastMessage {
  onDismiss: (id: string) => void;
}

interface ToastConfig {
  icon: string;
  borderColor: string;
  iconColor: string;
}

const TOAST_CONFIG: Record<ToastType, ToastConfig> = {
  success: { icon: '✓', borderColor: COLORS.success, iconColor: COLORS.success },
  error: { icon: '✕', borderColor: COLORS.error, iconColor: COLORS.error },
  warning: { icon: '!', borderColor: COLORS.warning, iconColor: COLORS.warning },
  info: { icon: 'i', borderColor: COLORS.primary, iconColor: COLORS.primary },
};

/** Individual toast notification */
export function Toast({
  id,
  type,
  title,
  message,
  duration = 4000,
  onDismiss,
}: ToastProps): React.ReactElement {
  useEffect(() => {
    if (duration === 0) return;
    const timer = window.setTimeout(() => onDismiss(id), duration);
    return () => window.clearTimeout(timer);
  }, [id, duration, onDismiss]);

  const { icon, borderColor, iconColor } = TOAST_CONFIG[type];

  const toastStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: SPACING[3],
    backgroundColor: COLORS.surfaceElevated,
    border: `1px solid ${COLORS.border}`,
    borderLeft: `3px solid ${borderColor}`,
    borderRadius: RADIUS.md,
    padding: SPACING[4],
    minWidth: '300px',
    maxWidth: '400px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  };

  const iconStyle: CSSProperties = {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: `${borderColor}20`,
    color: iconColor,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    flexShrink: 0,
    marginTop: '1px',
  };

  const bodyStyle: CSSProperties = { flex: 1, minWidth: 0 };

  const titleStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textPrimary,
    marginBottom: title !== undefined ? SPACING[1] : '0',
  };

  const messageStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: '1.4',
    wordBreak: 'break-word',
  };

  const closeStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: COLORS.textMuted,
    padding: '0',
    fontSize: '16px',
    lineHeight: 1,
    flexShrink: 0,
  };

  return (
    <div style={toastStyle} role="alert" aria-live="polite">
      <div style={iconStyle} aria-hidden="true">{icon}</div>
      <div style={bodyStyle}>
        {title !== undefined && <div style={titleStyle}>{title}</div>}
        <div style={messageStyle}>{message}</div>
      </div>
      <button
        style={closeStyle}
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}

export interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

/** Container for stacking multiple toasts — with AnimatePresence for slide-in/out */
export function ToastContainer({ toasts, onDismiss }: ToastContainerProps): React.ReactElement {
  const containerStyle: CSSProperties = {
    position: 'fixed',
    top: SPACING[4],
    right: SPACING[4],
    display: 'flex',
    flexDirection: 'column',
    gap: SPACING[3],
    zIndex: 9999,
    pointerEvents: 'none',
  };

  return (
    <div style={containerStyle} aria-label="Notifications">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            style={{ pointerEvents: 'auto' }}
            initial={{ opacity: 0, x: 60, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.96 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            layout
          >
            <Toast {...toast} onDismiss={onDismiss} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Simple hook for managing toast state */
export function useToasts(): {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
} {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const addToast = React.useCallback((toast: Omit<ToastMessage, 'id'>): void => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const dismissToast = React.useCallback((id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}
