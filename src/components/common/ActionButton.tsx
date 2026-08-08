import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useTheme } from '@/store/theme/hook'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

type Props = {
  title: string
  onPress?: () => void
  variant?: Variant
  disabled?: boolean
  loading?: boolean
  compact?: boolean
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
}

const ActionButton = ({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  compact,
  accessibilityLabel,
  style,
  textStyle,
}: Props) => {
  const { colors } = useTheme()
  const isDisabled = disabled || loading
  const isGhost = variant === 'ghost'
  const backgroundColor =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.error
        : variant === 'secondary'
          ? colors.surfaceSecondary
          : 'transparent'
  const color =
    variant === 'primary' || variant === 'danger'
      ? '#fff'
      : variant === 'secondary'
        ? colors.text
        : colors.primary

  return (
    <TouchableOpacity
      style={[
        styles.root,
        compact && styles.compact,
        {
          backgroundColor,
          borderColor: isGhost ? 'transparent' : colors.border,
          opacity: isDisabled ? 0.5 : 1,
        },
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.text, { color }, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: {
    minHeight: 40,
    minWidth: 88,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    minHeight: 34,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
})

export default ActionButton
