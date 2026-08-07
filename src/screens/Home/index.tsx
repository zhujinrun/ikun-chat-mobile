import { useCallback, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTheme } from '@/store/theme/hook'
import {
  useActiveConversationId,
  useConversations,
  useMessages,
} from '@/store/conversation/hook'
import conversationAction from '@/store/conversation/action'
import conversationState from '@/store/conversation/state'
import chatAction from '@/store/chat/action'
import { useStreaming } from '@/store/chat/hook'
import { useModels } from '@/store/model/hook'
import settingAction from '@/store/setting/action'
import { useSettingValue } from '@/store/setting/hook'
import { navigations } from '@/navigation'
import { toast } from '@/utils/toast'

type Props = {
  componentId: string
}

const Home = ({ componentId }: Props) => {
  const theme = useTheme()
  const conversations = useConversations()
  const activeId = useActiveConversationId()
  const messages = useMessages(activeId)
  const streaming = useStreaming()
  const { models } = useModels()
  const defaultModel = useSettingValue('api.defaultModel')
  const apiUrl = useSettingValue('api.baseUrl')
  const apiKey = useSettingValue('api.apiKey')
  const fontSize = useSettingValue('common.fontSize')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [input, setInput] = useState('')
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
  const [renameText, setRenameText] = useState('')
  const listRef = useRef<FlatList>(null)

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  )

  const currentModel = active?.model || defaultModel || '未选择模型'
  const needSetup = !apiUrl || !apiKey

  const colors = theme.colors

  const handleNewChat = useCallback(async () => {
    await conversationAction.createConversation()
    setDrawerOpen(false)
  }, [])

  const handleSelectChat = useCallback(async (id: string) => {
    await conversationAction.setActive(id)
    setDrawerOpen(false)
  }, [])

  const handleDeleteChat = useCallback((id: string, title: string) => {
    Alert.alert('删除会话', `确定删除「${title}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void conversationAction.remove(id)
        },
      },
    ])
  }, [])

  const handleRenameChat = useCallback((id: string, title: string) => {
    setRenameTarget({ id, title })
    setRenameText(title)
  }, [])

  const confirmRename = useCallback(() => {
    if (!renameTarget) return
    void conversationAction.rename(renameTarget.id, renameText)
    setRenameTarget(null)
  }, [renameTarget, renameText])

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return
    if (needSetup) {
      toast('请先在设置中配置 API URL 和 API Key')
      void navigations.pushSettingScreen(componentId)
      return
    }
    const text = input
    setInput('')
    try {
      await chatAction.send(text)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    } catch (err: any) {
      toast(err?.message || '发送失败')
    }
  }, [input, streaming, needSetup, componentId])

  const handleStop = useCallback(() => {
    chatAction.stop()
  }, [])

  const handleSelectModel = useCallback(
    async (modelId: string) => {
      settingAction.updateSetting({ 'api.defaultModel': modelId })
      if (activeId) {
        await conversationAction.updateConversation(activeId, { model: modelId })
      }
      setModelPickerOpen(false)
      toast(`已切换：${modelId}`)
    },
    [activeId]
  )

  const handleCopy = useCallback((content: string) => {
    Clipboard.setString(content)
    toast('已复制')
  }, [])

  const handleRegenerate = useCallback(async () => {
    if (streaming) return
    if (needSetup) {
      toast('请先在设置中配置 API URL 和 API Key')
      void navigations.pushSettingScreen(componentId)
      return
    }
    try {
      await chatAction.regenerate()
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    } catch (err: any) {
      toast(err?.message || '重新生成失败')
    }
  }, [streaming, needSetup, componentId])

  const canRegenerate = useMemo(() => {
    if (streaming || !messages.length) return false
    return chatAction.canRegenerate()
  }, [streaming, messages])

  const lastMessageId = messages.length ? messages[messages.length - 1].id : null

  const handleClear = useCallback(() => {
    if (!activeId) return
    Alert.alert('清空会话', '确定清空当前会话的所有消息？', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => {
          void conversationAction.clearMessages(activeId)
        },
      },
    ])
  }, [activeId])

  const handleMessageLongPress = useCallback(
    (item: LX.ChatMessage) => {
      const isLast = item.id === lastMessageId
      const buttons: {
        text: string
        style?: 'cancel' | 'destructive' | 'default'
        onPress?: () => void
      }[] = [{ text: '取消', style: 'cancel' }]

      if (item.content) {
        buttons.push({
          text: '复制',
          onPress: () => handleCopy(item.content),
        })
      }
      if (canRegenerate && isLast) {
        buttons.push({
          text: '重新生成',
          onPress: () => {
            void handleRegenerate()
          },
        })
      }
      if (buttons.length <= 1) return
      Alert.alert('消息', undefined, buttons)
    },
    [lastMessageId, canRegenerate, handleCopy, handleRegenerate]
  )

  const renderMessage = useCallback(
    ({ item }: { item: LX.ChatMessage }) => {
      const isUser = item.role === 'user'
      const isError = item.role === 'error'
      const isLast = item.id === lastMessageId
      const showRegenActions = canRegenerate && isLast && !isUser
      const bubbleBg = isError
        ? colors.error
        : isUser
          ? colors.userBubble
          : colors.assistantBubble
      const textColor = isUser || isError ? colors.textInverse : colors.text
      const isStreamingThis =
        streaming && item.id === conversationState.messages[activeId || '']?.slice(-1)[0]?.id

      return (
        <View
          style={[
            styles.bubbleWrap,
            isUser ? styles.bubbleRight : styles.bubbleLeft,
          ]}
        >
          <Pressable onLongPress={() => handleMessageLongPress(item)}>
            <View
              style={[
                styles.bubble,
                {
                  backgroundColor: bubbleBg,
                  borderColor: colors.border,
                  borderWidth: isUser ? 0 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Text style={{ color: textColor, fontSize: fontSize, lineHeight: fontSize * 1.5 }}>
                {item.content || (isStreamingThis ? '…' : '')}
                {!item.content && streaming ? '正在思考…' : ''}
              </Text>
            </View>
          </Pressable>
          {showRegenActions ? (
            <View style={styles.msgActions}>
              {item.content ? (
                <TouchableOpacity
                  onPress={() => handleCopy(item.content)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.msgActionText, { color: colors.textSecondary }]}>复制</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => void handleRegenerate()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.msgActionText, { color: colors.primary }]}>重新生成</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      )
    },
    [
      colors,
      fontSize,
      handleCopy,
      handleMessageLongPress,
      handleRegenerate,
      streaming,
      activeId,
      lastMessageId,
      canRegenerate,
    ]
  )

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setDrawerOpen(true)}>
          <Text style={[styles.headerBtnText, { color: colors.primary }]}>菜单</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} onPress={() => setModelPickerOpen(true)}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {active?.title || 'IKUN Chat'}
          </Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {currentModel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => void navigations.pushSettingScreen(componentId)}
        >
          <Text style={[styles.headerBtnText, { color: colors.primary }]}>设置</Text>
        </TouchableOpacity>
      </View>

      {needSetup ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>尚未配置中转站，请先填写 API URL 与 API Key</Text>
          <TouchableOpacity onPress={() => void navigations.pushSettingScreen(componentId)}>
            <Text style={styles.bannerAction}>去设置</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>开始对话</Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
              配置中转站后，选择模型即可聊天。长按消息可复制；助手回复可重新生成。
            </Text>
          </View>
        }
      />

      {/* Composer */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.composer,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
          ]}
        >
          <TouchableOpacity onPress={handleClear} style={styles.sideBtn}>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>清空</Text>
          </TouchableOpacity>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                color: colors.text,
                borderColor: colors.border,
                fontSize,
              },
            ]}
            placeholder="输入消息…"
            placeholderTextColor={colors.textSecondary}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={20000}
            editable={!streaming}
          />
          {streaming ? (
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.error }]}
              onPress={handleStop}
            >
              <Text style={styles.sendText}>停止</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: input.trim() ? colors.primary : colors.surfaceSecondary },
              ]}
              onPress={() => void handleSend()}
              disabled={!input.trim()}
            >
              <Text style={styles.sendText}>发送</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Drawer */}
      <Modal visible={drawerOpen} animationType="fade" transparent onRequestClose={() => setDrawerOpen(false)}>
        <Pressable style={styles.modalMask} onPress={() => setDrawerOpen(false)}>
          <Pressable
            style={[styles.drawer, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.drawerTitle, { color: colors.text }]}>会话</Text>
            <TouchableOpacity
              style={[styles.newChatBtn, { backgroundColor: colors.primary }]}
              onPress={() => void handleNewChat()}
            >
              <Text style={styles.newChatText}>+ 新对话</Text>
            </TouchableOpacity>
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.convItem,
                    item.id === activeId && { backgroundColor: colors.surfaceSecondary },
                  ]}
                  onPress={() => void handleSelectChat(item.id)}
                  onLongPress={() => {
                    Alert.alert(item.title, undefined, [
                      { text: '取消', style: 'cancel' },
                      {
                        text: '重命名',
                        onPress: () => handleRenameChat(item.id, item.title),
                      },
                      {
                        text: '删除',
                        style: 'destructive',
                        onPress: () => handleDeleteChat(item.id, item.title),
                      },
                    ])
                  }}
                >
                  <Text style={{ color: colors.text }} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                    {item.model || '默认模型'}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.textSecondary, padding: 12 }}>暂无会话</Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Model picker */}
      <Modal
        visible={modelPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModelPickerOpen(false)}
      >
        <Pressable style={styles.modalMask} onPress={() => setModelPickerOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.drawerTitle, { color: colors.text }]}>选择模型</Text>
            <FlatList
              data={models}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.convItem,
                    item.id === currentModel && { backgroundColor: colors.surfaceSecondary },
                  ]}
                  onPress={() => void handleSelectModel(item.id)}
                >
                  <Text style={{ color: colors.text }}>{item.id}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.textSecondary, padding: 12 }}>
                  暂无模型，请先在设置中测试连接并刷新模型
                </Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename dialog */}
      <Modal
        visible={!!renameTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <Pressable style={styles.renameMask} onPress={() => setRenameTarget(null)}>
          <Pressable
            style={[styles.renameBox, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.drawerTitle, { color: colors.text }]}>重命名会话</Text>
            <TextInput
              style={[
                styles.input,
                styles.renameInput,
                {
                  backgroundColor: colors.inputBg,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
            />
            <View style={styles.renameActions}>
              <TouchableOpacity
                style={styles.renameActionBtn}
                onPress={() => setRenameTarget(null)}
              >
                <Text style={[styles.renameActionText, { color: colors.textSecondary }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.renameActionBtn} onPress={confirmRename}>
                <Text
                  style={[styles.renameActionText, { color: colors.primary, fontWeight: '700' }]}
                >
                  保存
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

Home.options = {
  topBar: { visible: false },
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 10,
  },
  headerBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  headerBtnText: { fontSize: 15, fontWeight: '600' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 2 },
  banner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerText: { color: '#92400E', flex: 1, fontSize: 13 },
  bannerAction: { color: '#B45309', fontWeight: '700', marginLeft: 8 },
  listContent: { padding: 12, paddingBottom: 24, flexGrow: 1 },
  bubbleWrap: { marginVertical: 4, maxWidth: '88%' },
  bubbleLeft: { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  msgActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  msgActionText: { fontSize: 13, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  sideBtn: { paddingBottom: 12, paddingHorizontal: 4 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendBtn: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 2,
  },
  sendText: { color: '#fff', fontWeight: '700' },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', flexDirection: 'row' },
  drawer: { width: '78%', maxWidth: 320, height: '100%', paddingTop: 48, paddingHorizontal: 12 },
  drawerTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  newChatBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  newChatText: { color: '#fff', fontWeight: '700' },
  convItem: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8, marginBottom: 4 },
  sheet: {
    marginTop: 'auto',
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
  renameMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  renameBox: {
    borderRadius: 14,
    padding: 16,
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  renameInput: {
    flex: 0,
    width: '100%',
    marginBottom: 12,
  },
  renameActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 4,
  },
  renameActionBtn: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  renameActionText: {
    lineHeight: 20,
  },
})

export default Home
