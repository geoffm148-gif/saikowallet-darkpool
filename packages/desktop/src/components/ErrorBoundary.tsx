import React from 'react';
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS } from '@saiko-wallet/ui-kit';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[Saiko Wallet] Unhandled error:', error, info.componentStack);
  }

  override render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0A0A0A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING[6],
      }}>
        <div style={{
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: SPACING[5],
        }}>
          <img
            src="/assets/saiko-logo-transparent.png"
            alt="Saiko"
            style={{ width: '72px', height: '72px', objectFit: 'contain', opacity: 0.8 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <h1 style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE['2xl'],
            fontWeight: FONT_WEIGHT.bold,
            color: '#E31B23',
            margin: 0,
            textTransform: 'uppercase',
          }}>
            Something went wrong
          </h1>
          <p style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.base,
            color: COLORS.textMuted,
            margin: 0,
            lineHeight: '1.5',
          }}>
            An unexpected error occurred. Your funds are safe — this is a display issue only.
          </p>

          {this.state.error && (
            <div style={{ width: '100%' }}>
              <button
                onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: COLORS.textMuted,
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.sm,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                {this.state.showDetails ? 'Hide error details' : 'Show error details'}
              </button>
              {this.state.showDetails && (
                <pre style={{
                  marginTop: SPACING[3],
                  backgroundColor: '#141414',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.md,
                  padding: SPACING[4],
                  fontFamily: FONT_FAMILY.mono,
                  fontSize: FONT_SIZE.xs,
                  color: COLORS.error,
                  textAlign: 'left',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}>
                  {this.state.error.message}
                  {this.state.error.stack && `\n\n${this.state.error.stack}`}
                </pre>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: SPACING[3], width: '100%' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                flex: 1,
                padding: `${SPACING[3]} ${SPACING[4]}`,
                backgroundColor: '#E31B23',
                color: '#fff',
                border: 'none',
                borderRadius: RADIUS.md,
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.base,
                fontWeight: FONT_WEIGHT.semibold,
                cursor: 'pointer',
              }}
            >
              Reload App
            </button>
            <a
              href="mailto:support@saikowallet.app?subject=Bug Report"
              style={{
                flex: 1,
                padding: `${SPACING[3]} ${SPACING[4]}`,
                backgroundColor: 'transparent',
                color: COLORS.textSecondary,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.md,
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.base,
                fontWeight: FONT_WEIGHT.medium,
                cursor: 'pointer',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Report Issue
            </a>
          </div>
        </div>
      </div>
    );
  }
}
