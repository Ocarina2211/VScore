import { StyleProp, View, ViewStyle } from 'react-native';
import { useColors } from '../contexts/ThemeContext';

interface Props {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export default function SkeletonBox({ width, height, borderRadius = 10, style }: Props) {
  const colors = useColors();

  return (
    <View
      style={[
        { width: width as any, height, borderRadius, overflow: 'hidden', backgroundColor: colors.backgroundSecondary },
        style,
      ]}
    />
  );
}
