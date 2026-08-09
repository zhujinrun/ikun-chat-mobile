import type { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ModalProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useTheme } from '@/store/theme/hook'
import IconButton from './IconButton'

type Placement = 'center' | 'bottom'

type Props = {
  visible: boolean
  title: string
  onClose: () => void
  children: ReactNode
  description?: string
  placement?: Placement
  animationType?: ModalProps['animationType']
  showClose?: boolean
  accessibilityLabel?: string
  contentStyle?: StyleProp<ViewStyle>
  bodyStyle?: StyleProp<ViewStyle>
}

const AppModal = ({
  visible,
  title,
  onClose,
  children,
  description,
  placement = 'center',
  animationType,
  showClose = true,
  accessibilityLabel,
  contentStyle,
  bodyStyle,
}: Props) => {
  const { colors } = useTheme()
  const isBottom = placement === 'bottom'

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType || (isBottom ? 'slide' : 'fade')}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={[styles.mask, isBottom ? styles.maskBottom : styles.maskCenter]}
        onPress={onClose}
      >
        <KeyboardAvoidingView
          style={[styles.keyboardWrap, isBottom ? styles.keyboardBottom : styles.keyboardCenter]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
        >
          <Pressable
            style={[
              styles.surface,
              isBottom ? styles.bottomSurface : styles.centerSurface,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              contentStyle,
            ]}
            onPress={(event) => event.stopPropagation()}
            accessibilityViewIsModal
            importantForAccessibility="yes"
            accessibilityLabel={accessibilityLabel || title}
          >
            <View style={styles.header}>
              <View style={styles.titleWrap}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                  {title}
                </Text>
                {description ? (
                  <Text style={[styles.description, { color: colors.textSecondary }]}>
                    {description}
                  </Text>
                ) : null}
              </View>
              {showClose ? (
                <IconButton
                  name="close"
                  accessibilityLabel={`关闭${title}`}
                  color={colors.textSecondary}
                  size={22}
                  onPress={onClose}
                />
              ) : null}
            </View>
            <View style={[styles.body, bodyStyle]}>{children}</View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  mask: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.48)',
  },
  maskCenter: {
    justifyContent: 'center',
    padding: 24,
  },
  maskBottom: {
    justifyContent: 'flex-end',
  },
  keyboardWrap: {
    flex: 1,
    width: '100%',
  },
  keyboardCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardBottom: {
    justifyContent: 'flex-end',
  },
  surface: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  centerSurface: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '86%',
    borderRadius: 14,
  },
  bottomSurface: {
    width: '100%',
    maxHeight: '88%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  titleWrap: {
    flex: 1,
  },
  body: {
    flexShrink: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
})

export default AppModal
