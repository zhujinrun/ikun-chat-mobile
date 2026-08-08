import type { ReactNode } from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useTheme } from '@/store/theme/hook'

type Props = Omit<
  TextInputProps,
  'style' | 'value' | 'onChange' | 'onChangeText' | 'placeholderTextColor'
> & {
  label?: string
  value: string
  onChange: (value: string) => void
  helper?: string
  error?: string | null
  rightAccessory?: ReactNode
  containerStyle?: StyleProp<ViewStyle>
  inputContainerStyle?: StyleProp<ViewStyle>
  inputStyle?: StyleProp<TextStyle>
}

const FormField = ({
  label,
  value,
  onChange,
  helper,
  error,
  rightAccessory,
  containerStyle,
  inputContainerStyle,
  inputStyle,
  multiline,
  accessibilityLabel,
  ...inputProps
}: Props) => {
  const { colors } = useTheme()

  return (
    <View style={[styles.root, containerStyle]}>
      {label ? <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text> : null}
      <View
        style={[
          styles.inputBox,
          multiline && styles.inputBoxMulti,
          {
            backgroundColor: colors.inputBg,
            borderColor: error ? colors.error : colors.border,
          },
          inputContainerStyle,
        ]}
      >
        <TextInput
          {...inputProps}
          style={[
            styles.input,
            multiline && styles.inputMulti,
            { color: colors.text },
            inputStyle,
          ]}
          value={value}
          onChangeText={onChange}
          placeholderTextColor={colors.textSecondary}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : inputProps.textAlignVertical}
          autoCapitalize={inputProps.autoCapitalize || 'none'}
          autoCorrect={inputProps.autoCorrect ?? false}
          accessibilityLabel={accessibilityLabel || label}
        />
        {rightAccessory ? <View style={styles.accessory}>{rightAccessory}</View> : null}
      </View>
      {error ? (
        <Text style={[styles.feedback, { color: colors.error }]}>{error}</Text>
      ) : helper ? (
        <Text style={[styles.feedback, { color: colors.textSecondary }]}>{helper}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    marginBottom: 6,
  },
  inputBox: {
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputBoxMulti: {
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    fontSize: 15,
  },
  inputMulti: {
    minHeight: 72,
    paddingVertical: 0,
  },
  accessory: {
    alignSelf: 'center',
    marginLeft: 8,
  },
  feedback: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
})

export default FormField
