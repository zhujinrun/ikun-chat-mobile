import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '@/store/theme/hook'

type Props = {
  title: string
  children: ReactNode
}

const SettingSection = ({ title, children }: Props) => {
  const { colors } = useTheme()

  return (
    <>
      <Text style={[styles.section, { color: colors.text }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {children}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  section: { fontSize: 16, fontWeight: '700', marginBottom: 8, marginTop: 8 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
})

export default SettingSection
