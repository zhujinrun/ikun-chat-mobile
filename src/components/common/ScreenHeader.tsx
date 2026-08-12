import { Platform, StatusBar, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/store/theme/hook'
import IconButton from './IconButton'

type Props = {
  title: string
  onBack: () => void
}

/**
 * 简单页面头部：避开 Android 状态栏，避免 native-stack header 与沉浸式状态栏重叠。
 */
const ScreenHeader = ({ title, onBack }: Props) => {
  const theme = useTheme()
  const { colors } = theme
  const insets = useSafeAreaInsets()
  const topInset = Platform.OS === 'android' ? StatusBar.currentHeight || insets.top : insets.top

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: topInset,
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <View style={styles.inner}>
        <IconButton
          name="back"
          accessibilityLabel="返回"
          color={colors.text}
          size={24}
          hitSlop={12}
          style={styles.backButton}
          onPress={onBack}
        />
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.spacer} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  inner: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    marginLeft: 2,
    fontSize: 18,
    fontWeight: '700',
  },
  spacer: {
    width: 40,
  },
})

export default ScreenHeader
