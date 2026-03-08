import React, { useState } from 'react';
import { View, Text, TextInput, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../src/constants/colors';
import { ActionButton } from '../src/components/ActionButton';

export default function UnlockScreen() {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState('');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Image
          source={require('../assets/saiko-logo-transparent.png')}
          style={{ width: 80, height: 80, marginBottom: 24 }}
          resizeMode="contain"
        />
        <Text
          style={{
            fontSize: 24,
            fontWeight: '800',
            color: COLORS.text,
            letterSpacing: 2,
            marginBottom: 8,
          }}
        >
          SAIKO WALLET
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: COLORS.textSecondary,
            marginBottom: 32,
          }}
        >
          Enter your passphrase to unlock
        </Text>

        <TextInput
          value={passphrase}
          onChangeText={setPassphrase}
          secureTextEntry
          placeholder="Passphrase"
          placeholderTextColor={COLORS.textMuted}
          style={{
            width: '100%',
            height: 52,
            backgroundColor: COLORS.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            color: COLORS.text,
            fontSize: 16,
            paddingHorizontal: 16,
            marginBottom: 20,
          }}
        />

        <ActionButton
          label="Unlock"
          onPress={() => router.replace('/(tabs)/dashboard')}
          variant="primary"
          fullWidth
        />
      </View>
    </SafeAreaView>
  );
}
