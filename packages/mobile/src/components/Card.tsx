import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { COLORS } from '../constants/colors';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  style?: ViewStyle;
}

export function Card({ children, title, style }: CardProps) {
  return (
    <View
      style={{
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        ...style,
      }}
    >
      {title && (
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: COLORS.textSecondary,
            marginBottom: 12,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Text>
      )}
      {children}
    </View>
  );
}
