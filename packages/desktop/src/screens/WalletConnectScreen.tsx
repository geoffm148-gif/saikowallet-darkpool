import React, { useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import { DEFAULT_MAINNET_PROVIDERS } from '@saiko-wallet/wallet-core';
import { getActiveRpc } from '../utils/network.js';
import { IconArrowLeft, IconLink2, IconX, IconAlertTriangle } from '../icons.js';
import { AppCtx } from '../context.js';
import type { SessionProposal } from '../walletconnect/useWalletConnect.js';
import { useWalletConnectContext } from '../walletconnect/WalletConnectContext.js';
import type { WCRequest, WCSession } from '@saiko-wallet/wallet-core';

const PAGE_STYLE: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: COLORS.background,
  display: 'flex',
  flexDirection: 'column',
};

const CONTENT_STYLE: CSSProperties = {
  maxWidth: '720px',
  width: '100%',
  margin: '0 auto',
  padding: `${SPACING[6]} ${SPACING[6]}`,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING[6],
};

// RPC resolved dynamically at call time via getActiveRpc() — see handleApproveRequest

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ onBack }: { onBack: () => void }): React.ReactElement {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: SPACING[3],
      padding: `${SPACING[4]} ${SPACING[6]}`,
      backgroundColor: COLORS.surface,
      borderBottom: `1px solid ${COLORS.border}`,
    }}>
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          color: COLORS.textSecondary,
          cursor: 'pointer',
          padding: SPACING[2],
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <IconArrowLeft size={20} />
      </button>
      <IconLink2 size={22} color={COLORS.textPrimary} />
      <span style={{
        fontFamily: FONT_FAMILY.sans,
        fontSize: FONT_SIZE.lg,
        fontWeight: FONT_WEIGHT.semibold,
        color: COLORS.textPrimary,
      }}>
        WalletConnect
      </span>
    </div>
  );
}

// ── Connect Section ───────────────────────────────────────────────────────────

function ConnectSection({
  onPair,
  isConnecting,
}: {
  onPair: (uri: string) => Promise<void>;
  isConnecting: boolean;
}): React.ReactElement {
  const [uri, setUri] = useState('');

  const handleConnect = async () => {
    const trimmed = uri.trim();
    if (!trimmed.startsWith('wc:')) return;
    await onPair(trimmed);
    setUri('');
  };

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4] }}>
        <span style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.base,
          fontWeight: FONT_WEIGHT.semibold,
          color: COLORS.textPrimary,
        }}>
          Connect a dApp
        </span>
        <span style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.sm,
          color: COLORS.textSecondary,
          lineHeight: 1.5,
        }}>
          Open any dApp and click &quot;Connect Wallet&quot; &rarr; &quot;WalletConnect&quot;, then paste the URI here.
        </span>
        <div style={{ display: 'flex', gap: SPACING[3] }}>
          <input
            type="text"
            placeholder="Paste WalletConnect URI (wc:...)"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect(); }}
            style={{
              flex: 1,
              backgroundColor: COLORS.background,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.md,
              padding: `${SPACING[3]} ${SPACING[4]}`,
              color: COLORS.textPrimary,
              fontFamily: FONT_FAMILY.mono,
              fontSize: FONT_SIZE.sm,
              outline: 'none',
            }}
          />
          <Button
            onClick={() => void handleConnect()}
            disabled={isConnecting || !uri.trim().startsWith('wc:')}
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── Active Sessions ──────────────────────────────────────────────────────────

function SessionRow({
  session,
  onDisconnect,
}: {
  session: WCSession;
  onDisconnect: () => void;
}): React.ReactElement {
  const connectedAgo = Math.floor((Date.now() - session.connectedAt) / 60000);
  const agoText = connectedAgo < 1 ? 'just now' : connectedAgo < 60 ? `${connectedAgo}m ago` : `${Math.floor(connectedAgo / 60)}h ago`;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: SPACING[4],
      padding: `${SPACING[3]} 0`,
      borderBottom: `1px solid ${COLORS.border}`,
    }}>
      <img
        src={session.peerIcon}
        alt=""
        style={{ width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: COLORS.background }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.sm,
          fontWeight: FONT_WEIGHT.semibold,
          color: COLORS.textPrimary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {session.peerName}
        </div>
        <div style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.xs,
          color: COLORS.textSecondary,
        }}>
          {session.peerUrl} &middot; Connected {agoText}
        </div>
      </div>
      <button
        onClick={onDisconnect}
        style={{
          background: 'none',
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.md,
          color: COLORS.textSecondary,
          cursor: 'pointer',
          padding: `${SPACING[2]} ${SPACING[3]}`,
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.xs,
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#E31B23'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.textSecondary; }}
      >
        Disconnect
      </button>
    </div>
  );
}

