import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTheme } from '@/store/theme/hook'
import { inferVisionCapability, visionCapabilityLabel } from '@/utils/modelCapability'

type Props = {
  models: LX.ModelInfo[]
  defaultModel?: string
  onSelect: (modelId: string) => void
}

const DefaultModelList = ({ models, defaultModel, onSelect }: Props) => {
  const { colors } = useTheme()

  return (
    <>
      <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 8 }]}>
        已缓存模型：{models.length} 个{defaultModel ? ` · 默认 ${defaultModel}` : ''}
      </Text>
      {models.length > 0 ? (
        <View style={styles.modelBlock}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>默认模型</Text>
          <View style={styles.modelRow}>
            {models.slice(0, 8).map((item) => {
              const selected = item.id === defaultModel
              const cap =
                item.supportedVision == null
                  ? inferVisionCapability(item.id)
                  : item.supportedVision
                    ? 'vision'
                    : 'text'
              const capLabel = visionCapabilityLabel(cap)
              const capColor =
                cap === 'vision'
                  ? selected
                    ? '#E9FFF4'
                    : colors.success
                  : cap === 'text'
                    ? selected
                      ? 'rgba(255,255,255,0.85)'
                      : colors.textSecondary
                    : selected
                      ? 'rgba(255,255,255,0.9)'
                      : '#B45309'

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.modelChip,
                    {
                      backgroundColor: selected ? colors.primary : colors.surfaceSecondary,
                    },
                  ]}
                  onPress={() => onSelect(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    selected
                      ? `默认模型 ${item.id}（${capLabel}）`
                      : `设为默认模型 ${item.id}（${capLabel}）`
                  }
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={{
                      color: selected ? '#fff' : colors.text,
                      fontWeight: selected ? '700' : '500',
                      fontSize: 13,
                    }}
                    numberOfLines={1}
                  >
                    {item.id}
                  </Text>
                  <Text
                    style={{
                      color: capColor,
                      fontSize: 10,
                      marginTop: 1,
                      opacity: 0.9,
                    }}
                  >
                    {capLabel}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
          {models.length > 8 ? (
            <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 8 }]}>
              仅展示前 8 个模型；完整切换可在首页顶部模型选择器中完成。
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 13, marginBottom: 6 },
  hint: { fontSize: 12, marginBottom: 8 },
  modelBlock: { marginTop: 10 },
  modelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modelChip: {
    maxWidth: '100%',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
})

export default DefaultModelList
