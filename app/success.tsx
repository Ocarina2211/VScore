import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RANKS } from '../constants/Games';
import { useTranslation } from '../contexts/I18nContext';
import { useColors } from '../contexts/ThemeContext';

// 16 particles evenly spread in a circle
const NUM_PARTICLES = 16;
const PARTICLES = Array.from({ length: NUM_PARTICLES }, (_, i) => {
  const angle = (i / NUM_PARTICLES) * 2 * Math.PI;
  const radius = 90 + Math.random() * 30; // 90–120 px
  return {
    angle,
    dx: Math.cos(angle) * radius,
    dy: Math.sin(angle) * radius,
    delay: i * 18,
    size: 10 + Math.floor(Math.random() * 10),
    symbol: ['★', '✦', '✸', '•'][i % 4],
    color: ['#FFD700', '#fff', '#7B2FBE', '#00FF88'][i % 4],
  };
});

export default function SuccessScreen() {
  const colors = useColors();
  const t = useTranslation();
  const { addedToTop3, levelUp } = useLocalSearchParams();
  const router = useRouter();
  const isTop3 = addedToTop3 === 'true';
  const newRankName = typeof levelUp === 'string' ? decodeURIComponent(levelUp) : '';
  const newRank = RANKS.find((r) => r.name === newRankName) ?? null;
  const closeSuccessScreen = useCallback(() => {
    router.replace('/(tabs)/rank' as any);
  }, [router]);

  // Badge entrance
  const badgeScale = useRef(new Animated.Value(0)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(1)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslate = useRef(new Animated.Value(24)).current;

  // Particles
  const particleAnims = useRef(
    PARTICLES.map(() => ({ progress: new Animated.Value(0) }))
  ).current;

  useEffect(() => {
    const autoCloseTimer = setTimeout(closeSuccessScreen, 3000);
    return () => clearTimeout(autoCloseTimer);
  }, [closeSuccessScreen]);

  useEffect(() => {
    if (!newRank) return;

    // Badge spring
    const badgeAnimation = Animated.parallel([
      Animated.spring(badgeScale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(badgeOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]);
    badgeAnimation.start();

    // Particle burst (fire all at once with small delays)
    const particleAnimations = particleAnims.map(({ progress }, i) => {
      const animation = Animated.sequence([
        Animated.delay(PARTICLES[i].delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);
      animation.start();
      return animation;
    });

    // Title
    const titleAnimation = Animated.sequence([
      Animated.delay(350),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(titleTranslate, { toValue: 0, friction: 7, useNativeDriver: true }),
      ]),
    ]);
    titleAnimation.start();

    // Glow pulse loop
    const glowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1.07, duration: 700, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    glowAnimation.start();
    return () => {
      badgeAnimation.stop();
      particleAnimations.forEach((animation) => animation.stop());
      titleAnimation.stop();
      glowAnimation.stop();
    };
  }, [badgeOpacity, badgeScale, glow, newRank, particleAnims, titleOpacity, titleTranslate]);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (newRank) {
    return (
      <View style={styles.container}>
        <Text style={styles.rankUpLabel}>RANK UP !</Text>

        {/* Badge + burst */}
        <View style={styles.burstContainer}>
          {/* Particles */}
          {PARTICLES.map((p, i) => {
            const { progress } = particleAnims[i];
            const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] });
            const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] });
            const opacity = progress.interpolate({ inputRange: [0, 0.3, 0.8, 1], outputRange: [0, 1, 0.8, 0] });
            const scale = progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1.4, 0.6] });
            return (
              <Animated.Text
                key={i}
                style={[
                  styles.particle,
                  {
                    fontSize: p.size,
                    color: p.color,
                    opacity,
                    transform: [{ translateX }, { translateY }, { scale }],
                  },
                ]}
              >
                {p.symbol}
              </Animated.Text>
            );
          })}

          {/* Badge */}
          <Animated.View style={[styles.badgeWrapper, {
            opacity: badgeOpacity,
            transform: [{ scale: Animated.multiply(badgeScale, glow) }],
          }]}>
            <Image source={newRank.image} style={styles.rankBadge} />
          </Animated.View>
        </View>

        {/* Rank name */}
        <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleTranslate }], alignItems: 'center' }}>
          <Text style={[styles.rankName, { color: newRank.color }]}>{newRank.name.toUpperCase()}</Text>
          <Text style={styles.rankSub}>{t.successNewRank}</Text>
        </Animated.View>

        <TouchableOpacity style={styles.btn} onPress={closeSuccessScreen}>
          <Text style={styles.btnText}>{t.successContinue}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.messageSection}>
        {isTop3 ? (
          <Text style={styles.message}>{t.successTop3}</Text>
        ) : (
          <>
            <Text style={styles.message}>{t.successRatingSaved}</Text>
            <Text style={styles.message}>{t.successKeepRanking}</Text>
          </>
        )}
      </View>

      <TouchableOpacity style={styles.btn} onPress={closeSuccessScreen}>
        <Text style={styles.btnText}>{t.successBack}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, justifyContent: 'center', alignItems: 'center', paddingVertical: 80, paddingHorizontal: 30, gap: 36 },
  messageSection: { alignItems: 'center', gap: 12 },
  message: { color: c.text, fontSize: 18, fontWeight: '900', textAlign: 'center', lineHeight: 26 },
  btn: { backgroundColor: c.backgroundSecondary, borderRadius: 30, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', borderWidth: 1, borderColor: c.primaryLight },
  btnText: { color: c.text, fontWeight: '700', fontSize: 15, letterSpacing: 1 },
  // Level up
  rankUpLabel: { fontSize: 38, fontWeight: '900', color: c.text, letterSpacing: 6, textShadowColor: c.primary, textShadowRadius: 24 },
  burstContainer: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  particle: { position: 'absolute' },
  badgeWrapper: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  rankBadge: { width: 160, height: 160, resizeMode: 'contain' },
  rankName: { fontSize: 34, fontWeight: '900', letterSpacing: 5, textAlign: 'center' },
  rankSub: { color: c.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 4 },
});
