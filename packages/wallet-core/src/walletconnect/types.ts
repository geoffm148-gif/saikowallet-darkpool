export interface WCSession {
  topic: string;
  peerName: string;
  peerDescription: string;
  peerUrl: string;
  peerIcon: string;
  chains: string[];
  methods: string[];
  connectedAt: number;
  expiresAt: number;
}

export interface WCRequest {
  id: number;
  topic: string;
  method: string;
  params: unknown;
  peerName: string;
  peerIcon: string;
}

export type WCRequestResult =
  | { type: 'signed'; result: string }
  | { type: 'sent'; txHash: string }
  | { type: 'rejected' };

export const SUPPORTED_METHODS = [
  'personal_sign',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v4',
  'eth_sendTransaction',
  'eth_signTransaction',
] as const;

export type SupportedMethod = typeof SUPPORTED_METHODS[number];
