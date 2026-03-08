import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, FlatList, Alert, Switch, Clipboard } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../src/constants/colors';
import { Card } from '../../src/components/Card';
import { CURRENCIES } from '../../src/constants/currencies';
import { useCurrency } from '../../src/hooks/useCurrency';
import { useWallet } from '../../src/wallet/context';
import { NETWORKS, getActiveNetwork, setActiveNetwork } from '../../src/wallet/network';
import {
  requestNotificationPermission,
  registerBackgroundTxCheck,
  unregisterBackgroundTxCheck,
  isNotificationsEnabled,
  setNotificationsEnabled,
} from '../../src/notifications/notifications';

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
  iconBg?: string;
  iconColor?: string;
}

function SettingsRow({ icon, label, value, onPress, iconBg, iconColor }: SettingsRowProps & { iconBg?: string; iconColor?: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
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
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: iconBg ?? COLORS.surfaceElevated,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={18} color={iconColor ?? COLORS.textSecondary} />
      </View>
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text }}>
        {label}
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.textMuted }}>{value}</Text>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const wallet = useWallet();
  const { currency, setCurrency } = useCurrency();
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [selectedNetwork, setSelectedNetworkState] = useState(getActiveNetwork());
  const [showSeedPhrase, setShowSeedPhrase] = useState(false);
  const [seedWords, setSeedWords] = useState<string[]>([]);
  const [seedCountdown, setSeedCountdown] = useState(60);
  const seedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autoLockMinutes, setAutoLockMinutes] = useState('5');
  const [showAutoLockModal, setShowAutoLockModal] = useState(false);

  useEffect(() => {
    void isNotificationsEnabled().then(setNotifEnabled);
    void AsyncStorage.getItem('saiko_auto_lock_minutes').then((v) => { if (v) setAutoLockMinutes(v); });
  }, []);

  const handleShowSeed = () => {
    Alert.alert(
      'View Seed Phrase',
      'Never share your seed phrase with anyone. Anyone with it can steal your funds.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I Understand — Show',
          style: 'destructive',
          onPress: () => {
            const words = wallet.mnemonic.trim().split(/\s+/);
            if (words.length < 12) {
              Alert.alert('Error', 'No seed phrase found.');
              return;
            }
            setSeedWords(words);
            setShowSeedPhrase(true);
            setSeedCountdown(60);
            if (seedTimerRef.current) clearInterval(seedTimerRef.current);
            seedTimerRef.current = setInterval(() => {
              setSeedCountdown((prev) => {
                if (prev <= 1) {
                  setShowSeedPhrase(false);
                  setSeedWords([]);
                  if (seedTimerRef.current) clearInterval(seedTimerRef.current);
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);
          },
        },
      ],
    );
  };

  const handleHideSeed = () => {
    setShowSeedPhrase(false);
    setSeedWords([]);
    if (seedTimerRef.current) clearInterval(seedTimerRef.current);
  };

  const AUTO_LOCK_OPTIONS = [
    { value: '1', label: '1 minute' },
    { value: '5', label: '5 minutes' },
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
    { value: '0', label: 'Never' },
  ];

  const handleToggleNotifications = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert('Permission Denied', 'Please enable notifications in your device settings.');
        return;
      }
      await setNotificationsEnabled(true);
      if (wallet.address) {
        await registerBackgroundTxCheck(wallet.address);
      }
      setNotifEnabled(true);
    } else {
      await setNotificationsEnabled(false);
      await unregisterBackgroundTxCheck();
      setNotifEnabled(false);
    }
  }, [wallet.address]);

  const handleLock = () => {
    wallet.lock();
    router.replace('/unlock');
  };

  const handleWipe = () => {
    Alert.alert(
      'Wipe Wallet',
      'This will permanently delete your wallet from this device. Make sure you have your seed phrase backed up. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe Wallet',
          style: 'destructive',
          onPress: async () => {
            await wallet.wipe();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: '800',
            color: COLORS.text,
            letterSpacing: 0.5,
            marginBottom: 8,
          }}
        >
          Settings
        </Text>

        <Card>
          <SettingsRow
            icon="people-outline"
            label="Address Book"
            value=""
            onPress={() => router.push('/contacts')}
            iconBg="#0A1520"
            iconColor="#42A5F5"
          />
          <TouchableOpacity
            activeOpacity={1}
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
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: '#1A0E05',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="notifications-outline" size={18} color="#F59E0B" />
            </View>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text }}>
              Notifications
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.textMuted, marginRight: 8 }}>
              {notifEnabled ? 'Enabled' : 'Disabled'}
            </Text>
            <Switch
              value={notifEnabled}
              onValueChange={(v) => void handleToggleNotifications(v)}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor="#FFFFFF"
            />
          </TouchableOpacity>
          <SettingsRow
            icon="cash-outline"
            label="Currency"
            value={`${CURRENCIES.find((c) => c.code === currency)?.symbol ?? '$'} ${currency}`}
            onPress={() => setShowCurrencyModal(true)}
            iconBg="#052015"
            iconColor="#22C55E"
          />
          <SettingsRow
            icon="globe-outline"
            label="Network"
            value={selectedNetwork.name}
            onPress={() => setShowNetworkModal(true)}
            iconBg="#050A1F"
            iconColor="#627EEA"
          />
          <SettingsRow
            icon="timer-outline"
            label="Auto-Lock Timer"
            value={AUTO_LOCK_OPTIONS.find(o => o.value === autoLockMinutes)?.label ?? '5 minutes'}
            onPress={() => setShowAutoLockModal(true)}
            iconBg="#1A0E00"
            iconColor="#F59E0B"
          />
          <SettingsRow
            icon="document-text-outline"
            label="View Seed Phrase"
            value=""
            onPress={handleShowSeed}
            iconBg="#1A0505"
            iconColor="#E31B23"
          />
        </Card>

        <Card title="About">
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>App Version</Text>
              <Text style={{ fontSize: 14, color: COLORS.text }}>1.0.0</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Token</Text>
              <Text style={{ fontSize: 14, color: COLORS.text }}>Saiko Inu (SAIKO)</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Chain</Text>
              <Text style={{ fontSize: 14, color: COLORS.text }}>Ethereum (1)</Text>
            </View>
          </View>
        </Card>

        <TouchableOpacity
          onPress={handleLock}
          activeOpacity={0.7}
          style={{
            backgroundColor: COLORS.primary,
            borderRadius: 12,
            height: 52,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
          }}
        >
          <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 }}>
            Lock Wallet
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleWipe}
          activeOpacity={0.7}
          style={{
            backgroundColor: 'rgba(227,27,35,0.1)',
            borderRadius: 12,
            height: 52,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            borderWidth: 1,
            borderColor: 'rgba(227,27,35,0.3)',
          }}
        >
          <Ionicons name="trash-outline" size={18} color={COLORS.error} />
          <Text style={{ color: COLORS.error, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 }}>
            Wipe Wallet
          </Text>
        </TouchableOpacity>

        {/* Seed Phrase Display */}
        {showSeedPhrase && seedWords.length > 0 && (
          <Card>
            <View style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 16,
            }}>
              {seedWords.map((word, i) => (
                <View key={i} style={{
                  backgroundColor: COLORS.surfaceElevated,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  width: '30%',
                }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{i + 1}.</Text>
                  <Text style={{ fontSize: 14, color: COLORS.text, fontWeight: '600', fontFamily: 'monospace' }}>{word}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 11, color: COLORS.error, marginBottom: 12, lineHeight: 16 }}>
              Never share your seed phrase. Anyone with it can steal your funds.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => {
                  Clipboard.setString(seedWords.join(' '));
                  Alert.alert('Copied', 'Seed phrase copied to clipboard.');
                }}
                style={{ backgroundColor: COLORS.surfaceElevated, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 }}
              >
                <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: '600' }}>Copy All Words</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleHideSeed} style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                <Text style={{ color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' }}>Done</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 'auto', fontFamily: 'monospace' }}>
                {seedCountdown}s
              </Text>
            </View>
          </Card>
        )}

        <Text
          style={{
            fontSize: 12,
            color: COLORS.textMuted,
            textAlign: 'center',
            marginTop: 8,
          }}
        >
          Saiko Wallet v1.0.0 — Built for the pack
        </Text>
      </ScrollView>

        {/* Currency Modal */}
        <Modal
          visible={showCurrencyModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCurrencyModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 16,
              paddingBottom: 40,
              maxHeight: '60%',
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>Select Currency</Text>
                <TouchableOpacity onPress={() => setShowCurrencyModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={CURRENCIES}
                keyExtractor={(item) => item.code}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => { setCurrency(item.code); setShowCurrencyModal(false); }}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 14,
                      paddingHorizontal: 20,
                      borderBottomWidth: 1,
                      borderBottomColor: COLORS.border,
                    }}
                  >
                    <Text style={{ fontSize: 15, color: COLORS.text }}>
                      {item.symbol} — {item.name}
                    </Text>
                    {currency === item.code && (
                      <Ionicons name="checkmark" size={20} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        {/* Network Modal */}
        <Modal
          visible={showNetworkModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowNetworkModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 16,
              paddingBottom: 40,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>Select Network</Text>
                <TouchableOpacity onPress={() => setShowNetworkModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
              {NETWORKS.map((net) => (
                <TouchableOpacity
                  key={net.id}
                  onPress={() => {
                    void setActiveNetwork(net.id);
                    setSelectedNetworkState(net);
                    setShowNetworkModal(false);
                  }}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderBottomWidth: 1,
                    borderBottomColor: COLORS.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 15, color: COLORS.text }}>{net.name}</Text>
                    {net.isTestnet && (
                      <View style={{
                        backgroundColor: 'rgba(255,152,0,0.15)',
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 4,
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#FF9800' }}>TESTNET</Text>
                      </View>
                    )}
                  </View>
                  {selectedNetwork.id === net.id && (
                    <Ionicons name="checkmark" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>

        {/* Auto-Lock Modal */}
        <Modal
          visible={showAutoLockModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAutoLockModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 16,
              paddingBottom: 40,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>Auto-Lock Timer</Text>
                <TouchableOpacity onPress={() => setShowAutoLockModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
              {AUTO_LOCK_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    setAutoLockMinutes(opt.value);
                    void AsyncStorage.setItem('saiko_auto_lock_minutes', opt.value);
                    setShowAutoLockModal(false);
                  }}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderBottomWidth: 1,
                    borderBottomColor: COLORS.border,
                  }}
                >
                  <Text style={{ fontSize: 15, color: COLORS.text }}>{opt.label}</Text>
                  {autoLockMinutes === opt.value && (
                    <Ionicons name="checkmark" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
    </SafeAreaView>
  );
}
