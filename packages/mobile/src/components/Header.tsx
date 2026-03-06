import React from 'react';
import { View, Text, TouchableOpacity, Image, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  showLogo?: boolean;
  rightAction?: React.ReactNode;
}

export function Header({ title, showBack, showLogo, rightAction }: HeaderProps) {
  const router = useRouter();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        backgroundColor: COLORS.surface,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        {showBack && (
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
        )}
        {showLogo && (
          <Image
            source={require('../../assets/saiko-logo-transparent.png')}
            style={{ width: 32, height: 32 }}
            resizeMode="contain"
          />
        )}
        {title && (
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: COLORS.text,
              letterSpacing: 0.5,
            }}
          >
            {title}
          </Text>
        )}
      </View>
      {rightAction && <View>{rightAction}</View>}
    </View>
  );
}
