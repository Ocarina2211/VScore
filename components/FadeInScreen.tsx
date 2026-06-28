import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export default function FadeInScreen({ children, style }: { children: React.ReactNode; style?: any }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);

  useFocusEffect(
    useCallback(() => {
      opacity.value = 0;
      translateY.value = 10;
      opacity.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
      translateY.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
    }, [])
  );

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[{ flex: 1 }, animStyle, style]}>
      {children}
    </Animated.View>
  );
}
