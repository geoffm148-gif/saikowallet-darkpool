/**
 * GlobalWCModals — renders WalletConnect request/proposal popups
 * at the app root so they appear on any screen, not just WalletConnectScreen.
 */
import React, { useContext, useState } from 'react';
import {
  Button,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import { IconAlertTriangle } from '../icons.js';
import { AppCtx } from '../context.js';
import { useWalletConnectContext } from './WalletConnectContext.js';
import { getActiveRpc } from '../utils/network.js';
import type { SessionProposal } from './useWalletConnect.js';
import type { WCRequest } from '@saiko-wallet/wallet-core';

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Overlay({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: SPACING[6],
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
      maxWidth: '440px', width: '100%',
      maxHeight: '80vh', overflow: 'auto',
    }}>
      {children}
    </div>
  );
}

// ── Proposal Modal ─────────────────────────────────────────────────────────────

function ProposalModal({ proposal }: { proposal: SessionProposal }): React.ReactElement {
  const wc = useWalletConnectContext();
  const ctx = useContext(AppCtx);
  return (
    <Overlay>
      <ModalCard>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING[4] }}>
          <img src={proposal.proposerIcon} alt="" style={{ width: 48, height: 48, borderRadius: RADIUS.lg }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.textPrimary, textAlign: 'center' }}>
            {proposal.proposerName}
          </div>
          <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, textAlign: 'center' }}>
            {proposal.proposerUrl}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2], color: COLORS.warning, fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.sans }}>
            <IconAlertTriangle size={14} /> Only connect to dApps you trust
          </div>
          <div style={{ display: 'flex', gap: SPACING[3], width: '100%' }}>
            <button onClick={() => void wc.rejectSession(proposal)} style={{ flex: 1, padding: `${SPACING[3]} ${SPACING[4]}`, backgroundColor: 'transparent', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, color: COLORS.textSecondary, fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, cursor: 'pointer' }}>
              Reject
            </button>
            <Button onClick={() => void wc.approveSession(proposal, ctx.walletAddress)} style={{ flex: 1 }}>
              Connect
            </Button>
          </div>
        </div>
      </ModalCard>
    </Overlay>
  );
}

// ── Request Modal ──────────────────────────────────────────────────────────────

function getLabel(method: string): string {
  const map: Record<string, string> = {
    personal_sign: 'Sign Message', eth_sign: 'Sign Message',
    eth_signTypedData: 'Sign Typed Data', eth_signTypedData_v4: 'Sign Typed Data',
    eth_sendTransaction: 'Send Transaction', eth_signTransaction: 'Sign Transaction',
  };
  return map[method] ?? method;
}

function RequestModal({ request }: { request: WCRequest }): React.ReactElement {
  const wc = useWalletConnectContext();
  const ctx = useContext(AppCtx);
  const [approving, setApproving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const params = Array.isArray(request.params) ? request.params : [request.params];
  const isTx = request.method === 'eth_sendTransaction' || request.method === 'eth_signTransaction';

  // Build human-readable preview
  let detail = '';
  if (request.method === 'personal_sign' || request.method === 'eth_sign') {
    const msg = params[0] as string;
    if (msg?.startsWith('0x')) {
      try { detail = new TextDecoder().decode(Buffer.from(msg.slice(2), 'hex')); } catch { detail = msg; }
    } else {
      detail = msg ?? '';
    }
  } else if (request.method === 'eth_signTypedData' || request.method === 'eth_signTypedData_v4') {
    detail = typeof params[1] === 'string' ? params[1] : JSON.stringify(params[1], null, 2);
  } else if (isTx) {
    const tx = params[0] as Record<string, string>;
    detail = JSON.stringify({ to: tx['to'], value: tx['value'], data: tx['data'] }, null, 2);
  }

  const truncated = !expanded && detail.length > 300;

  const handleApprove = () => {
    const privateKey = ctx.exportPrivateKey(ctx.activeAccountIndex);
    if (!privateKey) {
      ctx.addToast({ type: 'error', title: 'Wallet locked', message: 'Unlock your wallet first.' });
      return;
    }
    setApproving(true);
    wc.approveRequest(request, privateKey, getActiveRpc())
      .then(() => ctx.addToast({ type: 'success', title: 'Transaction sent', message: 'Broadcast successfully.' }))
      .catch((err: unknown) => ctx.addToast({ type: 'error', title: 'Approval failed', message: err instanceof Error ? err.message : 'Transaction failed' }))
      .finally(() => setApproving(false));
  };

  return (
    <Overlay>
      <ModalCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4] }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
            <img src={request.peerIcon} alt="" style={{ width: 36, height: 36, borderRadius: RADIUS.md }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div>
              <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary }}>
                {request.peerName}
              </div>
              <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary }}>
                {getLabel(request.method)}
              </div>
            </div>
          </div>

          {/* Data */}
          <div style={{ backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: SPACING[4], maxHeight: expanded ? 'none' : '200px', overflow: 'hidden', position: 'relative' }}>
            <pre style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
              {truncated ? detail.slice(0, 300) + '…' : detail}
            </pre>
            {truncated && (
              <button onClick={() => setExpanded(true)} style={{ background: 'none', border: 'none', color: COLORS.error, cursor: 'pointer', fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, padding: `${SPACING[1]} 0` }}>
                Show more
              </button>
            )}
          </div>

          {isTx && (
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2], color: COLORS.warning, fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.sans }}>
              <IconAlertTriangle size={14} /> This will broadcast a real transaction
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: SPACING[3], width: '100%' }}>
            <button
              onClick={() => void wc.rejectRequest(request)}
              disabled={approving}
              style={{ flex: 1, padding: `${SPACING[3]} ${SPACING[4]}`, backgroundColor: 'transparent', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, color: COLORS.textSecondary, fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, cursor: approving ? 'not-allowed' : 'pointer', opacity: approving ? 0.5 : 1 }}
            >
              Reject
            </button>
            <Button onClick={handleApprove} isLoading={approving} style={{ flex: 1 }}>
              {approving ? 'Broadcasting…' : 'Approve'}
            </Button>
          </div>
        </div>
      </ModalCard>
    </Overlay>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────────

export function GlobalWCModals(): React.ReactElement | null {
  const wc = useWalletConnectContext();
  if (wc.pendingProposal) return <ProposalModal proposal={wc.pendingProposal} />;
  if (wc.pendingRequest) return <RequestModal request={wc.pendingRequest} />;
  return null;
}
