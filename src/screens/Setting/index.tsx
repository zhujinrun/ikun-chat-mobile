import { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
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

type Props = {
  componentId: string
}

const Setting = (_props: Props) => {
  const theme = useTheme()
  const setting = useSetting()
  const { models, loading } = useModels()
  const colors = theme.colors

  const [baseUrl, setBaseUrl] = useState(setting['api.baseUrl'])
  const [apiKey, setApiKey] = useState(setting['api.apiKey'])
  const [extraHeaders, setExtraHeaders] = useState(setting['api.extraHeaders'])
  const [systemPrompt, setSystemPrompt] = useState(setting['chat.systemPrompt'])
  const [temperature, setTemperature] = useState(String(setting['chat.temperature']))
  const [maxTokens, setMaxTokens] = useState(String(setting['chat.maxTokens'] || ''))
  const [testing, setTesting] = useState(false)

  const saveApi = useCallback(() => {
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
    saveApi()
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
  }, [saveApi])

  const Field = ({
    label,
    value,
    onChange,
    placeholder,
    secure,
    multiline,
  }: {
    label: string
    value: string
    onChange: (v: string) => void
    placeholder?: string
    secure?: boolean
    multiline?: boolean
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
        <Field
          label="API URL"
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder="https://api.example.com 或 .../v1"
        />
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          支持填主机或带 /v1 的地址，将自动规范化
        </Text>
        <Field
          label="API Key"
          value={apiKey}
          onChange={setApiKey}
          placeholder="sk-..."
          secure
        />
        <Field
          label="额外请求头 (JSON，可选)"
          value={extraHeaders}
          onChange={setExtraHeaders}
          placeholder='{"X-Custom":"value"}'
          multiline
        />
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={saveApi}
          >
            <Text style={styles.btnText}>保存</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primaryDark }]}
            onPress={() => void testAndRefresh()}
            disabled={testing || loading}
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
      </View>

      <Text style={[styles.section, { color: colors.text }]}>对话默认</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Field
          label="系统提示词"
          value={systemPrompt}
          onChange={setSystemPrompt}
          multiline
        />
        <Field label="Temperature" value={temperature} onChange={setTemperature} placeholder="0.7" />
        <Field
          label="Max Tokens（0 表示不限制）"
          value={maxTokens}
          onChange={setMaxTokens}
          placeholder="0"
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
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
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
})

export default Setting
