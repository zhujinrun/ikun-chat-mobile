import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native'
import { useTheme } from '@/store/theme/hook'
import { useSetting } from '@/store/setting/hook'
import settingAction from '@/store/setting/action'
import modelAction from '@/store/model/action'
import { useModels } from '@/store/model/hook'
import stationAction from '@/store/station/action'
import { useStations } from '@/store/station/hook'
import { useConversations } from '@/store/conversation/hook'
import { toast } from '@/utils/toast'
import { normalizeBaseUrl } from '@/core/api'
import ActionButton from '@/components/common/ActionButton'
import FormField from '@/components/common/FormField'
import IconButton from '@/components/common/IconButton'
import AppearanceSettings from './AppearanceSettings'
import DefaultModelList from './DefaultModelList'
import SettingOptionGroup from './SettingOptionGroup'
import SettingSection from './SettingSection'
import StationPager from './StationPager'
import {
  ENDPOINT_MODE_OPTIONS,
  FILE_HANDLING_OPTIONS,
  validateExtraHeaders,
} from './settingOptions'

const appVersion = require('../../../package.json').version as string

const Setting = () => {
  const theme = useTheme()
  const setting = useSetting()
  const { stations, defaultId } = useStations()
  const conversations = useConversations()
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
  const stationUsageCounts = useMemo(() => {
    return conversations.reduce<Record<string, number>>((acc, item) => {
      if (!item.stationId) return acc
      acc[item.stationId] = (acc[item.stationId] || 0) + 1
      return acc
    }, {})
  }, [conversations])
  const selectedUsageCount = selectedStation ? stationUsageCounts[selectedStation.id] || 0 : 0
  const selectedIsDefault = !!selectedStation && selectedStation.id === defaultId
  const deleteDisabled = stations.length <= 1 || selectedIsDefault || selectedUsageCount > 0
  const deleteDisabledReason =
    stations.length <= 1
      ? '至少保留一个中转站，当前不能删除。'
      : selectedUsageCount > 0
        ? `当前中转站已被 ${selectedUsageCount} 个会话使用，不能删除。`
        : ''

  const [stationName, setStationName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [extraHeaders, setExtraHeaders] = useState('')
  const [extraHeadersError, setExtraHeadersError] = useState<string | null>(null)
  const [endpointMode, setEndpointMode] = useState<LX.ApiEndpointMode>('chat_completions')
  const [fileHandling, setFileHandling] = useState<LX.FileHandlingMode>('local_extract')
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
    setEndpointMode(selectedStation.endpointMode || 'chat_completions')
    setFileHandling(selectedStation.fileHandling || 'local_extract')
    setExtraHeadersError(null)
  }, [
    selectedStation?.apiKey,
    selectedStation?.baseUrl,
    selectedStation?.endpointMode,
    selectedStation?.extraHeaders,
    selectedStation?.fileHandling,
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
    const safeFileHandling = endpointMode === 'responses' ? fileHandling : 'local_extract'
    await stationAction.updateStation(selectedStation.id, {
      name: stationName.trim() || selectedStation.name,
      baseUrl: normalized || baseUrl.trim(),
      apiKey: apiKey.trim(),
      extraHeaders: extraHeaders.trim(),
      endpointMode,
      fileHandling: safeFileHandling,
    })
    if (safeFileHandling !== fileHandling) setFileHandling(safeFileHandling)
    if (normalized && normalized !== baseUrl.trim()) {
      setBaseUrl(normalized)
    }
    toast('中转站已保存')
    return true
  }, [apiKey, baseUrl, endpointMode, extraHeaders, fileHandling, selectedStation, stationName])

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
    if (stations.length <= 1) {
      toast('至少保留一个中转站')
      return
    }
    if (selectedIsDefault) {
      toast('默认中转站不能删除，请先切换默认中转站')
      return
    }
    if (selectedUsageCount > 0) {
      toast(`当前中转站已被 ${selectedUsageCount} 个会话使用，不能删除`)
      return
    }
    Alert.alert('删除中转站', `确定删除「${selectedStation.name}」？未被会话使用的中转站才可删除。`, [
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
  }, [selectedIsDefault, selectedStation, selectedUsageCount, stations.length])

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <SettingSection title="中转站">
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
        <StationPager
          stations={stations}
          defaultId={defaultId}
          selectedStationId={selectedStation?.id}
          usageCounts={stationUsageCounts}
          onSelect={setSelectedStationId}
        />
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
        <SettingOptionGroup
          label="接口模式"
          options={ENDPOINT_MODE_OPTIONS}
          value={endpointMode}
          accessibilityLabelPrefix="接口模式"
          onSelect={(value) => {
            setEndpointMode(value)
            if (value !== 'responses') setFileHandling('local_extract')
          }}
        />
        <SettingOptionGroup
          label="文件处理"
          options={FILE_HANDLING_OPTIONS}
          value={fileHandling}
          accessibilityLabelPrefix="文件处理"
          labelMarginTop={10}
          isOptionDisabled={(option) =>
            option.value === 'direct_file' && endpointMode !== 'responses'
          }
          onDisabledPress={() => toast('原文件直传需要先选择 Responses 接口模式')}
          onSelect={setFileHandling}
        />
        <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 8 }]}>
          原文件直传会把附件作为 input_file 发送；不支持 Responses 的中转站请使用本地解析。
        </Text>
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
            compact
            onPress={() => void saveStation()}
            style={styles.saveButton}
            accessibilityLabel="保存中转站配置"
          />
          <ActionButton
            title="测试"
            compact
            onPress={() => void testAndRefresh()}
            disabled={testing || loading}
            loading={testing || loading}
            style={[styles.saveButton, { backgroundColor: colors.primaryDark }]}
            accessibilityLabel="测试连接并刷新模型"
          />
          {!selectedIsDefault ? (
            <>
              <ActionButton
                title="设默认"
                variant="secondary"
                compact
                onPress={() => void setDefaultStation()}
                disabled={!selectedStation}
                style={styles.saveButton}
                accessibilityLabel="设为默认中转站"
              />
              <ActionButton
                title="删除"
                variant="danger"
                compact
                onPress={deleteStation}
                disabled={deleteDisabled}
                style={styles.saveButton}
                accessibilityLabel={deleteDisabledReason || '删除中转站'}
              />
            </>
          ) : null}
        </View>
        {deleteDisabledReason ? (
          <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 8 }]}>
            {deleteDisabledReason}
          </Text>
        ) : null}
        <DefaultModelList
          models={models}
          defaultModel={selectedStation?.defaultModel}
          onSelect={(modelId) => void selectDefaultModel(modelId)}
        />
      </SettingSection>

      <SettingSection title="对话">
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
          compact
          onPress={saveChat}
          style={styles.saveButton}
          accessibilityLabel="保存对话设置"
        />
      </SettingSection>

      <SettingSection title="外观">
        <AppearanceSettings />
      </SettingSection>

      <SettingSection title="关于">
        <Text style={{ color: colors.text, lineHeight: 22 }}>
          IKUN Chat Mobile V{appVersion}{'\n'}
          通用 OpenAI 兼容中转站客户端
        </Text>
      </SettingSection>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
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
  actionRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  actionRowWrap: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    marginTop: 4,
  },
  stationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  saveButton: {
    width: 68,
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
})

export default Setting
