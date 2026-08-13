import { useCallback, useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import ActionButton from '@/components/common/ActionButton'
import FormField from '@/components/common/FormField'
import settingAction from '@/store/setting/action'
import { useSetting } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { toast } from '@/utils/toast'

const ChatSettings = () => {
  const setting = useSetting()
  const { colors } = useTheme()
  const [systemPrompt, setSystemPrompt] = useState(setting['chat.systemPrompt'])
  const [temperature, setTemperature] = useState(String(setting['chat.temperature']))
  const [maxTokens, setMaxTokens] = useState(String(setting['chat.maxTokens'] || ''))

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

  return (
    <>
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
          onValueChange={(value) => {
            settingAction.updateSetting({ 'chat.stream': value })
            toast(value ? '已开启流式输出' : '已关闭流式输出')
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
    </>
  )
}

const styles = StyleSheet.create({
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

export default ChatSettings
