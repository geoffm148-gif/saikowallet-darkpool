import '@walletconnect/react-native-compat';
import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, AppState, Text, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WalletProvider, useWallet } from '../src/wallet/context';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { getActiveNetwork, getActiveNetworkAsync } from '../src/wallet/network';
import {
  requestNotificationPermission,
  registerBackgroundTxCheck,
  isNotificationsEnabled,
} from '../src/notifications/notifications';
import * as Notifications from 'expo-notifications';

function TestnetBanner() {
  const net = getActiveNetwork();
  if (!net.isTestnet) return null;
  return (
    <View style={{
      backgroundColor: 'rgba(255,152,0,0.15)',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,152,0,0.3)',
      paddingVertical: 8,
      paddingHorizontal: 16,
      alignItems: 'center',
    }}>
      <Text style={{
        fontSize: 12,
        fontWeight: '700',
        color: '#FF9800',
        letterSpacing: 0.5,
      }}>
        TESTNET MODE — {net.name} — Transactions have no real value
      </Text>
    </View>
  );
}

function RootNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const wallet = useWallet();
  const notifSetupDone = useRef(false);
  const backgroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load active network on mount
  useEffect(() => { void getActiveNetworkAsync(); }, []);

  // Auto-lock on background
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        void (async () => {
          const minutes = parseInt((await AsyncStorage.getItem('saiko_auto_lock_minutes')) ?? '5', 10);
          if (minutes === 0) return;
          backgroundTimerRef.current = setTimeout(() => {
            wallet.lock();
          }, minutes * 60 * 1000);
        })();
      } else if (nextState === 'active') {
        if (backgroundTimerRef.current) {
          clearTimeout(backgroundTimerRef.current);
          backgroundTimerRef.current = null;
        }
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => { sub.remove(); if (backgroundTimerRef.current) clearTimeout(backgroundTimerRef.current); };
  }, [wallet]);

  // Set up notifications after wallet loads
  useEffect(() => {
    if (!wallet.isLoaded || !wallet.hasWallet || !wallet.address || notifSetupDone.current) return;
    notifSetupDone.current = true;

    void (async () => {
      const enabled = await isNotificationsEnabled();
      if (!enabled) return;
      await requestNotificationPermission();
      await registerBackgroundTxCheck(wallet.address);
    })();
  }, [wallet.isLoaded, wallet.hasWallet, wallet.address]);

  // Handle notification tap → navigate to dashboard
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      router.push('/(tabs)/dashboard');
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (!wallet.isLoaded) return;

    const inOnboarding =
      segments[0] === 'onboarding' ||
      segments[0] === 'create-wallet' ||
      segments[0] === 'import-wallet';

    if (!wallet.hasWallet && !inOnboarding) {
      router.replace('/onboarding');
    } else if (wallet.hasWallet && inOnboarding) {
      router.replace('/(tabs)/dashboard');
    }
  }, [wallet.isLoaded, wallet.hasWallet, segments]);

  if (!wallet.isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#E31B23" />
      </View>
    );
  }

  return (
    <>
      <TestnetBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0A0A0A' },
          animation: 'slide_from_right',
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <WalletProvider>
        <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
          <StatusBar style="light" />
          <RootNavigator />
        </View>
      </WalletProvider>
    </ErrorBoundary>
  );
}
