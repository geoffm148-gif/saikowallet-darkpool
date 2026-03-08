import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/colors';
import { Card } from '../../src/components/Card';
import { ActionButton } from '../../src/components/ActionButton';
import { MOCK_DARK_POOL_NOTES, MOCK_WALLET } from '../../src/constants/mock-data';

const SAIKO_USD = MOCK_WALLET.saikoUsdPrice; // $0.000000847

function saikoToUsd(rawStr: string): string {
  const num = parseFloat(rawStr.replace(/,/g, ''));
  if (isNaN(num)) return '';
  const usd = num * SAIKO_USD;
  if (usd < 0.01) return `≈ $${usd.toFixed(6)}`;
  return `≈ $${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ETH_USD = 3241.00;

function ethToUsd(eth: string): string {
  const num = parseFloat(eth);
  if (isNaN(num)) return '';
  const usd = num * ETH_USD;
  return `≈ $${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATS = [
  { label: 'Total Staked', value: '420B SAIKO', sub: saikoToUsd('420000000000') },
  { label: 'Your Staked', value: '11B SAIKO', sub: saikoToUsd('11000000000') },
  { label: 'Est. APY', value: '18.7%', sub: null },
  { label: 'Total Earned', value: '45.8M SAIKO + 0.045 ETH', sub: `≈ $${((45800000 * SAIKO_USD) + (0.045 * ETH_USD)).toFixed(2)}` },
];

export default function DarkPoolScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Ionicons name="shield" size={28} color={COLORS.primary} />
          <View>
            <Text
              style={{
                fontSize: 24,
                fontWeight: '800',
                color: COLORS.text,
                letterSpacing: 0.5,
              }}
            >
              Saiko DarkPool
            </Text>
            <View style={{ height: 2, backgroundColor: COLORS.primary, borderRadius: 1, marginTop: 4, width: '60%' }} />
          </View>
        </View>

        {/* Staking Banner */}
        <Card
          style={{
            backgroundColor: '#180808',
            borderColor: 'rgba(227,27,35,0.35)',
          }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 0 }}>
            {STATS.map((stat) => (
              <View key={stat.label} style={{ width: '50%', paddingVertical: 10, paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>
                  {stat.label}
                </Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: stat.label === 'Est. APY' ? COLORS.primary : COLORS.text }}>
                  {stat.value}
                </Text>
                {stat.sub ? (
                  <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{stat.sub}</Text>
                ) : null}
              </View>
            ))}
          </View>
        </Card>

        {/* Deposit Button */}
        <ActionButton
          label="Deposit to DarkPool"
          onPress={() => router.push('/darkpool-deposit')}
          variant="primary"
          fullWidth
        />

        {/* Notes */}
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: COLORS.textSecondary,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          Your Notes
        </Text>

        {MOCK_DARK_POOL_NOTES.map((note) => (
          <Card key={note.id} style={{ borderLeftWidth: 3, borderLeftColor: COLORS.primary }}>
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>
                  {note.amount} SAIKO Note
                </Text>
                <View style={{
                  backgroundColor: COLORS.primary + '20',
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderWidth: 1,
                  borderColor: COLORS.primary + '60',
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }}>
                    {note.tier}
                  </Text>
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Staked</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>
                    {note.amount} SAIKO
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Days Staked</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>
                    {note.stakedDays}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Earned</Text>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.success }}>
                        +{note.earnedSaiko} SAIKO
                      </Text>
                      <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>
                        {saikoToUsd(note.earnedSaiko)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#627EEA' }}>
                        +{note.earnedEth} ETH
                      </Text>
                      <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>
                        {ethToUsd(note.earnedEth)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.7}
                style={{
                  backgroundColor: COLORS.success + '20',
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.success }}>
                  Claim Rewards
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))}

        {/* Privacy Badges */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8 }}>
          {['Zero-Knowledge', 'Non-Custodial'].map((badge) => (
            <View
              key={badge}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: COLORS.surface,
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Ionicons
                name={badge === 'Zero-Knowledge' ? 'eye-off-outline' : 'lock-closed-outline'}
                size={14}
                color={COLORS.success}
              />
              <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary }}>
                {badge}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
