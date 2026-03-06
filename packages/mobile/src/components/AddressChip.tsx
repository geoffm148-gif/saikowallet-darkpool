import React from 'react';
import { TouchableOpacity, Text, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { COLORS } from '../constants/colors';

interface AddressChipProps {
  address: string;
  truncateChars?: number;
}

export function AddressChip({ address, truncateChars = 6 }: AddressChipProps) {
  const truncated = `${address.slice(0, truncateChars + 2)}...${address.slice(-truncateChars)}`;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(address);
  };

  return (
    <TouchableOpacity
      onPress={handleCopy}
      activeOpacity={0.7}
      style={{
        backgroundColor: COLORS.surfaceElevated,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: COLORS.border,
      }}
    >
      <Text
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
          fontSize: 12,
          color: COLORS.textSecondary,
        }}
      >
        {truncated}
      </Text>
    </TouchableOpacity>
  );
}
