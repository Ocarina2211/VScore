import { Ionicons } from '@expo/vector-icons';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';
import { useTranslation } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';

export default function TabLayout() {
  const t = useTranslation();
  const { colors } = useTheme();

  return (
    <NativeTabs
      iconColor={{ default: colors.textSecondary, selected: colors.primary }}
      labelStyle={{ color: colors.textSecondary, fontSize: 10, fontWeight: '600' }}
      minimizeBehavior="never"
      tintColor={colors.primary}
    >
      <NativeTabs.Trigger name="index">
        <Icon
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="home-outline" />,
            selected: <VectorIcon family={Ionicons} name="home" />,
          }}
          sf={{ default: 'house', selected: 'house.fill' }}
        />
        <Label>{t.tabHome}</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="rank">
        <Icon src={require('../../assets/images/icons/rank-chevrons.png')} />
        <Label>{t.tabRank}</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="social">
        <Icon src={require('../../assets/images/icons/social-icon.png')} />
        <Label>{t.tabSocial}</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <Icon
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="person-outline" />,
            selected: <VectorIcon family={Ionicons} name="person" />,
          }}
          sf={{ default: 'person', selected: 'person.fill' }}
        />
        <Label>{t.tabProfile}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
