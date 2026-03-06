import React from 'react';
import { View, Text } from 'react-native';
import { COLORS } from '../constants/colors';

interface TokenBalanceProps {
  symbol: string;
  balance: string;
  usdValue?: string;
  large?: boolean;
}

export function TokenBalance({ symbol, balance, usdValue, large }: TokenBalanceProps) {
  return (
    <View style={{ alignItems: large ? 'center' : 'flex-start' }}>
      <Text
        style={{
          fontSize: large ? 36 : 24,
          fontWeight: '800',
          color: COLORS.text,
          letterSpacing: -0.5,
        }}
      >
        {balance}
      </Text>
      <Text
        style={{
          fontSize: large ? 16 : 14,
          fontWeight: '600',
          color: COLORS.textSecondary,
          marginTop: 2,
        }}
      >
        {symbol}
      </Text>
      {usdValue && (
        <Text
          style={{
            fontSize: 14,
            color: COLORS.textMuted,
            marginTop: 4,
          }}
        >
          {usdValue}
        </Text>
      )}
    </View>
  );
}
