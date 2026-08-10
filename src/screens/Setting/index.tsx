import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native'
import { useTheme } from '@/store/theme/hook'
import { useSetting } from '@/store/setting/hook'
import settingAction from '@/store/setting/action'
import themeAction from '@/store/theme/action'
import modelAction from '@/store/model/action'
import { useModels } from '@/store/model/hook'
import stationAction from '@/store/station/action'
import { useStations } from '@/store/station/hook'
import { inferVisionCapability, visionCapabilityLabel } from '@/utils/modelCapability'
import { themeList } from '@/theme/themes'
import { toast } from '@/utils/toast'
import { normalizeBaseUrl } from '@/core/api'
import ActionButton from '@/components/common/ActionButton'
import FormField from '@/components/common/FormField'
import IconButton from '@/components/common/IconButton'

const appVersion = require('../../../package.json').version as string

const FONT_SIZE_OPTIONS = [
  { value: 14, label: '小号' },
  { value: 16, label: '标准' },
  { value: 18, label: '大号' },
  { value: 20, label: '超大' },
]

type Props = {
  componentId: string
}

const validateExtraHeaders = (raw: string) => {
  const text = raw.trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return '额外请求头必须是 JSON 对象'
    }
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key.trim()) return '请求头名称不能为空'
      if (typeof value !== 'string') return `请求头 ${key} 的值必须是字符串`
    }
    return null
  } catch {
    return '额外请求头不是合法 JSON'
  }
}

