import React from 'react';
import { TouchableOpacity, Text, ViewStyle } from 'react-native';
import { COLORS } from '../constants/colors';

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  fullWidth?: boolean;
  style?: ViewStyle;
  disabled?: boolean;
}

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  fullWidth,
  style,
  disabled,
}: ActionButtonProps) {
  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';
  const isDanger = variant === 'danger';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
      style={{
        backgroundColor: isPrimary
          ? COLORS.primary
          : isDanger
          ? 'rgba(227,27,35,0.15)'
          : 'transparent',
        borderWidth: isOutline ? 1.5 : 0,
        borderColor: isOutline ? COLORS.primary : undefined,
        borderRadius: 12,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        opacity: disabled ? 0.5 : 1,
        ...(fullWidth ? { width: '100%' } : {}),
        ...style,
      }}
    >
      <Text
        style={{
          color: isPrimary ? '#FFFFFF' : isDanger ? COLORS.error : COLORS.primary,
          fontSize: 16,
          fontWeight: '700',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
