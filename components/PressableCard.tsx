import * as Haptics from 'expo-haptics';
import { ReactNode, useRef } from 'react';
import { Animated, Pressable, StyleProp, ViewStyle } from 'react-native';

interface Props {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export default function PressableCard({ onPress, style, children }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
      }}
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 5 }).start()
      }
      onPress={onPress}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
