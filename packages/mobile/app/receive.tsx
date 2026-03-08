import React from 'react';
import { View, Text, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { COLORS } from '../src/constants/colors';
import { Header } from '../src/components/Header';
import { ActionButton } from '../src/components/ActionButton';
import { useWallet } from '../src/wallet/context';

export default function ReceiveScreen() {
  const wallet = useWallet();

  const handleCopy = async () => {
    await Clipboard.setStringAsync(wallet.address);
  };

  const handleShare = async () => {
    await Share.share({ message: wallet.address });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Header title="Receive SAIKO" showBack />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        {/* QR Code */}
        <View
          style={{
            width: 240,
            height: 240,
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 32,
            padding: 20,
          }}
        >
          <QRCode
            value={wallet.address || '0x0'}
            size={200}
            backgroundColor="#FFFFFF"
            color="#000000"
          />
        </View>

        {/* Address */}
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: COLORS.textSecondary,
            marginBottom: 8,
          }}
        >
          Your Wallet Address
        </Text>
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            paddingHorizontal: 16,
            paddingVertical: 14,
            marginBottom: 28,
            width: '100%',
          }}
        >
          <Text
            style={{
              fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
              fontSize: 14,
              color: COLORS.text,
              textAlign: 'center',
              lineHeight: 22,
            }}
            selectable
          >
            {wallet.address}
          </Text>
        </View>

        {/* Buttons */}
        <View style={{ width: '100%', gap: 12 }}>
          <ActionButton
            label="Copy Address"
            onPress={handleCopy}
            variant="primary"
            fullWidth
          />
          <ActionButton
            label="Share"
            onPress={handleShare}
            variant="outline"
            fullWidth
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
