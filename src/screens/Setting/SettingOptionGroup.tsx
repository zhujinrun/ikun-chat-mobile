import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTheme } from '@/store/theme/hook'

type SettingOption<Value extends string> = {
  value: Value
  label: string
  desc: string
}

type Props<Value extends string> = {
  label: string
  options: Array<SettingOption<Value>>
  value: Value
  accessibilityLabelPrefix: string
  labelMarginTop?: number
  isOptionDisabled?: (option: SettingOption<Value>) => boolean
  onDisabledPress?: (option: SettingOption<Value>) => void
  onSelect: (value: Value) => void
}

const SettingOptionGroup = <Value extends string,>({
  label,
  options,
  value,
  accessibilityLabelPrefix,
  labelMarginTop = 0,
  isOptionDisabled,
  onDisabledPress,
  onSelect,
}: Props<Value>) => {
  const { colors } = useTheme()

  return (
    <>
      <Text style={[styles.label, { color: colors.textSecondary, marginTop: labelMarginTop }]}>
        {label}
      </Text>
      <View style={styles.optionGrid}>
        {options.map((option) => {
          const selected = value === option.value
          const disabled = !!isOptionDisabled?.(option)

          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionChip,
                {
                  backgroundColor: selected ? colors.primary : colors.surfaceSecondary,
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: disabled ? 0.55 : 1,
                },
              ]}
              onPress={() => {
                if (disabled) {
                  onDisabledPress?.(option)
                  return
                }
                onSelect(option.value)
              }}
              accessibilityRole="button"
              accessibilityLabel={`${accessibilityLabelPrefix} ${option.label}，${option.desc}`}
              accessibilityState={{ selected, disabled }}
            >
              <Text style={[styles.optionTitle, { color: selected ? '#fff' : colors.text }]}>
                {option.label}
              </Text>
              <Text
                style={[
                  styles.optionDesc,
                  { color: selected ? 'rgba(255,255,255,0.86)' : colors.textSecondary },
                ]}
              >
                {option.desc}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 13, marginBottom: 6 },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  optionChip: {
    flexGrow: 1,
    flexBasis: '47%',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  optionDesc: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
})

export default SettingOptionGroup
