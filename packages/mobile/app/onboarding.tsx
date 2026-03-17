import React from 'react';
import { View, Text, Image, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { COLORS } from '../src/constants/colors';
import { ActionButton } from '../src/components/ActionButton';

const { width } = Dimensions.get('window');

export default function OnboardingScreen() {
  const router = useRouter();

  const glowOpacity = useSharedValue(0.3);
  React.useEffect(() => {
    glowOpacity.value = withRepeat(
      withTiming(0.8, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [glowOpacity]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <LinearGradient
      colors={[COLORS.gradientTop, COLORS.gradientBottom]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: 180,
                  height: 180,
                  borderRadius: 90,
                  backgroundColor: COLORS.primary,
                },
                glowStyle,
              ]}
            />
            <Image
              source={require('../assets/saiko-logo-transparent.png')}
              style={{ width: 140, height: 140 }}
              resizeMode="contain"
            />
          </View>

          <Text
            style={{
              fontSize: 32,
              fontWeight: '900',
              color: COLORS.text,
              letterSpacing: 4,
              marginTop: 32,
              textAlign: 'center',
            }}
          >
            SAIKO WALLET
          </Text>
        </View>

        <View style={{ width: '100%', gap: 14 }}>
          <ActionButton
            label="Create New Wallet"
            onPress={() => router.push('/create-wallet')}
            variant="primary"
            fullWidth
          />
          <ActionButton
            label="Import Existing Wallet"
            onPress={() => router.push('/import-wallet')}
            variant="outline"
            fullWidth
          />
        </View>

      </SafeAreaView>
    </LinearGradient>
  );
}
