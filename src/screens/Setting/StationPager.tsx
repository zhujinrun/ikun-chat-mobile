import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { useTheme } from '@/store/theme/hook'
import { endpointModeLabel, fileHandlingLabel } from './settingOptions'

type Props = {
  stations: LX.ApiStation[]
  defaultId?: string | null
  selectedStationId?: string | null
  usageCounts: Record<string, number>
  onSelect: (id: string) => void
}

const StationPager = ({
  stations,
  defaultId,
  selectedStationId,
  usageCounts,
  onSelect,
}: Props) => {
  const { colors } = useTheme()
  const pagerRef = useRef<ScrollView>(null)
  const { width: windowWidth } = useWindowDimensions()
  const cardWidth = Math.max(260, windowWidth - 60)

  const selectedIndex = useMemo(() => {
    const index = stations.findIndex((item) => item.id === selectedStationId)
    return index >= 0 ? index : 0
  }, [selectedStationId, stations])

  useEffect(() => {
    pagerRef.current?.scrollTo({
      x: selectedIndex * cardWidth,
      animated: true,
    })
  }, [cardWidth, selectedIndex])

  const handlePageChange = useCallback(
    (offsetX: number) => {
      if (!stations.length) return
      const index = Math.max(0, Math.min(stations.length - 1, Math.round(offsetX / cardWidth)))
      const station = stations[index]
      if (station && station.id !== selectedStationId) {
        onSelect(station.id)
      }
    },
    [cardWidth, onSelect, selectedStationId, stations]
  )

  return (
    <>
      <View style={styles.frame}>
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          snapToInterval={cardWidth}
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          style={{ width: cardWidth }}
          onMomentumScrollEnd={(event) => handlePageChange(event.nativeEvent.contentOffset.x)}
          onScrollEndDrag={(event) => handlePageChange(event.nativeEvent.contentOffset.x)}
        >
          {stations.map((station) => {
            const selected = station.id === selectedStationId
            const isDefault = station.id === defaultId
            const usageCount = usageCounts[station.id] || 0

            return (
              <TouchableOpacity
                key={station.id}
                style={[
                  styles.card,
                  {
                    width: cardWidth,
                    backgroundColor: selected ? colors.surfaceSecondary : colors.surface,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => onSelect(station.id)}
                accessibilityRole="button"
                accessibilityLabel={`${selected ? '当前' : '切换到'}中转站 ${station.name}${isDefault ? '，默认' : ''}，${usageCount} 个会话使用`}
                accessibilityState={{ selected }}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                    {station.name}
                  </Text>
                  <View style={styles.badgeRow}>
                    {selected ? (
                      <Text
                        style={[styles.badge, { backgroundColor: colors.primary, color: '#fff' }]}
                      >
                        当前
                      </Text>
                    ) : null}
                    {isDefault ? (
                      <Text
                        style={[
                          styles.badge,
                          { backgroundColor: colors.surface, color: colors.primary },
                        ]}
                      >
                        默认
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Text style={[styles.url, { color: colors.textSecondary }]} numberOfLines={1}>
                  {station.baseUrl || '未配置 API URL'}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {usageCount} 个会话使用
                  </Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {endpointModeLabel(station.endpointMode)} · {fileHandlingLabel(station.fileHandling)}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {station.defaultModel ? `默认模型 ${station.defaultModel}` : '未设置默认模型'}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
      {stations.length > 1 ? (
        <View style={styles.dots}>
          {stations.map((station, index) => {
            const selected = station.id === selectedStationId
            return (
              <TouchableOpacity
                key={station.id}
                style={[
                  styles.dot,
                  {
                    width: selected ? 16 : 6,
                    backgroundColor: selected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  onSelect(station.id)
                  pagerRef.current?.scrollTo({
                    x: index * cardWidth,
                    animated: true,
                  })
                }}
                accessibilityRole="button"
                accessibilityLabel={`切换到第 ${index + 1} 个中转站 ${station.name}`}
                accessibilityState={{ selected }}
              />
            )
          })}
        </View>
      ) : null}
      <Text style={[styles.ruleHint, { color: colors.textSecondary }]}>
        默认中转站只影响新建会话，已有会话会继续使用创建时绑定的中转站。
      </Text>
    </>
  )
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    marginBottom: 8,
  },
  card: {
    minHeight: 116,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 5,
  },
  badge: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
  },
  url: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  metaRow: {
    gap: 4,
  },
  meta: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
    marginBottom: 10,
  },
  dot: {
    height: 6,
    borderRadius: 999,
  },
  ruleHint: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
})

export default StationPager
