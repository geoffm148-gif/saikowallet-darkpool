import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  Linking,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/colors';
import { Card } from '../../src/components/Card';
import { AddressChip } from '../../src/components/AddressChip';
import { useWallet } from '../../src/wallet/context';
import { AccountSwitcher } from '../../src/components/AccountSwitcher';
import { fetchTxHistory, type TxRecord } from '../../src/wallet/history';

const ACTION_ITEMS = [
  { icon: 'arrow-up-outline' as const, label: 'Send', route: '/send' as const },
  { icon: 'arrow-down-outline' as const, label: 'Receive', route: '/receive' as const },
  { icon: 'swap-horizontal-outline' as const, label: 'Swap', route: '/(tabs)/swap' as const },
  { icon: 'shield-outline' as const, label: 'DarkPool', route: '/(tabs)/darkpool' as const },
  { icon: 'link-outline' as const, label: 'WalletConnect', route: '/walletconnect' as const },
];

const TX_COLORS = {
  receive: COLORS.success,
  send: COLORS.error,
  swap: COLORS.info,
};

const TX_ICONS = {
  receive: 'arrow-down-outline' as const,
  send: 'arrow-up-outline' as const,
  swap: 'swap-horizontal-outline' as const,
};

const AVATAR_COLORS = ['#E31B23', '#627EEA', '#22C55E', '#F59E0B', '#8B5CF6', '#06B6D4'];
function getAccountColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function timeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function DashboardScreen() {
  const router = useRouter();
  const wallet = useWallet();
  const [accountSwitcherVisible, setAccountSwitcherVisible] = useState(false);
  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState(false);

  const activeAccount = wallet.accounts.find(a => a.index === wallet.activeAccountIndex) ?? wallet.accounts[0];

  useEffect(() => {
    if (!wallet.address) return;
    setTxLoading(true);
    setTxError(false);
    fetchTxHistory(wallet.address)
      .then(setTxHistory)
      .catch(() => setTxError(true))
      .finally(() => setTxLoading(false));
  }, [wallet.address, wallet.activeAccountIndex]);

  const onRefresh = useCallback(() => {
    void wallet.reload();
    if (wallet.address) {
      setTxLoading(true);
      setTxError(false);
      fetchTxHistory(wallet.address)
        .then(setTxHistory)
        .catch(() => setTxError(true))
        .finally(() => setTxLoading(false));
    }
  }, [wallet]);

  const handleRename = useCallback((index: number) => {
    const acct = wallet.accounts.find(a => a.index === index);
    if (!acct) return;
    Alert.prompt?.(
      'Rename Account',
      'Enter a new name:',
      (newName: string) => {
        if (newName?.trim()) wallet.renameAccount(index, newName);
      },
      'plain-text',
      acct.name,
    );
  }, [wallet]);

  const handleRemove = useCallback((index: number) => {
    Alert.alert(
      'Remove Account',
      'Are you sure? This will remove the account from your wallet. You can always re-add it later since it shares the same seed phrase.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => wallet.removeAccount(index) },
      ],
    );
  }, [wallet]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={wallet.isBalanceLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image
              source={require('../../assets/saiko-logo-transparent.png')}
              style={{ width: 32, height: 32 }}
              resizeMode="contain"
            />
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text, letterSpacing: 1 }}>
              Saiko Wallet
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {activeAccount ? (
              <TouchableOpacity
                onPress={() => setAccountSwitcherVisible(true)}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <View style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: getAccountColor(activeAccount.index),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>
                    {activeAccount.name[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>
                  {activeAccount.name}
                </Text>
                <Ionicons name="chevron-down" size={14} color={COLORS.textSecondary} />
              </TouchableOpacity>
            ) : (
              <AddressChip address={wallet.address} />
            )}
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/settings')}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Portfolio Total */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 4 }}>
          <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Portfolio Value</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textSecondary }}>
            {wallet.priceData && wallet.ethBalance !== '\u2014' && wallet.saikoBalance !== '\u2014'
              ? `$${(
                  parseFloat(wallet.ethBalance.replace(/,/g, '')) * wallet.priceData.ethUsd +
                  parseFloat(wallet.saikoBalance.replace(/,/g, '')) * wallet.priceData.saikoUsd
                ).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '\u2014'}
          </Text>
        </View>

        {/* Hero Balance Card */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Card style={{
            borderColor: 'rgba(227,27,35,0.3)',
            shadowColor: '#E31B23',
            shadowOpacity: 0.12,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
          }}>
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 }}>
                SAIKO Balance
              </Text>
              <Text
                style={{
                  fontSize: 42,
                  fontWeight: '900',
                  color: COLORS.text,
                  letterSpacing: -0.5,
                }}
              >
                {wallet.saikoBalance}
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 4 }}>
                SAIKO
              </Text>
              <Text style={{ fontSize: 16, color: COLORS.textMuted, marginTop: 8 }}>
                {wallet.priceData && wallet.saikoBalance !== '\u2014'
                  ? `$${(parseFloat(wallet.saikoBalance.replace(/,/g, '')) * wallet.priceData.saikoUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '\u2014'}
              </Text>
              {wallet.priceData && (
                <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
                  Updated {Math.max(1, Math.round((Date.now() - wallet.priceData.updatedAt) / 1000))}s ago
                </Text>
              )}
              <View
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTopWidth: 1,
                  borderTopColor: COLORS.border,
                  width: '100%',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.text }}>
                  {wallet.ethBalance}
                </Text>
                <Text style={{ fontSize: 14, color: COLORS.textSecondary, alignSelf: 'flex-end', marginBottom: 2 }}>
                  ETH
                </Text>
              </View>
            </View>
          </Card>
        </View>

        {/* Action Buttons */}
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 20,
            gap: 10,
            marginBottom: 24,
          }}
        >
          {ACTION_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.label}
              onPress={() => router.push(item.route)}
              activeOpacity={0.7}
              style={{
                flex: 1,
                alignItems: 'center',
                backgroundColor: COLORS.surface,
                borderRadius: 12,
                paddingVertical: 18,
                borderWidth: 1,
                borderColor: item.label === 'DarkPool' ? 'rgba(227,27,35,0.5)' : COLORS.border,
                gap: 6,
              }}
            >
              <Ionicons name={item.icon} size={26} color={item.label === 'DarkPool' ? COLORS.primary : COLORS.textSecondary} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: item.label === 'DarkPool' ? COLORS.primary : COLORS.textSecondary }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Assets */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Card title="Assets">
            {/* SAIKO Row */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: `${COLORS.primary}20`,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: COLORS.primary,
                  overflow: 'hidden',
                }}
              >
                <Image
                  source={require('../../assets/saiko-logo-transparent.png')}
                  style={{ width: 36, height: 36 }}
                  resizeMode="contain"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>SAIKO</Text>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>Saiko Inu</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>
                  {wallet.saikoBalance}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                  {wallet.priceData && wallet.saikoBalance !== '\u2014'
                    ? `$${(parseFloat(wallet.saikoBalance.replace(/,/g, '')) * wallet.priceData.saikoUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '\u2014'}
                </Text>
              </View>
            </View>

            {/* ETH Row */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 14,
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: '#627EEA20',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: '#627EEA',
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#627EEA' }}>Ξ</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>ETH</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Ethereum</Text>
                  {wallet.priceData && (
                    <View style={{
                      backgroundColor: wallet.priceData.change24h >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(227,27,35,0.12)',
                      borderRadius: 4,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: wallet.priceData.change24h >= 0 ? '#22C55E' : COLORS.error }}>
                        {wallet.priceData.change24h >= 0 ? '+' : ''}{wallet.priceData.change24h.toFixed(1)}%
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>
                  {wallet.ethBalance}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                  {wallet.priceData && wallet.ethBalance !== '\u2014'
                    ? `$${(parseFloat(wallet.ethBalance.replace(/,/g, '')) * wallet.priceData.ethUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '\u2014'}
                </Text>
              </View>
            </View>
          </Card>
        </View>

        {/* Transaction History */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Card title="Recent Activity">
            {txLoading ? (
              [0, 1, 2].map((i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.border }} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ width: 100, height: 14, borderRadius: 4, backgroundColor: COLORS.border }} />
                    <View style={{ width: 60, height: 10, borderRadius: 4, backgroundColor: COLORS.border }} />
                  </View>
                  <View style={{ width: 70, height: 14, borderRadius: 4, backgroundColor: COLORS.border }} />
                </View>
              ))
            ) : txError ? (
              <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}>
                <Text style={{ fontSize: 13, color: COLORS.textMuted }}>Unable to load history</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (wallet.address) {
                      setTxLoading(true);
                      setTxError(false);
                      fetchTxHistory(wallet.address)
                        .then(setTxHistory)
                        .catch(() => setTxError(true))
                        .finally(() => setTxLoading(false));
                    }
                  }}
                  activeOpacity={0.7}
                  style={{ backgroundColor: COLORS.primary + '20', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.primary }}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : txHistory.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text style={{ fontSize: 13, color: COLORS.textMuted }}>No transactions yet</Text>
              </View>
            ) : (
              txHistory.map((tx) => (
                <View
                  key={tx.hash}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: COLORS.border,
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: `${tx.isIncoming ? COLORS.success : tx.type === 'swap' ? COLORS.info : COLORS.error}20`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons
                      name={tx.isIncoming ? 'arrow-down-outline' : tx.type === 'swap' ? 'swap-horizontal-outline' : 'arrow-up-outline'}
                      size={18}
                      color={tx.isIncoming ? COLORS.success : tx.type === 'swap' ? COLORS.info : COLORS.error}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' }}>
                      {tx.type}
                    </Text>
                    <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                      {tx.counterparty} · {timeAgo(tx.timestamp)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                        color: tx.isIncoming ? COLORS.success : COLORS.text,
                      }}
                    >
                      {tx.isIncoming ? '+' : '-'}{tx.amount}
                    </Text>
                    <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>
                      {tx.symbol}
                    </Text>
                  </View>
                </View>
              ))
            )}
            <TouchableOpacity
              activeOpacity={0.7}
              style={{ alignItems: 'center', paddingTop: 12 }}
              onPress={() => Linking.openURL(`https://etherscan.io/address/${wallet.address}`)}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textMuted }}>View All on Etherscan →</Text>
            </TouchableOpacity>
          </Card>
        </View>

        {/* Community Links */}
        <View style={{ paddingHorizontal: 20 }}>
          <Card title="Community">
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[
                { icon: 'logo-twitter' as const, label: 'X', url: 'https://x.com/SaikoInuETH' },
                { icon: 'paper-plane-outline' as const, label: 'Telegram', url: 'https://t.me/saikoinu' },
                { icon: 'globe-outline' as const, label: 'Website', url: 'https://saikoinu.com' },
              ].map((link) => (
                <TouchableOpacity
                  key={link.label}
                  onPress={() => Linking.openURL(link.url)}
                  activeOpacity={0.7}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: COLORS.surfaceElevated,
                    borderRadius: 10,
                    paddingVertical: 12,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Ionicons name={link.icon} size={16} color={COLORS.textSecondary} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textSecondary }}>
                    {link.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        </View>
      </ScrollView>

      <AccountSwitcher
        visible={accountSwitcherVisible}
        onClose={() => setAccountSwitcherVisible(false)}
        accounts={wallet.getAllAccounts()}
        activeIndex={wallet.activeAccountIndex}
        onSelect={(index) => { wallet.switchAccount(index); setAccountSwitcherVisible(false); }}
        onCreateNew={() => { setAccountSwitcherVisible(false); router.push('/create-account'); }}
        onRename={handleRename}
        onRemove={handleRemove}
      />
    </SafeAreaView>
  );
}
