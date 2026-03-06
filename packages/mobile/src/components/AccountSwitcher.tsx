import React, { useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  Animated,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import type { SubWalletData } from '../wallet/context';

const AVATAR_COLORS = ['#E31B23', '#627EEA', '#22C55E', '#F59E0B', '#8B5CF6', '#06B6D4'];

function getAccountColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function truncateAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface AccountSwitcherProps {
  visible: boolean;
  onClose: () => void;
  accounts: SubWalletData[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onCreateNew: () => void;
  onRename?: (index: number) => void;
  onRemove?: (index: number) => void;
}

export function AccountSwitcher({
  visible,
  onClose,
  accounts,
  activeIndex,
  onSelect,
  onCreateNew,
  onRename,
  onRemove,
}: AccountSwitcherProps) {
  const slideAnim = useRef(new Animated.Value(0)).current;

  const onShow = () => {
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handleLongPress = (account: SubWalletData) => {
    if (account.index === 0) {
      // Can only rename index 0, not remove
      Alert.alert(account.name, undefined, [
        { text: 'Rename', onPress: () => onRename?.(account.index) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      Alert.alert(account.name, undefined, [
        { text: 'Rename', onPress: () => onRename?.(account.index) },
        { text: 'Remove', style: 'destructive', onPress: () => onRemove?.(account.index) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      onShow={onShow}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        activeOpacity={1}
        onPress={handleClose}
      >
        <Animated.View
          style={{
            transform: [{ translateY }],
            backgroundColor: COLORS.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: Platform.OS === 'ios' ? 34 : 20,
            maxHeight: '70%',
          }}
        >
          <TouchableOpacity activeOpacity={1}>
            {/* Handle bar */}
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
            </View>

            {/* Title */}
            <Text style={{
              fontSize: 18,
              fontWeight: '700',
              color: COLORS.text,
              textAlign: 'center',
              paddingVertical: 12,
            }}>
              Accounts
            </Text>

            {/* Account list */}
            <FlatList
              data={accounts}
              keyExtractor={(item) => String(item.index)}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { onSelect(item.index); handleClose(); }}
                  onLongPress={() => handleLongPress(item)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    gap: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: COLORS.border,
                  }}
                >
                  {/* Avatar */}
                  <View style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: getAccountColor(item.index),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                      {item.name[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>

                  {/* Name + address */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text }}>
                      {item.name}
                    </Text>
                    <Text style={{
                      fontSize: 12,
                      color: COLORS.textSecondary,
                      fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                      marginTop: 2,
                    }}>
                      {truncateAddress(item.address)}
                    </Text>
                  </View>

                  {/* Active indicator */}
                  {item.index === activeIndex && (
                    <Text style={{ fontSize: 18, color: '#22C55E', fontWeight: '700' }}>
                      {'\u2713'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            />

            {/* Add Account button */}
            <TouchableOpacity
              onPress={() => { handleClose(); setTimeout(onCreateNew, 300); }}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginHorizontal: 20,
                marginTop: 16,
                paddingVertical: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderStyle: 'dashed',
              }}
            >
              <Ionicons name="add" size={20} color={COLORS.textSecondary} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.textSecondary }}>
                Add Account
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}
