import { useState, useEffect, useCallback, useRef } from 'react';
import type { IWeb3Wallet } from '@walletconnect/web3wallet';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import type { WCSession, WCRequest } from '@saiko-wallet/wallet-core';
import {
  SUPPORTED_METHODS,
  wcSignMessage,
  wcSignTypedData,
  parseSendTransactionRequest,
} from '@saiko-wallet/wallet-core';
import { ethers } from 'ethers';
import { getWalletConnectClient } from './client.js';

const LS_WC_SESSIONS = 'saiko_wc_sessions';

// WalletConnect SDK session proposal type
interface SessionProposalParams {
  id: number;
  params: {
    id: number;
    pairingTopic: string;
    expiryTimestamp: number;
    relays: Array<{ protocol: string; data?: string }>;
    proposer: {
      publicKey: string;
      metadata: {
        name: string;
        description: string;
        url: string;
        icons: string[];
      };
    };
    requiredNamespaces: Record<string, {
      chains?: string[];
      methods: string[];
      events: string[];
    }>;
    optionalNamespaces: Record<string, {
      chains?: string[];
      methods: string[];
      events: string[];
    }>;
  };
}

export interface SessionProposal {
  id: number;
  proposerName: string;
  proposerDescription: string;
  proposerUrl: string;
  proposerIcon: string;
  requiredChains: string[];
  requiredMethods: string[];
  optionalChains: string[];
  optionalMethods: string[];
  raw: SessionProposalParams;
}

interface SessionRequestEvent {
  id: number;
  topic: string;
  params: {
    request: {
      method: string;
      params: unknown;
    };
    chainId: string;
  };
}

export interface WCState {
  sessions: WCSession[];
  pendingRequest: WCRequest | null;
  pendingProposal: SessionProposal | null;
  isConnecting: boolean;
  error: string | null;
  pair: (uri: string) => Promise<void>;
  approveSession: (proposal: SessionProposal, address: string) => Promise<void>;
  rejectSession: (proposal: SessionProposal) => Promise<void>;
  approveRequest: (request: WCRequest, privateKey: string, rpcUrl: string) => Promise<void>;
  rejectRequest: (request: WCRequest) => Promise<void>;
  disconnectSession: (topic: string) => Promise<void>;
}

function loadPersistedSessions(): WCSession[] {
  try {
    const raw = localStorage.getItem(LS_WC_SESSIONS);
    if (!raw) return [];
    return JSON.parse(raw) as WCSession[];
  } catch {
    return [];
  }
}

function persistSessions(sessions: WCSession[]): void {
  localStorage.setItem(LS_WC_SESSIONS, JSON.stringify(sessions));
}

function toSessionProposal(event: SessionProposalParams): SessionProposal {
  const { params } = event;
  const meta = params.proposer.metadata;
  const reqNs = params.requiredNamespaces['eip155'];
  const optNs = params.optionalNamespaces['eip155'];
  return {
    id: event.id,
    proposerName: meta.name,
    proposerDescription: meta.description,
    proposerUrl: meta.url,
    proposerIcon: meta.icons[0] ?? '',
    requiredChains: reqNs?.chains ?? [],
    requiredMethods: reqNs?.methods ?? [],
    optionalChains: optNs?.chains ?? [],
    optionalMethods: optNs?.methods ?? [],
    raw: event,
  };
}

