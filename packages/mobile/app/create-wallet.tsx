import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../src/constants/colors';
import { ActionButton } from '../src/components/ActionButton';
import { Header } from '../src/components/Header';
import { generateMnemonic, deriveWallet } from '../src/wallet/crypto';
import { storeWallet } from '../src/wallet/storage';
import { useWallet } from '../src/wallet/context';

export default function CreateWalletScreen() {
  const router = useRouter();
  const wallet = useWallet();
  const [step, setStep] = useState(1);
  const [mnemonic, setMnemonic] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const words = useMemo(() => mnemonic.split(' '), [mnemonic]);

  // Step 3: pick 3 random positions to verify
  const [verifyPositions] = useState(() => {
    const positions = Array.from({ length: 12 }, (_, i) => i);
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i]!, positions[j]!] = [positions[j]!, positions[i]!];
    }
    return positions.slice(0, 3).sort((a, b) => a - b);
  });
  const [verifyInputs, setVerifyInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    setMnemonic(generateMnemonic());
  }, []);

  const handleVerify = () => {
    const allCorrect = verifyPositions.every(
      (pos) => (verifyInputs[pos] ?? '').trim().toLowerCase() === words[pos]
    );
    if (allCorrect) {
      setError('');
      setStep(4);
      void saveWallet();
    } else {
      setError('One or more words are incorrect. Please check and try again.');
    }
  };

  const saveWallet = async () => {
    setSaving(true);
    try {
      const { address } = deriveWallet(mnemonic);
      await storeWallet(mnemonic, address);
      await wallet.reload();
      router.replace('/(tabs)/dashboard');
    } catch {
      setError('Failed to create wallet. Please try again.');
      setSaving(false);
    }
  };

  if (!mnemonic) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Header title="Create Wallet" showBack />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && (
          <View style={{ gap: 24 }}>
            <View
              style={{
                backgroundColor: 'rgba(227,27,35,0.1)',
                borderWidth: 1,
                borderColor: 'rgba(227,27,35,0.3)',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <Text style={{ fontSize: 14, color: COLORS.warning, lineHeight: 20 }}>
                Your seed phrase is the only way to recover your wallet. Never share it with anyone.
              </Text>
            </View>
            <ActionButton
              label="Show Seed Phrase"
              onPress={() => setStep(2)}
              variant="primary"
              fullWidth
            />
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: 24 }}>
            <View
              style={{
                backgroundColor: 'rgba(227,27,35,0.1)',
                borderWidth: 1,
                borderColor: 'rgba(227,27,35,0.3)',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <Text style={{ fontSize: 14, color: COLORS.error, fontWeight: '700' }}>
                Write these down. Screenshots are not safe.
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              {words.map((word, i) => (
                <View
                  key={i}
                  style={{
                    width: '30%',
                    flexGrow: 1,
                    backgroundColor: COLORS.surface,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Text style={{ fontSize: 12, color: COLORS.textMuted, width: 20, textAlign: 'right' }}>
                    {i + 1}.
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: COLORS.text,
                      fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                    }}
                  >
                    {word}
                  </Text>
                </View>
              ))}
            </View>

            <ActionButton
              label="I've Written It Down"
              onPress={() => setStep(3)}
              variant="primary"
              fullWidth
            />
          </View>
        )}

        {step === 3 && (
          <View style={{ gap: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>
              Verify Your Seed Phrase
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 }}>
              Enter the words at the positions shown to confirm your backup.
            </Text>

            {verifyPositions.map((pos) => (
              <View key={pos} style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textSecondary }}>
                  Word #{pos + 1}
                </Text>
                <TextInput
                  value={verifyInputs[pos] ?? ''}
                  onChangeText={(text) =>
                    setVerifyInputs((prev) => ({ ...prev, [pos]: text }))
                  }
                  placeholder={`Enter word ${pos + 1}`}
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    height: 48,
                    backgroundColor: COLORS.surface,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                    fontSize: 16,
                    paddingHorizontal: 14,
                    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                  }}
                />
              </View>
            ))}

            {error ? (
              <Text style={{ fontSize: 14, color: COLORS.error }}>{error}</Text>
            ) : null}

            <ActionButton
              label="Verify & Create Wallet"
              onPress={handleVerify}
              variant="primary"
              fullWidth
              disabled={verifyPositions.some((pos) => !(verifyInputs[pos] ?? '').trim())}
            />
          </View>
        )}

        {step === 4 && (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text }}>
              {saving ? 'Creating Wallet...' : 'Wallet Created!'}
            </Text>
            {error ? (
              <Text style={{ fontSize: 14, color: COLORS.error }}>{error}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
