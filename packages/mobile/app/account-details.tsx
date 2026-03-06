import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { COLORS } from '../src/constants/colors';
import { useWallet } from '../src/wallet/context';
import { getEthBalance, formatBalance } from '../src/wallet/rpc';

export default function AccountDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ index: string }>();
  const wallet = useWallet();
  const accountIndex = Number(params.index ?? 0);

  const account = wallet.accounts.find(a => a.index === accountIndex);
  const [editName, setEditName] = useState(account?.name ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const [ethBalance, setEthBalance] = useState('\u2014');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  useEffect(() => {
    if (account?.address) {
      getEthBalance(account.address)
        .then(raw => setEthBalance(formatBalance(raw, 18, 4)))
        .catch(() => setEthBalance('\u2014'));
    }
  }, [account?.address]);

  const handleSaveName = useCallback(() => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Account name cannot be empty');
      return;
    }
    wallet.renameAccount(accountIndex, editName);
    setIsEditing(false);
  }, [editName, accountIndex, wallet]);

  const handleCopyAddress = useCallback(async () => {
    if (!account) return;
    await Clipboard.setStringAsync(account.address);
    Alert.alert('Copied', 'Address copied to clipboard');
  }, [account]);

  const handleExportKey = useCallback(() => {
    Alert.alert(
      'Warning',
      'Never share your private key. Anyone with it can steal all funds in this account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reveal',
          style: 'destructive',
          onPress: () => {
            try {
              const pk = wallet.exportPrivateKey(accountIndex);
              setRevealedKey(pk);
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to export key');
            }
          },
        },
      ]
    );
  }, [accountIndex, wallet]);

  const handleCopyKey = useCallback(async () => {
    if (!revealedKey) return;
    await Clipboard.setStringAsync(revealedKey);
    Alert.alert('Copied', 'Private key copied to clipboard');
  }, [revealedKey]);

  if (!account) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: COLORS.textSecondary }}>Account not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: COLORS.primary, fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        gap: 12,
      }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text, flex: 1 }}>
          Account Details
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 20, paddingBottom: 40 }}>
        {/* Name */}
        <View style={{
          backgroundColor: COLORS.surface,
          borderRadius: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: COLORS.border,
          gap: 8,
        }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary }}>
            Account Name
          </Text>
          {isEditing ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                style={{
                  flex: 1,
                  backgroundColor: COLORS.background,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 16,
                  color: COLORS.text,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
                autoFocus
                onSubmitEditing={handleSaveName}
              />
              <TouchableOpacity
                onPress={handleSaveName}
                style={{
                  backgroundColor: COLORS.primary,
                  borderRadius: 8,
                  paddingHorizontal: 16,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setIsEditing(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Text style={{ fontSize: 18, fontWeight: '600', color: COLORS.text, flex: 1 }}>
                {account.name}
              </Text>
              <Ionicons name="pencil-outline" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Address */}
        <TouchableOpacity
          onPress={handleCopyAddress}
          activeOpacity={0.7}
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary }}>
              Address
            </Text>
            <Ionicons name="copy-outline" size={14} color={COLORS.textSecondary} />
          </View>
          <Text style={{
            fontSize: 13,
            color: COLORS.text,
            fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
            lineHeight: 20,
          }}>
            {account.address}
          </Text>
        </TouchableOpacity>

        {/* Derivation path */}
        <View style={{ paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
            Derivation: {account.derivationPath}
          </Text>
        </View>

        {/* ETH Balance */}
        <View style={{
          backgroundColor: COLORS.surface,
          borderRadius: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: COLORS.border,
          gap: 4,
        }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary }}>
            ETH Balance
          </Text>
          <Text style={{ fontSize: 22, fontWeight: '700', color: COLORS.text }}>
            {ethBalance} ETH
          </Text>
        </View>

        {/* View on Etherscan */}
        <TouchableOpacity
          onPress={() => Linking.openURL(`https://etherscan.io/address/${account.address}`)}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 12,
          }}
        >
          <Ionicons name="open-outline" size={16} color={COLORS.textSecondary} />
          <Text style={{ fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' }}>
            View on Etherscan
          </Text>
        </TouchableOpacity>

        {/* Export Private Key */}
        {revealedKey ? (
          <View style={{
            backgroundColor: 'rgba(227,27,35,0.06)',
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: 'rgba(227,27,35,0.3)',
            gap: 10,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.error }}>
              PRIVATE KEY — DO NOT SHARE
            </Text>
            <Text style={{
              fontSize: 12,
              color: COLORS.text,
              fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
              lineHeight: 18,
            }}>
              {revealedKey}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={handleCopyKey}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: 'rgba(227,27,35,0.1)',
                }}
              >
                <Ionicons name="copy-outline" size={14} color={COLORS.error} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.error }}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRevealedKey(null)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textSecondary }}>Hide</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleExportKey}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(227,27,35,0.3)',
            }}
          >
            <Ionicons name="key-outline" size={18} color={COLORS.error} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.error }}>
              Export Private Key
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
