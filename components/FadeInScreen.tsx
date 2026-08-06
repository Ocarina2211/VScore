import { useEffect, useRef } from 'react';
import { Animated, Dimensions } from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function FadeInScreen({ children, style }: { children: React.ReactNode; style?: any }) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [translateY]);

  return (
    <Animated.View style={[{ flex: 1, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
