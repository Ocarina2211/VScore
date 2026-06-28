import { useMemo } from 'react';
import { Image, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RANKS } from '../constants/Games';
import { useColors } from '../contexts/ThemeContext';

interface Props {
  visible: boolean;
  currentXP: number;
  onClose: () => void;
}

export default function RankModal({ visible, currentXP, onClose }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Swipe-down to close
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
    onPanResponderRelease: (_, g) => {
      if (g.dy > 50) onClose();
    },
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.wrapper}>
        {/* Dark overlay — tap to close */}
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />

        {/* Bottom sheet */}
        <View style={styles.sheet}>
          {/* Handle — tap or swipe down to close */}
          <View style={styles.handleArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>
          <Text style={styles.title}>RANKS</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {RANKS.map((rank, i) => {
              const isUnlocked = currentXP >= rank.minXP;
              const isCurrent =
                i === RANKS.length - 1
                  ? currentXP >= rank.minXP
                  : currentXP >= rank.minXP && currentXP < RANKS[i + 1].minXP;
              const xpNeeded = rank.minXP - currentXP;

              return (
                <View key={rank.name} style={[styles.row, isCurrent && styles.rowCurrent]}>
                  <View style={[styles.imageWrapper, !isUnlocked && styles.lockedWrapper]}>
                    <Image
                      source={rank.image}
                      style={[styles.rankImage, !isUnlocked && styles.imageGrey]}
                    />
                  </View>
                  <View style={styles.info}>
                    <Text style={[styles.rankName, { color: isUnlocked ? rank.color : colors.textSecondary }]}>
                      {rank.name.toUpperCase()}
                      {isCurrent && <Text style={styles.currentBadge}> ◀ CURRENT</Text>}
                    </Text>
                    <Text style={styles.xpText}>
                      {rank.minXP === 0
                        ? 'Starting rank'
                        : isUnlocked
                        ? `Unlocked at ${rank.minXP} XP`
                        : `${xpNeeded} XP to unlock`}
                    </Text>
                  </View>
                  {isUnlocked && !isCurrent && (
                    <Text style={[styles.checkmark, { color: rank.color }]}>✓</Text>
                  )}
                  {!isUnlocked && <Text style={styles.lock}>🔒</Text>}
                </View>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.backgroundSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  handleArea: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: c.textSecondary,
    borderRadius: 2,
  },
  title: {
    color: c.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 6,
    backgroundColor: c.background,
  },
  rowCurrent: {
    borderWidth: 1,
    borderColor: c.primary,
  },
  imageWrapper: {
    width: 64,
    height: 64,
    marginRight: 14,
  },
  lockedWrapper: {
    opacity: 0.35,
  },
  rankImage: {
    width: 64,
    height: 64,
    resizeMode: 'contain',
  },
  imageGrey: {
    tintColor: '#555',
  },
  info: {
    flex: 1,
  },
  rankName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  currentBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: c.primary,
    letterSpacing: 1,
  },
  xpText: {
    color: c.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  lock: {
    fontSize: 18,
    marginLeft: 8,
  },
  closeBtn: {
    marginTop: 16,
    backgroundColor: c.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
