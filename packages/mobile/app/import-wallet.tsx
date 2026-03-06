import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../src/constants/colors';
import { ActionButton } from '../src/components/ActionButton';
import { Header } from '../src/components/Header';
import { validateMnemonic, deriveWallet, walletFromPrivateKey } from '../src/wallet/crypto';
import { storeWallet } from '../src/wallet/storage';
import { useWallet } from '../src/wallet/context';

type ImportMode = 'seed' | 'privateKey';

export default function ImportWalletScreen() {
  const router = useRouter();
  const wallet = useWallet();
  const [mode, setMode] = useState<ImportMode>('seed');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  const isPrivateKey = input.startsWith('0x') && input.trim().length === 66;

  const handleValidateOnBlur = () => {
    if (!input.trim()) {
      setError('');
      return;
    }
    if (mode === 'seed') {
      if (!validateMnemonic(input)) {
        setError('Invalid seed phrase. Please check your words and try again.');
      } else {
        setError('');
      }
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setError('');
    try {
      if (mode === 'privateKey' || isPrivateKey) {
        const { address, privateKey } = walletFromPrivateKey(input.trim());
        // For private key import, store the key as the "mnemonic" slot
        // (it's still securely stored, just not a mnemonic)
        await storeWallet(privateKey, address);
      } else {
        if (!validateMnemonic(input)) {
          setError('Invalid seed phrase.');
          setImporting(false);
          return;
        }
        const { address } = deriveWallet(input.trim());
        await storeWallet(input.trim().toLowerCase(), address);
      }
      await wallet.reload();
      router.replace('/(tabs)/dashboard');
    } catch {
      setError('Failed to import wallet. Please check your input and try again.');
      setImporting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Header title="Import Wallet" showBack />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Mode toggle */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['seed', 'privateKey'] as const).map((m) => (
            <ActionButton
              key={m}
              label={m === 'seed' ? 'Seed Phrase' : 'Private Key'}
              onPress={() => {
                setMode(m);
                setInput('');
                setError('');
              }}
              variant={mode === m ? 'primary' : 'outline'}
              style={{ flex: 1 }}
            />
          ))}
        </View>

        {mode === 'seed' ? (
          <>
            <Text style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 }}>
              Enter your 12 or 24 word seed phrase, separated by spaces.
            </Text>
            <TextInput
              value={input}
              onChangeText={setInput}
              onBlur={handleValidateOnBlur}
              placeholder="word1 word2 word3 ..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                minHeight: 120,
                backgroundColor: COLORS.surface,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: error ? COLORS.error : COLORS.border,
                color: COLORS.text,
                fontSize: 16,
                padding: 16,
                textAlignVertical: 'top',
                fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
              }}
            />
          </>
        ) : (
          <>
            <Text style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 }}>
              Enter your private key (starts with 0x, 66 characters).
            </Text>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="0x..."
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={{
                height: 52,
                backgroundColor: COLORS.surface,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: error ? COLORS.error : COLORS.border,
                color: COLORS.text,
                fontSize: 16,
                paddingHorizontal: 16,
                fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
              }}
            />
          </>
        )}

        {error ? (
          <Text style={{ fontSize: 14, color: COLORS.error }}>{error}</Text>
        ) : null}

        <ActionButton
          label={importing ? 'Importing...' : 'Import Wallet'}
          onPress={() => void handleImport()}
          variant="primary"
          fullWidth
          disabled={!input.trim() || importing}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
