import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../src/constants/colors';
import { Header } from '../src/components/Header';
import { Card } from '../src/components/Card';
import { ActionButton } from '../src/components/ActionButton';

export default function DarkPoolWithdrawScreen() {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [recipient, setRecipient] = useState('');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Header title="Withdraw from DarkPool" showBack />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 }}>
          Paste your DarkPool note to withdraw funds privately. The withdrawal breaks the on-chain link between deposit and withdrawal.
        </Text>

        <View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 }}>
            DarkPool Note
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="saiko-darkpool-note-..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={3}
            style={{
              height: 80,
              backgroundColor: COLORS.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: COLORS.border,
              color: COLORS.text,
              fontSize: 13,
              fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
              paddingHorizontal: 16,
              paddingVertical: 12,
              textAlignVertical: 'top',
            }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 }}>
            Recipient Address
          </Text>
          <TextInput
            value={recipient}
            onChangeText={setRecipient}
            placeholder="0x..."
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              height: 52,
              backgroundColor: COLORS.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: COLORS.border,
              color: COLORS.text,
              fontSize: 15,
              fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
              paddingHorizontal: 16,
            }}
          />
        </View>

        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Relayer Fee</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>~0.002 ETH</Text>
          </View>
        </Card>

        <ActionButton
          label="Withdraw"
          onPress={() => router.back()}
          variant="primary"
          fullWidth
          disabled={!note || !recipient}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
