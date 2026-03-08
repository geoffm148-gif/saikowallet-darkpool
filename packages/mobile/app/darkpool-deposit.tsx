import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../src/constants/colors';
import { Header } from '../src/components/Header';
import { Card } from '../src/components/Card';
import { ActionButton } from '../src/components/ActionButton';

const TIERS = [
  { id: '10M', amount: '10,000,000', fee: '50,000', receive: '9,950,000' },
  { id: '100M', amount: '100,000,000', fee: '500,000', receive: '99,500,000' },
  { id: '1B', amount: '1,000,000,000', fee: '5,000,000', receive: '995,000,000' },
  { id: '10B', amount: '10,000,000,000', fee: '50,000,000', receive: '9,950,000,000' },
];

export default function DarkPoolDepositScreen() {
  const router = useRouter();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const tier = TIERS.find((t) => t.id === selectedTier);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Header title="Deposit to DarkPool" showBack />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}
      >
        <Text style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 }}>
          Select a deposit tier. Each tier generates a privacy note that proves your deposit without revealing your identity.
        </Text>

        {/* Tier Cards */}
        {TIERS.map((t) => (
          <TouchableOpacity
            key={t.id}
            onPress={() => setSelectedTier(t.id)}
            activeOpacity={0.7}
          >
            <Card
              style={{
                borderColor: selectedTier === t.id ? COLORS.primary : COLORS.border,
                borderWidth: selectedTier === t.id ? 2 : 1,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>
                    {t.amount} SAIKO
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 3 }}>
                    0.5% fee · receive {t.receive} note
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: selectedTier === t.id ? COLORS.primary : COLORS.surfaceElevated,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderWidth: 1,
                    borderColor: selectedTier === t.id ? COLORS.primary : COLORS.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: selectedTier === t.id ? '#FFFFFF' : COLORS.textSecondary,
                    }}
                  >
                    {t.id}
                  </Text>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        ))}

        {/* Fee Preview */}
        {tier && (
          <Card title="Fee Preview">
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Deposit</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>
                  {tier.amount} SAIKO
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Fee (0.5%)</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.warning }}>
                  {tier.fee} SAIKO
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: COLORS.border,
                }}
              >
                <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>You receive</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.success }}>
                  {tier.receive} SAIKO note
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Warning */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
            backgroundColor: COLORS.warning + '15',
            borderRadius: 12,
            padding: 14,
            borderWidth: 1,
            borderColor: COLORS.warning + '30',
          }}
        >
          <Ionicons name="warning-outline" size={20} color={COLORS.warning} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 13, color: COLORS.warning, lineHeight: 19 }}>
            Save your note — it's the only way to withdraw. If you lose it, your funds are gone forever.
          </Text>
        </View>

        {/* Generate Note Button */}
        <ActionButton
          label="Generate Note"
          onPress={() => router.back()}
          variant="primary"
          fullWidth
          disabled={!selectedTier}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
