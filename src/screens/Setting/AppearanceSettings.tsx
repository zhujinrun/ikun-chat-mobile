import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import settingAction from '@/store/setting/action'
import { useSetting } from '@/store/setting/hook'
import themeAction from '@/store/theme/action'
import { useTheme } from '@/store/theme/hook'
import { themeList } from '@/theme/themes'
import { FONT_SIZE_OPTIONS } from './settingOptions'

const AppearanceSettings = () => {
  const { colors } = useTheme()
  const setting = useSetting()

  return (
    <>
      <Text style={[styles.label, { color: colors.textSecondary }]}>主题</Text>
      <View style={styles.optionRow}>
        {themeList.map((theme) => {
          const selected = setting['theme.id'] === theme.id

          return (
            <TouchableOpacity
              key={theme.id}
              style={[
                styles.optionChip,
                {
                  backgroundColor: selected ? colors.primary : colors.surfaceSecondary,
                },
              ]}
              onPress={() => {
                settingAction.updateSetting({ 'theme.id': theme.id })
                themeAction.applyTheme(theme.id)
              }}
              accessibilityRole="button"
              accessibilityLabel={`切换主题 ${theme.name}`}
              accessibilityState={{ selected }}
            >
              <Text
                style={{
                  color: selected ? '#fff' : colors.text,
                  fontWeight: '600',
                }}
              >
                {theme.name}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
      <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>字号</Text>
      <View style={styles.optionRow}>
        {FONT_SIZE_OPTIONS.map((option) => {
          const selected = setting['common.fontSize'] === option.value

          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionChip,
                {
                  backgroundColor: selected ? colors.primary : colors.surfaceSecondary,
                },
              ]}
              onPress={() => {
                settingAction.updateSetting({ 'common.fontSize': option.value })
                global.lx.fontSize = option.value
              }}
              accessibilityRole="button"
              accessibilityLabel={`设置字号 ${option.label}`}
              accessibilityState={{ selected }}
            >
              <Text style={{ color: selected ? '#fff' : colors.text }}>{option.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 13, marginBottom: 6 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
})

export default AppearanceSettings
