import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HDNodeWallet, Mnemonic } from 'ethers';
import { COLORS } from '../src/constants/colors';
import { Card } from '../src/components/Card';
import { useWallet } from '../src/wallet/context';
import { useWalletConnect } from '../src/walletconnect/useWalletConnect';
import { DEFAULT_MAINNET_PROVIDERS } from '@saiko-wallet/wallet-core';
import type { WCSession, WCRequest } from '@saiko-wallet/wallet-core';
import type { SessionProposal } from '../src/walletconnect/useWalletConnect';

const RPC_URL = DEFAULT_MAINNET_PROVIDERS[0].url;

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

function timeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function derivePrivateKey(mnemonic: string, index: number): string {
  const hdWallet = HDNodeWallet.fromMnemonic(
    Mnemonic.fromPhrase(mnemonic),
    `m/44'/60'/0'/0/${index}`,
  );
  return hdWallet.privateKey;
}

export default function WalletConnectScreen() {
  const router = useRouter();
  const wallet = useWallet();
  const wc = useWalletConnect();
  const [uri, setUri] = useState('');

  const handleConnect = async () => {
    const trimmed = uri.trim();
    if (!trimmed.startsWith('wc:')) {
      Alert.alert('Invalid URI', 'URI must start with wc:');
      return;
    }
    await wc.pair(trimmed);
    setUri('');
  };

  const handleApproveSession = () => {
    if (!wc.pendingProposal) return;
    void wc.approveSession(wc.pendingProposal, wallet.address);
  };

  const handleRejectSession = () => {
    if (!wc.pendingProposal) return;
    void wc.rejectSession(wc.pendingProposal);
  };

  const handleApproveRequest = () => {
    if (!wc.pendingRequest || !wallet.mnemonic) return;
    const privateKey = derivePrivateKey(wallet.mnemonic, wallet.activeAccountIndex);
    void wc.approveRequest(wc.pendingRequest, privateKey, RPC_URL);
  };

  const handleRejectRequest = () => {
    if (!wc.pendingRequest) return;
    void wc.rejectRequest(wc.pendingRequest);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        gap: 12,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Ionicons name="link-outline" size={22} color={COLORS.text} />
        <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '600', flex: 1 }}>
          WalletConnect
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}
      >
        {/* Connect Section */}
        <Card>
          <View style={{ gap: 12 }}>
            <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '600' }}>
              Connect a dApp
            </Text>
            <Text style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 20 }}>
              Open any dApp, click &quot;Connect Wallet&quot; &rarr; &quot;WalletConnect&quot;, then paste the URI here.
            </Text>
            <TextInput
              placeholder="Paste WalletConnect URI (wc:...)"
              placeholderTextColor={COLORS.textMuted}
              value={uri}
              onChangeText={setUri}
              onSubmitEditing={() => void handleConnect()}
              style={{
                backgroundColor: COLORS.background,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: COLORS.text,
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                fontSize: 13,
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              onPress={() => void handleConnect()}
              disabled={wc.isConnecting || !uri.trim().startsWith('wc:')}
              style={{
                backgroundColor: wc.isConnecting || !uri.trim().startsWith('wc:') ? COLORS.textMuted : COLORS.primary,
                borderRadius: 10,
                paddingVertical: 14,
                alignItems: 'center',
              }}
              activeOpacity={0.7}
            >
              {wc.isConnecting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Connect</Text>
              )}
            </TouchableOpacity>
          </View>
        </Card>

        {/* Error */}
        {wc.error && (
          <View style={{
            backgroundColor: 'rgba(227,27,35,0.1)',
            borderWidth: 1,
            borderColor: 'rgba(227,27,35,0.3)',
            borderRadius: 10,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
            <Ionicons name="warning-outline" size={16} color="#E31B23" />
            <Text style={{ color: '#E31B23', fontSize: 13, flex: 1 }}>{wc.error}</Text>
          </View>
        )}

        {/* Active Sessions */}
        <Card>
          <View style={{ gap: 12 }}>
            <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '600' }}>
              Active Sessions
            </Text>
            {wc.sessions.length === 0 ? (
              <Text style={{ color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>
                No dApps connected
              </Text>
            ) : (
              wc.sessions.map((session) => (
                <SessionRow
                  key={session.topic}
                  session={session}
                  onDisconnect={() => void wc.disconnectSession(session.topic)}
                />
              ))
            )}
          </View>
        </Card>
      </ScrollView>

      {/* Session Proposal Modal */}
      <Modal visible={!!wc.pendingProposal} transparent animationType="fade">
        {wc.pendingProposal && (
          <ProposalSheet
            proposal={wc.pendingProposal}
            onApprove={handleApproveSession}
            onReject={handleRejectSession}
          />
        )}
      </Modal>

      {/* Request Modal */}
      <Modal visible={!!wc.pendingRequest} transparent animationType="fade">
        {wc.pendingRequest && (
          <RequestSheet
            request={wc.pendingRequest}
            onApprove={handleApproveRequest}
            onReject={handleRejectRequest}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

// ── Session Row ──────────────────────────────────────────────────────────────

function SessionRow({
  session,
  onDisconnect,
}: {
  session: WCSession;
  onDisconnect: () => void;
}) {
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    }}>
      <Image
        source={{ uri: session.peerIcon }}
        style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.background }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
          {session.peerName}
        </Text>
        <Text style={{ color: COLORS.textSecondary, fontSize: 12 }} numberOfLines={1}>
          {session.peerUrl} · {timeAgo(session.connectedAt)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onDisconnect}
        style={{
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}
        activeOpacity={0.7}
      >
        <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>Disconnect</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Proposal Bottom Sheet ───────────────────────────────────────────────────

function ProposalSheet({
  proposal,
  onApprove,
  onReject,
}: {
  proposal: SessionProposal;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    }}>
      <View style={{
        backgroundColor: COLORS.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        gap: 16,
      }}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Image
            source={{ uri: proposal.proposerIcon }}
            style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.background }}
            defaultSource={require('../assets/saiko-logo.png')}
          />
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
            {proposal.proposerName}
          </Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {proposal.proposerUrl}
          </Text>
        </View>

        <View style={{
          backgroundColor: COLORS.background,
          borderRadius: 10,
          padding: 14,
          gap: 6,
        }}>
          <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>Requested permissions</Text>
          <Text style={{ color: COLORS.text, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
            Chains: {[...proposal.requiredChains, ...proposal.optionalChains].join(', ') || 'eip155:1'}
          </Text>
          <Text style={{ color: COLORS.text, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
            Methods: {[...proposal.requiredMethods, ...proposal.optionalMethods].join(', ') || 'standard'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <Ionicons name="warning-outline" size={14} color="#FFA726" />
          <Text style={{ color: '#FFA726', fontSize: 12 }}>Only connect to dApps you trust</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            onPress={onReject}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: 'center',
            }}
            activeOpacity={0.7}
          >
            <Text style={{ color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' }}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onApprove}
            style={{
              flex: 1,
              backgroundColor: COLORS.primary,
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: 'center',
            }}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Approve</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Request Bottom Sheet ────────────────────────────────────────────────────

function RequestSheet({
  request,
  onApprove,
  onReject,
}: {
  request: WCRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const params = Array.isArray(request.params) ? request.params : [request.params];
  const isTx = request.method === 'eth_sendTransaction' || request.method === 'eth_signTransaction';
  const isSign = request.method === 'personal_sign' || request.method === 'eth_sign';
  const isTypedData = request.method === 'eth_signTypedData' || request.method === 'eth_signTypedData_v4';

  let detailContent = '';
  if (isSign) {
    const msg = params[0] as string;
    if (msg.startsWith('0x')) {
      try {
        const bytes = [];
        for (let i = 2; i < msg.length; i += 2) {
          bytes.push(parseInt(msg.substring(i, i + 2), 16));
        }
        detailContent = String.fromCharCode(...bytes);
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

  const truncated = !expanded && detailContent.length > 200;

  return (
    <View style={{
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    }}>
      <View style={{
        backgroundColor: COLORS.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        gap: 16,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Image
            source={{ uri: request.peerIcon }}
            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.background }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '600' }}>
              {request.peerName}
            </Text>
            <Text style={{ color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' }}>
              {getRequestTypeLabel(request.method)}
            </Text>
          </View>
        </View>

        <View style={{
          backgroundColor: COLORS.background,
          borderRadius: 10,
          padding: 14,
          maxHeight: expanded ? undefined : 180,
          overflow: 'hidden',
        }}>
          <Text style={{
            color: COLORS.text,
            fontSize: 12,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          }}>
            {truncated ? detailContent.slice(0, 200) + '...' : detailContent}
          </Text>
        </View>

        {truncated && (
          <TouchableOpacity onPress={() => setExpanded(true)}>
            <Text style={{ color: COLORS.primary, fontSize: 13 }}>Show more</Text>
          </TouchableOpacity>
        )}

        {isTx && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <Ionicons name="warning-outline" size={14} color="#FFA726" />
            <Text style={{ color: '#FFA726', fontSize: 12 }}>This will broadcast a real transaction</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            onPress={onReject}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: 'center',
            }}
            activeOpacity={0.7}
          >
            <Text style={{ color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' }}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onApprove}
            style={{
              flex: 1,
              backgroundColor: COLORS.primary,
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: 'center',
            }}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Approve</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