const Setting = (_props: Props) => {
  const theme = useTheme()
  const setting = useSetting()
  const { stations, defaultId } = useStations()
  const colors = theme.colors

  const [selectedStationId, setSelectedStationId] = useState<string | null>(defaultId)
  const selectedStation = useMemo(
    () =>
      stations.find((item) => item.id === selectedStationId) ||
      stations.find((item) => item.id === defaultId) ||
      stations[0] ||
      null,
    [defaultId, selectedStationId, stations]
  )
  const { models, loading, error } = useModels(selectedStation?.id)

  const [stationName, setStationName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [extraHeaders, setExtraHeaders] = useState('')
  const [extraHeadersError, setExtraHeadersError] = useState<string | null>(null)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState(setting['chat.systemPrompt'])
  const [temperature, setTemperature] = useState(String(setting['chat.temperature']))
  const [maxTokens, setMaxTokens] = useState(String(setting['chat.maxTokens'] || ''))
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (selectedStation && selectedStation.id !== selectedStationId) {
      setSelectedStationId(selectedStation.id)
    }
  }, [selectedStation, selectedStationId])

  useEffect(() => {
    if (!selectedStation) return
    setStationName(selectedStation.name)
    setBaseUrl(selectedStation.baseUrl)
    setApiKey(selectedStation.apiKey)
    setExtraHeaders(selectedStation.extraHeaders)
    setExtraHeadersError(null)
  }, [
    selectedStation?.apiKey,
    selectedStation?.baseUrl,
    selectedStation?.extraHeaders,
    selectedStation?.id,
    selectedStation?.name,
  ])

  const connectionStatus = useMemo(() => {
    if (!selectedStation) {
      return { title: '未配置', desc: '请先新增中转站', tone: colors.textSecondary }
    }
    if (testing || loading) {
      return { title: '正在测试连接', desc: '正在拉取模型列表…', tone: colors.primary }
    }
    if (error) {
      return { title: '连接失败', desc: error, tone: colors.error }
    }
    if (selectedStation.baseUrl && selectedStation.apiKey && models.length > 0) {
      return {
        title: '连接正常',
        desc: `已缓存 ${models.length} 个模型${selectedStation.defaultModel ? ` · 默认 ${selectedStation.defaultModel}` : ''}`,
        tone: colors.success,
      }
    }
    if (selectedStation.baseUrl && selectedStation.apiKey) {
      return { title: '待测试', desc: '保存后测试连接即可刷新模型', tone: colors.primaryDark }
    }
    return { title: '未配置', desc: '请填写当前中转站的 API URL 与 API Key', tone: colors.textSecondary }
  }, [colors, error, loading, models.length, selectedStation, testing])

  const saveStation = useCallback(async () => {
    if (!selectedStation) {
      toast('请先新增中转站')
      return false
    }
    const headerError = validateExtraHeaders(extraHeaders)
    setExtraHeadersError(headerError)
    if (headerError) {
      toast(headerError)
      return false
    }
    const normalized = normalizeBaseUrl(baseUrl)
    await stationAction.updateStation(selectedStation.id, {
      name: stationName.trim() || selectedStation.name,
      baseUrl: normalized || baseUrl.trim(),
      apiKey: apiKey.trim(),
      extraHeaders: extraHeaders.trim(),
    })
    if (normalized && normalized !== baseUrl.trim()) {
      setBaseUrl(normalized)
    }
    toast('中转站已保存')
    return true
  }, [apiKey, baseUrl, extraHeaders, selectedStation, stationName])

  const saveChat = useCallback(() => {
    const temp = parseFloat(temperature)
    const max = parseInt(maxTokens || '0', 10)
    settingAction.updateSetting({
      'chat.systemPrompt': systemPrompt,
      'chat.temperature': Number.isFinite(temp) ? temp : 0.7,
      'chat.maxTokens': Number.isFinite(max) ? max : 0,
    })
    toast('对话设置已保存')
  }, [systemPrompt, temperature, maxTokens])

  const testAndRefresh = useCallback(async () => {
    if (!selectedStation) {
      toast('请先新增中转站')
      return
    }
    if (!baseUrl.trim() || !apiKey.trim()) {
      toast('请先填写 API URL 和 API Key')
      return
    }
    if (!(await saveStation())) return
    setTesting(true)
    try {
      const refreshed = await modelAction.refresh(selectedStation.id)
      toast(`连接成功，共 ${refreshed?.length || 0} 个模型`)
    } catch (err: any) {
      toast(err?.message || '连接失败')
    } finally {
      setTesting(false)
    }
  }, [apiKey, baseUrl, saveStation, selectedStation])

  const selectDefaultModel = useCallback(async (modelId: string) => {
    if (!selectedStation) return
    await stationAction.updateStation(selectedStation.id, { defaultModel: modelId })
    toast(`默认模型：${modelId}`)
  }, [selectedStation])

  const addStation = useCallback(async () => {
    const station = await stationAction.addStation()
    setSelectedStationId(station.id)
    toast('已新增中转站')
  }, [])

  const setDefaultStation = useCallback(async () => {
    if (!selectedStation) return
    await stationAction.setDefault(selectedStation.id)
    toast(`默认中转站：${selectedStation.name}`)
  }, [selectedStation])

  const deleteStation = useCallback(() => {
    if (!selectedStation) return
    Alert.alert('删除中转站', `确定删除「${selectedStation.name}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void stationAction
            .removeStation(selectedStation.id)
            .then(() => {
              setSelectedStationId(stationAction.getDefault()?.id || null)
              toast('已删除中转站')
            })
            .catch((err: any) => toast(err?.message || '删除失败'))
        },
      },
    ])
  }, [selectedStation])

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.section, { color: colors.text }]}>中转站</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.stationHeaderRow}>
          <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 0 }]}>配置</Text>
          <ActionButton
            title="新增"
            variant="secondary"
            compact
            onPress={() => void addStation()}
            accessibilityLabel="新增中转站"
          />
        </View>
        <View style={styles.stationList}>
          {stations.map((station) => {
            const selected = station.id === selectedStation?.id
            const isDefault = station.id === defaultId
            return (
              <TouchableOpacity
                key={station.id}
                style={[
                  styles.stationChip,
                  {
                    backgroundColor: selected ? colors.primary : colors.surfaceSecondary,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setSelectedStationId(station.id)}
                accessibilityRole="button"
                accessibilityLabel={`${selected ? '当前' : '切换到'}中转站 ${station.name}${isDefault ? '，默认' : ''}`}
                accessibilityState={{ selected }}
              >
                <Text
                  style={[styles.stationChipName, { color: selected ? '#fff' : colors.text }]}
                  numberOfLines={1}
                >
                  {station.name}
                </Text>
                {isDefault ? (
                  <Text
                    style={[
                      styles.stationChipMeta,
                      { color: selected ? 'rgba(255,255,255,0.82)' : colors.textSecondary },
                    ]}
                  >
                    默认
                  </Text>
                ) : null}
              </TouchableOpacity>
            )
          })}
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: connectionStatus.tone }]} />
          <View style={styles.statusTextWrap}>
            <Text style={[styles.statusTitle, { color: colors.text }]}>
              {selectedStation?.name || '中转站'} · {connectionStatus.title}
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary, marginBottom: 0 }]}>
              {connectionStatus.desc}
            </Text>
          </View>
        </View>
        <FormField
          label="中转站名称"
          value={stationName}
          onChange={setStationName}
          placeholder="例如 OpenAI、DeepSeek、公司代理"
        />
        <FormField
          label="API URL"
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder="https://api.example.com 或 .../v1"
          keyboardType="url"
          helper="支持填主机或带 /v1 的地址，将自动规范化"
        />
        <FormField
          label="API Key"
          value={apiKey}
          onChange={setApiKey}
          placeholder="sk-..."
          secureTextEntry={!apiKeyVisible}
          accessibilityLabel="API Key"
          rightAccessory={
            <IconButton
              name={apiKeyVisible ? 'eye-off' : 'eye'}
              color={colors.primary}
              size={20}
              hitSlop={8}
              accessibilityLabel={apiKeyVisible ? '隐藏 API Key' : '显示 API Key'}
              onPress={() => setApiKeyVisible((v) => !v)}
            />
          }
        />
        <FormField
          label="额外请求头 (JSON，可选)"
          value={extraHeaders}
          onChange={(v) => {
            setExtraHeaders(v)
            if (extraHeadersError) setExtraHeadersError(validateExtraHeaders(v))
          }}
          placeholder='{"X-Custom":"value"}'
          multiline
          error={extraHeadersError}
        />
        <View style={styles.actionRowWrap}>
          <ActionButton
            title="保存"
            onPress={() => void saveStation()}
            style={styles.saveButton}
            accessibilityLabel="保存中转站配置"
          />
          <ActionButton
            title="测试"
            onPress={() => void testAndRefresh()}
            disabled={testing || loading}
            loading={testing || loading}
            style={[styles.saveButton, { backgroundColor: colors.primaryDark }]}
            accessibilityLabel="测试连接并刷新模型"
          />
          <ActionButton
            title="设默认"
            variant="secondary"
            onPress={() => void setDefaultStation()}
            disabled={!selectedStation || selectedStation.id === defaultId}
            style={styles.saveButton}
            accessibilityLabel="设为默认中转站"
          />
          <ActionButton
            title="删除"
            variant="danger"
            onPress={deleteStation}
            disabled={stations.length <= 1}
            style={styles.saveButton}
            accessibilityLabel="删除中转站"
          />
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 8 }]}>
          已缓存模型：{models.length} 个
          {selectedStation?.defaultModel ? ` · 默认 ${selectedStation.defaultModel}` : ''}
        </Text>
        {models.length > 0 ? (
          <View style={styles.modelBlock}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>默认模型</Text>
            <View style={styles.themeRow}>
              {models.slice(0, 8).map((item) => {
                const selected = item.id === selectedStation?.defaultModel
                const cap =
                  item.supportedVision == null
                    ? inferVisionCapability(item.id)
                    : item.supportedVision
                      ? 'vision'
                      : 'text'
                const capLabel = visionCapabilityLabel(cap)
                const capColor = cap === 'vision'
                  ? selected ? '#E9FFF4' : colors.success
                  : cap === 'text'
                    ? selected ? 'rgba(255,255,255,0.85)' : colors.textSecondary
                    : selected ? 'rgba(255,255,255,0.9)' : '#B45309'
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.modelChip,
                      {
                        backgroundColor: selected ? colors.primary : colors.surfaceSecondary,
                      },
                    ]}
                    onPress={() => void selectDefaultModel(item.id)}
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
      </View>

      <Text style={[styles.section, { color: colors.text }]}>对话</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <FormField
          label="系统提示词"
          value={systemPrompt}
          onChange={setSystemPrompt}
          multiline
        />
        <FormField
          label="Temperature"
          value={temperature}
          onChange={setTemperature}
          placeholder="0.7"
          keyboardType="decimal-pad"
        />
        <FormField
          label="Max Tokens（0 表示不限制）"
          value={maxTokens}
          onChange={setMaxTokens}
          placeholder="0"
          keyboardType="number-pad"
        />
        <View style={styles.switchRow}>
          <View style={styles.switchTextWrap}>
            <Text style={{ color: colors.text }}>流式输出</Text>
            <Text style={[styles.switchHint, { color: colors.textSecondary }]}>
              关闭后将等待完整回复返回，再一次性显示。
            </Text>
          </View>
          <Switch
            value={setting['chat.stream']}
            onValueChange={(v) => {
              settingAction.updateSetting({ 'chat.stream': v })
              toast(v ? '已开启流式输出' : '已关闭流式输出')
            }}
            trackColor={{ false: colors.surfaceSecondary, true: colors.primary }}
            thumbColor={setting['chat.stream'] ? colors.textInverse : colors.surface}
            ios_backgroundColor={colors.surfaceSecondary}
            accessibilityRole="switch"
            accessibilityLabel="流式输出"
            accessibilityState={{ checked: setting['chat.stream'] }}
          />
        </View>
        <ActionButton
          title="保存"
          onPress={saveChat}
          style={styles.saveButton}
          accessibilityLabel="保存对话设置"
        />
      </View>

      <Text style={[styles.section, { color: colors.text }]}>外观</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>主题</Text>
        <View style={styles.themeRow}>
          {themeList.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.themeChip,
                {
                  backgroundColor:
                    setting['theme.id'] === t.id ? colors.primary : colors.surfaceSecondary,
                },
              ]}
              onPress={() => {
                settingAction.updateSetting({ 'theme.id': t.id })
                themeAction.applyTheme(t.id)
              }}
              accessibilityRole="button"
              accessibilityLabel={`切换主题 ${t.name}`}
              accessibilityState={{ selected: setting['theme.id'] === t.id }}
            >
              <Text
                style={{
                  color: setting['theme.id'] === t.id ? '#fff' : colors.text,
                  fontWeight: '600',
                }}
              >
                {t.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>
          字号
        </Text>
        <View style={styles.themeRow}>
          {FONT_SIZE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.themeChip,
                {
                  backgroundColor:
                    setting['common.fontSize'] === option.value
                      ? colors.primary
                      : colors.surfaceSecondary,
                },
              ]}
              onPress={() => {
                settingAction.updateSetting({ 'common.fontSize': option.value })
                global.lx.fontSize = option.value
              }}
              accessibilityRole="button"
              accessibilityLabel={`设置字号 ${option.label}`}
              accessibilityState={{ selected: setting['common.fontSize'] === option.value }}
            >
              <Text
                style={{
                  color: setting['common.fontSize'] === option.value ? '#fff' : colors.text,
                }}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={[styles.section, { color: colors.text }]}>关于</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.text, lineHeight: 22 }}>
          IKUN Chat Mobile V{appVersion}{'\n'}
          通用 OpenAI 兼容中转站客户端
        </Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  section: { fontSize: 16, fontWeight: '700', marginBottom: 8, marginTop: 8 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  label: { fontSize: 13, marginBottom: 6 },
  hint: { fontSize: 12, marginBottom: 8 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.35)',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  statusTextWrap: { flex: 1 },
  statusTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  stationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stationList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  stationChip: {
    maxWidth: '100%',
    minHeight: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stationChipName: {
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 180,
  },
  stationChipMeta: {
    fontSize: 10,
    fontWeight: '700',
  },
  saveButton: {
    width: 104,
    alignSelf: 'flex-start',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  switchTextWrap: {
    flex: 1,
  },
  switchHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modelBlock: { marginTop: 10 },
  modelChip: {
    maxWidth: '100%',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
})

export default Setting
