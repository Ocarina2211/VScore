import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ColorScheme } from '../../constants/Colors';
import { useTranslation } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_CONFIG: Record<string, { icon: IoniconName; iconFocused: IoniconName; label: string }> = {
  index:    { icon: 'home-outline',     iconFocused: 'home',     label: 'Home'     },
  rank:     { icon: 'podium-outline',   iconFocused: 'podium',   label: 'Rank'     },
  profile:  { icon: 'person-outline',   iconFocused: 'person',   label: 'Profile'  },
  settings: { icon: 'settings-outline', iconFocused: 'settings', label: 'Settings' },
};

function TabItem({ route, focused, onPress, colors, isDark }: { route: any; focused: boolean; onPress: () => void; colors: ColorScheme; isDark: boolean }) {
  const config = TAB_CONFIG[route.name] ?? TAB_CONFIG['index'];
  const t = useTranslation();
  const TAB_LABELS: Record<string, string> = {
    index: t.tabHome,
    rank: t.tabRank,
    search: t.tabSearch,
    profile: t.tabProfile,
    settings: t.tabSettings,
  };
  const label = TAB_LABELS[route.name] ?? config.label;

  const pillScaleX = useRef(new Animated.Value(focused ? 1 : 0.45)).current;
  const pillOpacity = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const labelOpacity = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const iconScale = useRef(new Animated.Value(focused ? 1 : 0.85)).current;

  useEffect(() => {
    if (focused) {
      Animated.parallel([
        Animated.spring(pillScaleX, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
        Animated.timing(pillOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(labelOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(iconScale, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(pillScaleX, { toValue: 0.45, friction: 6, tension: 100, useNativeDriver: true }),
        Animated.timing(pillOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(labelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.spring(iconScale, { toValue: 0.85, friction: 7, tension: 120, useNativeDriver: true }),
      ]).start();
    }
  }, [focused]);

  return (
    <Pressable onPress={onPress} style={styles.tabItem}>
      <View style={styles.pill}>
        {/* Liquid glass pill */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { borderRadius: 24, overflow: 'hidden' },
            { opacity: pillOpacity, transform: [{ scaleX: pillScaleX }] },
          ]}
        >
          <LinearGradient
            colors={isDark
              ? ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.07)']
              : ['rgba(255,255,255,0.88)', 'rgba(255,255,255,0.52)']
            }
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          <View style={[StyleSheet.absoluteFillObject, { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.95)' }]} pointerEvents="none" />
        </Animated.View>
        {/* Icon */}
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>
          <Ionicons
            name={focused ? config.iconFocused : config.icon}
            size={20}
            color={focused ? colors.primary : colors.textSecondary}
          />
        </Animated.View>
        {/* Label */}
        <Animated.Text style={[styles.label, { opacity: labelOpacity, color: focused ? colors.primary : colors.textSecondary }]}>
          {label}
        </Animated.Text>
      </View>
    </Pressable>
  );
}

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'ios' ? Math.max(insets.bottom, 16) : 16;
  const { colors, isDark } = useTheme();

  const visibleRoutes = state.routes.filter((r) => r.name !== 'search' && r.name !== 'settings');

  return (
    <View
      style={[
        styles.barWrapper,
        {
          bottom: bottomPad,
          backgroundColor: isDark ? 'rgba(18, 18, 32, 0.96)' : 'rgba(248, 248, 253, 0.98)'
        },
      ]}
    >
      {/* Sheen */}
      <LinearGradient
        colors={isDark
          ? ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.0)']
          : ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.04)']
        }
        style={[StyleSheet.absoluteFillObject, { borderRadius: 40 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
      />
      {/* Glass rim */}
      <View
        style={[StyleSheet.absoluteFillObject, styles.glassRim, {
          borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.82)',
        }]}
        pointerEvents="none"
      />
      {visibleRoutes.map((route) => {
        const routeIndex = state.routes.indexOf(route);
        const focused = state.index === routeIndex;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return <TabItem key={route.key} route={route} focused={focused} onPress={onPress} colors={colors} isDark={isDark} />;
      })}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="rank" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 64,
    borderRadius: 40,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 8,
  },
  glassRim: {
    borderRadius: 40,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 64,
  },
  pill: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 24,
    flexDirection: 'column',
    gap: 2,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
  },
});