export function useWalletConnect(): WCState {
  const [sessions, setSessions] = useState<WCSession[]>(loadPersistedSessions);
  const [pendingRequest, setPendingRequest] = useState<WCRequest | null>(null);
  const [pendingProposal, setPendingProposal] = useState<SessionProposal | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<IWeb3Wallet | null>(null);

  // Sync active sessions from SDK
  const syncSessions = useCallback((wc: IWeb3Wallet) => {
    const active = wc.getActiveSessions();
    const synced: WCSession[] = Object.values(active).map((s) => ({
      topic: s.topic,
      peerName: s.peer.metadata.name,
      peerDescription: s.peer.metadata.description,
      peerUrl: s.peer.metadata.url,
      peerIcon: s.peer.metadata.icons[0] ?? '',
      chains: Object.keys(s.namespaces).flatMap((ns) =>
        s.namespaces[ns]?.chains ?? [`${ns}:1`]
      ),
      methods: Object.keys(s.namespaces).flatMap((ns) =>
        s.namespaces[ns]?.methods ?? []
      ),
      connectedAt: (s.expiry - 604800) * 1000, // approx: expiry - 7 days
      expiresAt: s.expiry * 1000,
    }));
    setSessions(synced);
    persistSessions(synced);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const wc = await getWalletConnectClient();
        if (!mounted) return;
        clientRef.current = wc;
        syncSessions(wc);

        wc.on('session_proposal', (event: SessionProposalParams) => {
          if (!mounted) return;
          setPendingProposal(toSessionProposal(event));
        });

        wc.on('session_request', (event: SessionRequestEvent) => {
          if (!mounted) return;
          const { id, topic, params } = event;
          const { method, params: reqParams } = params.request;

          // Find peer info
          const active = wc.getActiveSessions();
          const session = active[topic];
          const peerName = session?.peer.metadata.name ?? 'Unknown dApp';
          const peerIcon = session?.peer.metadata.icons[0] ?? '';

          setPendingRequest({
            id,
            topic,
            method,
            params: reqParams,
            peerName,
            peerIcon,
          });
        });

        wc.on('session_delete', () => {
          if (!mounted) return;
          syncSessions(wc);
        });
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'WalletConnect init failed');
      }
    }

    void init();
    return () => {
      mounted = false;
      // Do NOT disconnect sessions on unmount — user may navigate away and return.
      // Sessions are persisted in localStorage and re-synced from SDK on remount.
    };
  }, [syncSessions]);

  const pair = useCallback(async (uri: string) => {
    setError(null);
    setIsConnecting(true);
    try {
      const wc = clientRef.current ?? await getWalletConnectClient();
      clientRef.current = wc;
      await wc.pair({ uri });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pairing failed');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const approveSession = useCallback(async (proposal: SessionProposal, address: string) => {
    try {
      const wc = clientRef.current;
      if (!wc) throw new Error('WalletConnect not initialized');

      const supportedMethods = [...SUPPORTED_METHODS];
      const supportedEvents = ['chainChanged', 'accountsChanged'];
      const supportedChains = ['eip155:1'];
      const accounts = supportedChains.map((chain) => `${chain}:${address}`);

      const namespaces = buildApprovedNamespaces({
        proposal: proposal.raw.params,
        supportedNamespaces: {
          eip155: {
            chains: supportedChains,
            methods: supportedMethods,
            events: supportedEvents,
            accounts,
          },
        },
      });

      await wc.approveSession({ id: proposal.id, namespaces });
      setPendingProposal(null);
      syncSessions(wc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Session approval failed');
    }
  }, [syncSessions]);

  const rejectSession = useCallback(async (proposal: SessionProposal) => {
    try {
      const wc = clientRef.current;
      if (!wc) return;
      await wc.rejectSession({ id: proposal.id, reason: getSdkError('USER_REJECTED') });
      setPendingProposal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Session rejection failed');
    }
  }, []);

  const approveRequest = useCallback(async (request: WCRequest, privateKey: string, rpcUrl: string) => {
    try {
      const wc = clientRef.current;
      if (!wc) throw new Error('WalletConnect not initialized');

      const { method, params, id, topic } = request;
      const paramsList = Array.isArray(params) ? params : [params];
      let result: string;

      if (method === 'eth_sign') {
        // eth_sign is disabled — it signs raw 32-byte hashes without a prefix,
        // which can be used to forge transactions. Reject with 4200 Method Not Supported.
        await wc.respondSessionRequest({
          topic,
          response: { id, jsonrpc: '2.0', error: { code: 4200, message: 'eth_sign is not supported. Use personal_sign or eth_signTypedData_v4.' } },
        });
        setPendingRequest(null);
        return;
      } else if (method === 'personal_sign') {
        result = wcSignMessage(privateKey, paramsList as unknown[], method);
      } else if (method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
        result = await wcSignTypedData(privateKey, paramsList as unknown[]);
      } else if (method === 'eth_sendTransaction') {
        const parsed = parseSendTransactionRequest(paramsList as unknown[]);

        // Try primary RPC then fall back to publicnode
        const fallbackRpcs = [rpcUrl, 'https://ethereum.publicnode.com', 'https://1rpc.io/eth'];
        let tx: Awaited<ReturnType<ethers.Wallet['sendTransaction']>> | null = null;
        let lastErr: unknown;
        for (const url of fallbackRpcs) {
          try {
            const provider = new ethers.JsonRpcProvider(url);
            const wallet = new ethers.Wallet(privateKey, provider);
            tx = await wallet.sendTransaction({
              to: parsed.to,
              value: parsed.value,
              data: parsed.data,
              gasLimit: parsed.gas ?? 300_000n,
              type: 2, // EIP-1559
            });
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!tx) throw lastErr;
        result = tx.hash;
      } else if (method === 'eth_signTransaction') {
        const parsed = parseSendTransactionRequest(paramsList as unknown[]);
        const wallet = new ethers.Wallet(privateKey);
        result = await wallet.signTransaction({
          to: parsed.to,
          value: parsed.value,
          data: parsed.data,
          gasLimit: parsed.gas,
        });
      } else {
        // Unsupported method
        await wc.respondSessionRequest({
          topic,
          response: {
            id,
            jsonrpc: '2.0',
            error: { code: 4200, message: 'Method not supported' },
          },
        });
        setPendingRequest(null);
        return;
      }

      await wc.respondSessionRequest({
        topic,
        response: { id, jsonrpc: '2.0', result },
      });
      setPendingRequest(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request approval failed');
    }
  }, []);

  const rejectRequest = useCallback(async (request: WCRequest) => {
    try {
      const wc = clientRef.current;
      if (!wc) return;
      await wc.respondSessionRequest({
        topic: request.topic,
        response: {
          id: request.id,
          jsonrpc: '2.0',
          error: { code: 4001, message: 'User rejected' },
        },
      });
      setPendingRequest(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request rejection failed');
    }
  }, []);

  const disconnectSession = useCallback(async (topic: string) => {
    try {
      const wc = clientRef.current;
      if (!wc) return;
      await wc.disconnectSession({ topic, reason: getSdkError('USER_DISCONNECTED') });
      syncSessions(wc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    }
  }, [syncSessions]);

  return {
    sessions,
    pendingRequest,
    pendingProposal,
    isConnecting,
    error,
    pair,
    approveSession,
    rejectSession,
    approveRequest,
    rejectRequest,
    disconnectSession,
  };
}
