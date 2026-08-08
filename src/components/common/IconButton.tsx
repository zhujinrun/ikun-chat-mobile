import { TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native'
import Icon, { type AppIconName } from './Icon'

type Props = {
  name: AppIconName
  onPress?: () => void
  color?: string
  size?: number
  disabled?: boolean
  /** 无障碍 / 长按提示语义 */
  accessibilityLabel: string
  hitSlop?: number
  style?: StyleProp<ViewStyle>
}

/**
 * 图标按钮：扩大点击热区，保留 accessibilityLabel 方便读屏与语义。
 */
const IconButton = ({
  name,
  onPress,
  color,
  size = 20,
  disabled,
  accessibilityLabel,
  hitSlop = 10,
  style,
}: Props) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={{ top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop }}
      style={[{ opacity: disabled ? 0.4 : 1, padding: 4 }, style]}
    >
      <Icon name={name} size={size} color={color} />
    </TouchableOpacity>
  )
}

export default IconButton
