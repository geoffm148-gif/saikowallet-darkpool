import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@saiko-wallet/ui-kit';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Saiko Wallet] Error boundary caught:', error, info);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '360px', height: '600px', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: COLORS.background, color: COLORS.error,
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
          padding: SPACING[4], textAlign: 'center', gap: SPACING[3],
        }}>
          <div style={{ fontSize: '32px' }}>!</div>
          <div>Something went wrong</div>
          <div style={{ fontSize: '11px', color: COLORS.textMuted, wordBreak: 'break-all' }}>
            {this.state.error?.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: COLORS.primary, color: '#fff', border: 'none',
              padding: `${SPACING[2]} ${SPACING[4]}`, borderRadius: '6px',
              cursor: 'pointer', fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
