import { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  type KeyboardTypeOptions,
} from 'react-native'
import { useTheme } from '@/store/theme/hook'
import { useSetting } from '@/store/setting/hook'
import settingAction from '@/store/setting/action'
import themeAction from '@/store/theme/action'
import modelAction from '@/store/model/action'
import { useModels } from '@/store/model/hook'
import { themeList } from '@/theme/themes'
import { toast } from '@/utils/toast'
import { normalizeBaseUrl } from '@/core/api'
import IconButton from '@/components/common/IconButton'

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
  const { models, loading, error } = useModels()
  const colors = theme.colors

  const [baseUrl, setBaseUrl] = useState(setting['api.baseUrl'])
  const [apiKey, setApiKey] = useState(setting['api.apiKey'])
  const [extraHeaders, setExtraHeaders] = useState(setting['api.extraHeaders'])
  const [extraHeadersError, setExtraHeadersError] = useState<string | null>(null)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState(setting['chat.systemPrompt'])
  const [temperature, setTemperature] = useState(String(setting['chat.temperature']))
  const [maxTokens, setMaxTokens] = useState(String(setting['chat.maxTokens'] || ''))
  const [testing, setTesting] = useState(false)

  const connectionStatus = useMemo(() => {
    if (testing || loading) {
      return { title: '正在测试连接', desc: '正在拉取模型列表…', tone: colors.primary }
    }
    if (error) {
      return { title: '连接失败', desc: error, tone: colors.error }
    }
    if (setting['api.baseUrl'] && setting['api.apiKey'] && models.length > 0) {
      return {
        title: '连接正常',
        desc: `已缓存 ${models.length} 个模型${setting['api.defaultModel'] ? ` · 默认 ${setting['api.defaultModel']}` : ''}`,
        tone: colors.success,
      }
    }
    if (setting['api.baseUrl'] && setting['api.apiKey']) {
      return { title: '待测试', desc: '保存后测试连接即可刷新模型', tone: colors.primaryDark }
    }
    return { title: '未配置', desc: '请填写 API URL 与 API Key', tone: colors.textSecondary }
  }, [colors, error, loading, models.length, setting, testing])

  const saveApi = useCallback(() => {
    const headerError = validateExtraHeaders(extraHeaders)
    setExtraHeadersError(headerError)
    if (headerError) {
      toast(headerError)
      return false
    }
    const normalized = normalizeBaseUrl(baseUrl)
    settingAction.updateSetting({
      'api.baseUrl': normalized || baseUrl.trim(),
      'api.apiKey': apiKey.trim(),
      'api.extraHeaders': extraHeaders.trim(),
    })
    if (normalized && normalized !== baseUrl.trim()) {
      setBaseUrl(normalized)
    }
    toast('API 配置已保存')
    return true
  }, [baseUrl, apiKey, extraHeaders])

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
    if (!baseUrl.trim() || !apiKey.trim()) {
      toast('请先填写 API URL 和 API Key')
      return
    }
    if (!saveApi()) return
    setTesting(true)
    try {
      await modelAction.refresh()
      // refresh 后从 store 读最新数量
      const { default: modelState } = await import('@/store/model/state')
      toast(`连接成功，共 ${modelState.models.length} 个模型`)
    } catch (err: any) {
      toast(err?.message || '连接失败')
    } finally {
      setTesting(false)
    }
  }, [apiKey, baseUrl, saveApi])

  const selectDefaultModel = useCallback((modelId: string) => {
    settingAction.updateSetting({ 'api.defaultModel': modelId })
    toast(`默认模型：${modelId}`)
  }, [])

  const Field = ({
    label,
    value,
    onChange,
    placeholder,
    secure,
    multiline,
    keyboardType,
  }: {
    label: string
    value: string
    onChange: (v: string) => void
    placeholder?: string
    secure?: boolean
    multiline?: boolean
    keyboardType?: KeyboardTypeOptions
  }) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.inputMulti,
          {
            backgroundColor: colors.inputBg,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  )

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.section, { color: colors.text }]}>中转站</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: connectionStatus.tone }]} />
          <View style={styles.statusTextWrap}>
            <Text style={[styles.statusTitle, { color: colors.text }]}>
              {connectionStatus.title}
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary, marginBottom: 0 }]}>
              {connectionStatus.desc}
            </Text>
          </View>
        </View>
        <Field
          label="API URL"
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder="https://api.example.com 或 .../v1"
          keyboardType="url"
        />
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          支持填主机或带 /v1 的地址，将自动规范化
        </Text>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>API Key</Text>
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
              },
            ]}
          >
            <TextInput
              style={[styles.inputInline, { color: colors.text }]}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="sk-..."
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!apiKeyVisible}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <IconButton
              name={apiKeyVisible ? 'eye-off' : 'eye'}
              color={colors.primary}
              size={20}
              hitSlop={8}
              accessibilityLabel={apiKeyVisible ? '隐藏 API Key' : '显示 API Key'}
              onPress={() => setApiKeyVisible((v) => !v)}
            />
          </View>
        </View>
        <Field
          label="额外请求头 (JSON，可选)"
          value={extraHeaders}
          onChange={(v) => {
            setExtraHeaders(v)
            if (extraHeadersError) setExtraHeadersError(validateExtraHeaders(v))
          }}
          placeholder='{"X-Custom":"value"}'
          multiline
        />
        {extraHeadersError ? (
          <Text style={[styles.errorText, { color: colors.error }]}>{extraHeadersError}</Text>
        ) : null}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={saveApi}
            accessibilityRole="button"
            accessibilityLabel="保存 API 配置"
          >
            <Text style={styles.btnText}>保存</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primaryDark }]}
            onPress={() => void testAndRefresh()}
            disabled={testing || loading}
            accessibilityRole="button"
            accessibilityLabel="测试连接并刷新模型"
          >
            {testing || loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>测试并刷新模型</Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 8 }]}>
          已缓存模型：{models.length} 个
          {setting['api.defaultModel'] ? ` · 默认 ${setting['api.defaultModel']}` : ''}
        </Text>
        {models.length > 0 ? (
          <View style={styles.modelBlock}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>默认模型</Text>
            <View style={styles.themeRow}>
              {models.slice(0, 8).map((item) => {
                const selected = item.id === setting['api.defaultModel']
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.modelChip,
                      {
                        backgroundColor: selected ? colors.primary : colors.surfaceSecondary,
                      },
                    ]}
                    onPress={() => selectDefaultModel(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={selected ? `默认模型 ${item.id}` : `设为默认模型 ${item.id}`}
                  >
                    <Text
                      style={{
                        color: selected ? '#fff' : colors.text,
                        fontWeight: selected ? '700' : '500',
                      }}
                      numberOfLines={1}
                    >
                      {item.id}
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

      <Text style={[styles.section, { color: colors.text }]}>对话默认</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Field
          label="系统提示词"
          value={systemPrompt}
          onChange={setSystemPrompt}
          multiline
        />
        <Field
          label="Temperature"
          value={temperature}
          onChange={setTemperature}
          placeholder="0.7"
          keyboardType="decimal-pad"
        />
        <Field
          label="Max Tokens（0 表示不限制）"
          value={maxTokens}
          onChange={setMaxTokens}
          placeholder="0"
          keyboardType="number-pad"
        />
        <View style={styles.switchRow}>
          <Text style={{ color: colors.text }}>流式输出</Text>
          <Switch
            value={setting['chat.stream']}
            onValueChange={(v) => settingAction.updateSetting({ 'chat.stream': v })}
            trackColor={{ true: colors.primary }}
          />
        </View>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary, alignSelf: 'flex-start' }]}
          onPress={saveChat}
          accessibilityRole="button"
          accessibilityLabel="保存对话设置"
        >
          <Text style={styles.btnText}>保存对话设置</Text>
        </TouchableOpacity>
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
          字号：{setting['common.fontSize']}
        </Text>
        <View style={styles.themeRow}>
          {[14, 16, 18, 20].map((size) => (
            <TouchableOpacity
              key={size}
              style={[
                styles.themeChip,
                {
                  backgroundColor:
                    setting['common.fontSize'] === size
                      ? colors.primary
                      : colors.surfaceSecondary,
                },
              ]}
              onPress={() => {
                settingAction.updateSetting({ 'common.fontSize': size })
                global.lx.fontSize = size
              }}
              accessibilityRole="button"
              accessibilityLabel={`设置字号 ${size}`}
            >
              <Text
                style={{
                  color: setting['common.fontSize'] === size ? '#fff' : colors.text,
                }}
              >
                {size}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={[styles.section, { color: colors.text }]}>关于</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.text, lineHeight: 22 }}>
          IKUN Chat Mobile{'\n'}
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
  field: { marginBottom: 10 },
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
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inputInline: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  errorText: { fontSize: 12, marginTop: -4, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 88,
  },
  btnText: { color: '#fff', fontWeight: '700' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
