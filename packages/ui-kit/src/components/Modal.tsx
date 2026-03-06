import React, { useEffect, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { COLORS } from '../themes/colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from '../themes/typography.js';
import { SPACING, RADIUS } from '../themes/spacing.js';

export interface ModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Called when backdrop or close button is clicked */
  onClose: () => void;
  /** Modal title */
  title?: string;
  /** Modal contents */
  children: React.ReactNode;
  /** Width of the modal */
  width?: string | number;
  /** Hide the close button */
  hideCloseButton?: boolean;
  /** Footer content (e.g., action buttons) */
  footer?: React.ReactNode;
}

/** Overlay modal with backdrop and close button */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  width = 480,
  hideCloseButton = false,
  footer,
}: ModalProps): React.ReactElement | null {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const backdropStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: SPACING[4],
    backdropFilter: 'blur(4px)',
  };

  const panelStyle: CSSProperties = {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.xl,
    border: `1px solid ${COLORS.border}`,
    width: typeof width === 'number' ? `${width}px` : width,
    maxWidth: '100%',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${SPACING[4]} ${SPACING[6]}`,
    borderBottom: `1px solid ${COLORS.border}`,
    flexShrink: 0,
  };

  const titleStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textPrimary,
    margin: 0,
  };

  const closeButtonStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: COLORS.textSecondary,
    padding: SPACING[2],
    borderRadius: RADIUS.sm,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    fontSize: '20px',
    transition: 'color 0.15s ease',
  };

  const bodyStyle: CSSProperties = {
    padding: SPACING[6],
    overflowY: 'auto',
    flex: 1,
  };

  const footerStyle: CSSProperties = {
    padding: `${SPACING[4]} ${SPACING[6]}`,
    borderTop: `1px solid ${COLORS.border}`,
    display: 'flex',
    gap: SPACING[3],
    justifyContent: 'flex-end',
    flexShrink: 0,
  };

  const stopPropagation = (e: React.MouseEvent): void => e.stopPropagation();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          style={backdropStyle}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            style={panelStyle}
            onClick={stopPropagation}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {(title !== undefined || !hideCloseButton) && (
              <div style={headerStyle}>
                {title !== undefined && <h2 style={titleStyle}>{title}</h2>}
                {!hideCloseButton && (
                  <button
                    style={closeButtonStyle}
                    onClick={onClose}
                    aria-label="Close modal"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
            <div style={bodyStyle}>{children}</div>
            {footer !== undefined && <div style={footerStyle}>{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
