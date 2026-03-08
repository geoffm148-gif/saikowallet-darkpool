import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HDNodeWallet, Mnemonic, getAddress } from 'ethers';
import { COLORS } from '../src/constants/colors';
import { useWallet } from '../src/wallet/context';

const BASE_PATH = "m/44'/60'/0'/0";

export default function CreateAccountScreen() {
  const router = useRouter();
  const wallet = useWallet();
  const [name, setName] = useState('');

  const defaultName = `Account ${wallet.accounts.length + 1}`;
  const nextIndex = wallet.accounts.length > 0
    ? Math.max(...wallet.accounts.map(a => a.index)) + 1
    : 0;

  const previewAddress = useMemo(() => {
    if (!wallet.mnemonic) return '';
    try {
      const path = `${BASE_PATH}/${nextIndex}`;
      const hd = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(wallet.mnemonic), path);
      return getAddress(hd.address);
    } catch {
      return '';
    }
  }, [wallet.mnemonic, nextIndex]);

  const handleCreate = () => {
    try {
      wallet.createAccount(name || undefined);
      router.back();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create account');
    }
  };

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
        <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>
          New Account
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 20, flex: 1 }}>
        {/* Name input */}
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textSecondary }}>
            Account Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={defaultName}
            placeholderTextColor={COLORS.textMuted}
            style={{
              backgroundColor: COLORS.surface,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 16,
              color: COLORS.text,
              fontWeight: '500',
            }}
            autoFocus
          />
        </View>

        {/* Preview address */}
        {previewAddress ? (
          <View style={{
            backgroundColor: COLORS.surface,
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
            gap: 6,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary }}>
              Derived Address
            </Text>
            <Text style={{
              fontSize: 13,
              color: COLORS.text,
              fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
            }}>
              {previewAddress}
            </Text>
          </View>
        ) : null}

        {/* Info text */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 4,
        }}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.textMuted} />
          <Text style={{ fontSize: 13, color: COLORS.textMuted, flex: 1 }}>
            This account shares your seed phrase backup.
          </Text>
        </View>

        {/* Create button */}
        <TouchableOpacity
          onPress={handleCreate}
          activeOpacity={0.8}
          style={{
            backgroundColor: COLORS.primary,
            borderRadius: 12,
            paddingVertical: 16,
            alignItems: 'center',
            marginTop: 'auto',
            marginBottom: 20,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
            Create Account
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