function ActiveSessions({
  sessions,
  onDisconnect,
}: {
  sessions: WCSession[];
  onDisconnect: (topic: string) => void;
}): React.ReactElement {
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3] }}>
        <span style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.base,
          fontWeight: FONT_WEIGHT.semibold,
          color: COLORS.textPrimary,
        }}>
          Active Sessions
        </span>
        {sessions.length === 0 ? (
          <span style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.textSecondary,
            padding: `${SPACING[4]} 0`,
            textAlign: 'center',
          }}>
            No dApps connected
          </span>
        ) : (
          sessions.map((s) => (
            <SessionRow
              key={s.topic}
              session={s}
              onDisconnect={() => onDisconnect(s.topic)}
            />
          ))
        )}
      </div>
    </Card>
  );
}

// ── Session Proposal Modal ──────────────────────────────────────────────────

function ProposalModal({
  proposal,
  onApprove,
  onReject,
}: {
  proposal: SessionProposal;
  onApprove: () => void;
  onReject: () => void;
}): React.ReactElement {
  return (
    <Overlay>
      <ModalCard>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING[4] }}>
          <img
            src={proposal.proposerIcon}
            alt=""
            style={{ width: 48, height: 48, borderRadius: RADIUS.lg, backgroundColor: COLORS.background }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.lg,
            fontWeight: FONT_WEIGHT.bold,
            color: COLORS.textPrimary,
            textAlign: 'center',
          }}>
            {proposal.proposerName}
          </span>
          <span style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.textSecondary,
            textAlign: 'center',
          }}>
            {proposal.proposerUrl}
          </span>
          <span style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.textSecondary,
            textAlign: 'center',
          }}>
            {proposal.proposerDescription}
          </span>

          <div style={{
            width: '100%',
            backgroundColor: COLORS.background,
            borderRadius: RADIUS.md,
            padding: SPACING[4],
          }}>
            <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textSecondary }}>
              Requested permissions
            </span>
            <div style={{ marginTop: SPACING[2], fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary }}>
              Chains: {[...proposal.requiredChains, ...proposal.optionalChains].join(', ') || 'eip155:1'}
            </div>
            <div style={{ marginTop: SPACING[1], fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary }}>
              Methods: {[...proposal.requiredMethods, ...proposal.optionalMethods].join(', ') || 'standard'}
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: SPACING[2],
            color: COLORS.warning,
            fontSize: FONT_SIZE.xs,
            fontFamily: FONT_FAMILY.sans,
          }}>
            <IconAlertTriangle size={14} />
            Only connect to dApps you trust
          </div>

          <div style={{ display: 'flex', gap: SPACING[3], width: '100%' }}>
            <button
              onClick={onReject}
              style={{
                flex: 1,
                padding: `${SPACING[3]} ${SPACING[4]}`,
                backgroundColor: 'transparent',
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.md,
                color: COLORS.textSecondary,
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                cursor: 'pointer',
              }}
            >
              Reject
            </button>
            <Button onClick={onApprove} style={{ flex: 1 }}>
              Approve
            </Button>
          </div>
        </div>
      </ModalCard>
    </Overlay>
  );
}

// ── Request Modal ────────────────────────────────────────────────────────────

function getRequestTypeLabel(method: string): string {
  switch (method) {
    case 'personal_sign':
    case 'eth_sign':
      return 'Sign Message';
    case 'eth_signTypedData':
    case 'eth_signTypedData_v4':
      return 'Sign Typed Data';
    case 'eth_sendTransaction':
      return 'Send Transaction';
    case 'eth_signTransaction':
      return 'Sign Transaction';
    default:
      return method;
  }
}

function RequestModal({
  request,
  onApprove,
  onReject,
  isApproving,
}: {
  request: WCRequest;
  onApprove: () => void;
  onReject: () => void;
  isApproving?: boolean;
}): React.ReactElement {
  const params = Array.isArray(request.params) ? request.params : [request.params];
  const isTx = request.method === 'eth_sendTransaction' || request.method === 'eth_signTransaction';
  const isSign = request.method === 'personal_sign' || request.method === 'eth_sign';
  const isTypedData = request.method === 'eth_signTypedData' || request.method === 'eth_signTypedData_v4';
  const [expanded, setExpanded] = useState(false);

  let detailContent = '';
  if (isSign) {
    const msg = params[0] as string;
    if (msg.startsWith('0x')) {
      try {
        detailContent = new TextDecoder().decode(Buffer.from(msg.slice(2), 'hex'));
      } catch {
        detailContent = msg;
      }
    } else {
      detailContent = msg;
    }
  } else if (isTypedData) {
    detailContent = typeof params[1] === 'string' ? params[1] : JSON.stringify(params[1], null, 2);
  } else if (isTx) {
    const tx = params[0] as Record<string, string>;
    detailContent = JSON.stringify({ to: tx['to'], value: tx['value'], data: tx['data'] }, null, 2);
  }

  const truncated = !expanded && detailContent.length > 300;

  return (
    <Overlay>
      <ModalCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
            <img
              src={request.peerIcon}
              alt=""
              style={{ width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: COLORS.background }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div>
              <div style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.base,
                fontWeight: FONT_WEIGHT.semibold,
                color: COLORS.textPrimary,
              }}>
                {request.peerName}
              </div>
              <div style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                fontWeight: FONT_WEIGHT.semibold,
                color: COLORS.textSecondary,
              }}>
                {getRequestTypeLabel(request.method)}
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: COLORS.background,
            borderRadius: RADIUS.md,
            padding: SPACING[4],
            maxHeight: expanded ? 'none' : '200px',
            overflow: 'hidden',
            position: 'relative',
          }}>
            <pre style={{
              fontFamily: FONT_FAMILY.mono,
              fontSize: FONT_SIZE.xs,
              color: COLORS.textPrimary,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0,
            }}>
              {truncated ? detailContent.slice(0, 300) + '...' : detailContent}
            </pre>
            {truncated && (
              <button
                onClick={() => setExpanded(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: COLORS.error,
                  cursor: 'pointer',
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.xs,
                  padding: `${SPACING[1]} 0`,
                }}
              >
                Show more
              </button>
            )}
          </div>

          {isTx && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: SPACING[2],
              color: COLORS.warning,
              fontSize: FONT_SIZE.xs,
              fontFamily: FONT_FAMILY.sans,
            }}>
              <IconAlertTriangle size={14} />
              This will broadcast a real transaction
            </div>
          )}

          <div style={{ display: 'flex', gap: SPACING[3], width: '100%' }}>
            <button
              onClick={onReject}
              disabled={isApproving}
              style={{
                flex: 1,
                padding: `${SPACING[3]} ${SPACING[4]}`,
                backgroundColor: 'transparent',
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.md,
                color: COLORS.textSecondary,
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                cursor: isApproving ? 'not-allowed' : 'pointer',
                opacity: isApproving ? 0.5 : 1,
              }}
            >
              Reject
            </button>
            <Button onClick={onApprove} isLoading={isApproving} style={{ flex: 1 }}>
              {isApproving ? 'Broadcasting…' : 'Approve'}
            </Button>
          </div>
        </div>
      </ModalCard>
    </Overlay>
  );
}

// ── Shared modal helpers ─────────────────────────────────────────────────────

function Overlay({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: SPACING[6],
    }}>
      {children}
    </div>
  );
}

function ModalCard({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{
      backgroundColor: COLORS.surface,
      borderRadius: RADIUS.lg,
      border: `1px solid ${COLORS.border}`,
      padding: SPACING[6],
      maxWidth: '440px',
      width: '100%',
      maxHeight: '80vh',
      overflow: 'auto',
    }}>
      {children}
    </div>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export function WalletConnectScreen(): React.ReactElement {
  const navigate = useNavigate();
  const ctx = useContext(AppCtx);
  const wc = useWalletConnectContext();
  const [approvingRequest, setApprovingRequest] = React.useState(false);

  // M-8: Surface WC errors as toasts
  const prevErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (wc.error && wc.error !== prevErrorRef.current) {
      ctx.addToast({ type: 'error', message: wc.error });
    }
    prevErrorRef.current = wc.error;
  }, [wc.error, ctx]);

  // Request/proposal modals are handled globally by GlobalWCModals in App.tsx

  return (
    <div style={PAGE_STYLE}>
      <Header onBack={() => navigate('/dashboard')} />
      <div style={CONTENT_STYLE}>
        <ConnectSection onPair={wc.pair} isConnecting={wc.isConnecting} />

        {wc.error && (
          <div style={{
            backgroundColor: `${COLORS.error}1A`,
            border: `1px solid ${COLORS.error}4D`,
            borderRadius: RADIUS.md,
            padding: `${SPACING[3]} ${SPACING[4]}`,
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.error,
            display: 'flex',
            alignItems: 'center',
            gap: SPACING[2],
          }}>
            <IconAlertTriangle size={14} />
            {wc.error}
          </div>
        )}

        <ActiveSessions sessions={wc.sessions} onDisconnect={(topic) => void wc.disconnectSession(topic)} />
      </div>

      {/* Modals rendered globally via GlobalWCModals in App.tsx */}
    </div>
  );
}
