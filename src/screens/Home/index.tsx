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
  Share,
} from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTheme } from '@/store/theme/hook'
import {
  useActiveConversationId,
  useConversations,
  useMessages,
} from '@/store/conversation/hook'
import conversationAction from '@/store/conversation/action'
import chatAction from '@/store/chat/action'
import { useStreaming, useStreamingMessageId } from '@/store/chat/hook'
import { useModels } from '@/store/model/hook'
import settingAction from '@/store/setting/action'
import { useSettingValue } from '@/store/setting/hook'
import { navigations } from '@/navigation'
import { toast } from '@/utils/toast'
import { formatConversationText } from '@/utils/exportConversation'
import MarkdownContent from '@/components/chat/MarkdownContent'

type Props = {
  componentId: string
}

type EditTarget = {
  id: string
  content: string
}

const Home = ({ componentId }: Props) => {
  const theme = useTheme()
  const conversations = useConversations()
  const activeId = useActiveConversationId()
  const messages = useMessages(activeId)
  const streaming = useStreaming()
  const streamingMessageId = useStreamingMessageId()
  const { models } = useModels()
  const defaultModel = useSettingValue('api.defaultModel')
  const apiUrl = useSettingValue('api.baseUrl')
  const apiKey = useSettingValue('api.apiKey')
  const fontSize = useSettingValue('common.fontSize')
  const globalSystemPrompt = useSettingValue('chat.systemPrompt')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [input, setInput] = useState('')
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
  const [renameText, setRenameText] = useState('')
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const listRef = useRef<FlatList>(null)

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  )

  const currentModel = active?.model || defaultModel || '未选择模型'
  const needSetup = !apiUrl || !apiKey
  const hasConvPrompt = !!(active?.systemPrompt && active.systemPrompt.trim())
  const colors = theme.colors

  const ensureReady = useCallback(() => {
    if (needSetup) {
      toast('请先在设置中配置 API URL 和 API Key')
      void navigations.pushSettingScreen(componentId)
      return false
    }
    return true
  }, [needSetup, componentId])

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
  }, [])

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
    if (!ensureReady()) return
    const text = input
    setInput('')
    try {
      await chatAction.send(text)
      scrollToEnd()
    } catch (err: any) {
      toast(err?.message || '发送失败')
    }
  }, [input, streaming, ensureReady, scrollToEnd])

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
    if (!ensureReady()) return
    try {
      await chatAction.regenerate()
      scrollToEnd()
    } catch (err: any) {
      toast(err?.message || '重新生成失败')
    }
  }, [streaming, ensureReady, scrollToEnd])

  const handleRetry = useCallback(async () => {
    if (streaming) return
    if (!ensureReady()) return
    try {
      await chatAction.retry()
      scrollToEnd()
    } catch (err: any) {
      toast(err?.message || '重试失败')
    }
  }, [streaming, ensureReady, scrollToEnd])

  const canRegenerate = useMemo(() => {
    if (streaming || !messages.length) return false
    return chatAction.canRegenerate()
  }, [streaming, messages])

  const lastMessageId = messages.length ? messages[messages.length - 1].id : null

  // 清空入口暂隐藏（左侧只保留提示词）；需要时取消注释即可
  // const handleClear = useCallback(() => {
  //   if (!activeId) return
  //   Alert.alert('清空会话', '确定清空当前会话的所有消息？', [
  //     { text: '取消', style: 'cancel' },
  //     {
  //       text: '清空',
  //       style: 'destructive',
  //       onPress: () => {
  //         void conversationAction.clearMessages(activeId)
  //       },
  //     },
  //   ])
  // }, [activeId])

  const openEditMessage = useCallback((item: LX.ChatMessage) => {
    if (item.role !== 'user' || streaming) return
    const idx = messages.findIndex((m) => m.id === item.id)
    const hasFollowUps = idx >= 0 && idx < messages.length - 1

    const startEdit = () => {
      setEditTarget({ id: item.id, content: item.content })
      setEditDraft(item.content)
    }

    if (hasFollowUps) {
      Alert.alert('编辑消息', '将删除此消息之后的所有回复，并以新内容重新发送。', [
        { text: '取消', style: 'cancel' },
        { text: '继续编辑', onPress: startEdit },
      ])
    } else {
      startEdit()
    }
  }, [messages, streaming])

  const confirmEditResend = useCallback(async () => {
    if (!editTarget) return
    const text = editDraft.trim()
    if (!text) {
      toast('消息不能为空')
      return
    }
    if (!ensureReady()) return
    setEditTarget(null)
    try {
      await chatAction.resendFrom(editTarget.id, text)
      scrollToEnd()
    } catch (err: any) {
      toast(err?.message || '重新发送失败')
    }
  }, [editTarget, editDraft, ensureReady, scrollToEnd])

  const openPromptModal = useCallback(async () => {
    let conv = active
    if (!conv) {
      conv = await conversationAction.createConversation()
    }
    setPromptDraft(conv.systemPrompt ?? globalSystemPrompt ?? '')
    setPromptModalOpen(true)
  }, [active, globalSystemPrompt])

  const savePrompt = useCallback(async () => {
    if (!activeId) {
      setPromptModalOpen(false)
      return
    }
    const trimmed = promptDraft.trim()
    await conversationAction.updateConversation(activeId, {
      systemPrompt: trimmed || undefined,
    })
    setPromptModalOpen(false)
    toast(trimmed ? '已保存本会话提示词' : '已恢复为全局默认提示词')
  }, [activeId, promptDraft])

  const clearPromptOverride = useCallback(async () => {
    if (!activeId) return
    await conversationAction.updateConversation(activeId, { systemPrompt: undefined })
    setPromptDraft(globalSystemPrompt ?? '')
    toast('已清除会话提示词，使用全局默认')
  }, [activeId, globalSystemPrompt])

  const handleExport = useCallback(async () => {
    if (!messages.length) {
      toast('当前会话没有消息可导出')
      return
    }
    const text = formatConversationText(
      active?.title || '会话',
      active?.model || defaultModel || undefined,
      messages
    )
    Alert.alert('导出会话', '选择导出方式', [
      { text: '取消', style: 'cancel' },
      {
        text: '复制全文',
        onPress: () => {
          Clipboard.setString(text)
          toast('已复制到剪贴板')
        },
      },
      {
        text: '系统分享',
        onPress: () => {
          void Share.share({
            message: text,
            title: active?.title || 'IKUN Chat 会话',
          }).catch(() => {
            toast('分享取消或失败')
          })
        },
      },
    ])
  }, [messages, active, defaultModel])

  const handleMessageLongPress = useCallback(
    (item: LX.ChatMessage) => {
      if (streaming) return
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
      if (item.role === 'user') {
        buttons.push({
          text: '编辑并重发',
          onPress: () => openEditMessage(item),
        })
      }
      if (canRegenerate && isLast && item.role === 'assistant') {
        buttons.push({
          text: '重新生成',
          onPress: () => {
            void handleRegenerate()
          },
        })
      }
      if (canRegenerate && isLast && item.role === 'error') {
        buttons.push({
          text: '重试',
          onPress: () => {
            void handleRetry()
          },
        })
      }
      if (buttons.length <= 1) return
      Alert.alert('消息', undefined, buttons)
    },
    [
      streaming,
      lastMessageId,
      canRegenerate,
      handleCopy,
      openEditMessage,
      handleRegenerate,
      handleRetry,
    ]
  )

  const renderMessage = useCallback(
    ({ item }: { item: LX.ChatMessage }) => {
      const isUser = item.role === 'user'
      const isError = item.role === 'error'
      const isLast = item.id === lastMessageId
      const isStreamingThis = streaming && item.id === streamingMessageId
      // 导出会话：挂在最后一条消息下方，不与输入区提示词挤在一起
      const showExport = isLast && !streaming && messages.length > 0
      const showActions =
        !streaming &&
        (isUser ||
          (isLast && isError && canRegenerate) ||
          (isLast && item.role === 'assistant' && canRegenerate) ||
          showExport)

      const bubbleBg = isError
        ? colors.error
        : isUser
          ? colors.userBubble
          : colors.assistantBubble
      const textColor = isUser || isError ? colors.textInverse : colors.text

      return (
        <View
          style={[styles.bubbleWrap, isUser ? styles.bubbleRight : styles.bubbleLeft]}
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
              {!item.content ? (
                <Text
                  style={{ color: textColor, fontSize: fontSize, lineHeight: fontSize * 1.5 }}
                >
                  {isStreamingThis ? '正在思考…' : ''}
                </Text>
              ) : isUser || isError ? (
                <Text
                  style={{ color: textColor, fontSize: fontSize, lineHeight: fontSize * 1.5 }}
                  selectable
                >
                  {item.content}
                </Text>
              ) : isStreamingThis ? (
                // 仅流式中的助手气泡用纯文本，避免半截 Markdown
                <Text
                  style={{ color: textColor, fontSize: fontSize, lineHeight: fontSize * 1.5 }}
                  selectable
                >
                  {item.content}
                </Text>
              ) : (
                <MarkdownContent
                  key={`md-${item.id}`}
                  content={item.content}
                  fontSize={fontSize}
                  textColor={textColor}
                />
              )}
            </View>
          </Pressable>

          {showActions ? (
            <View style={[styles.msgActions, isUser && styles.msgActionsRight]}>
              {item.content ? (
                <TouchableOpacity
                  onPress={() => handleCopy(item.content)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.msgActionText, { color: colors.textSecondary }]}>
                    复制
                  </Text>
                </TouchableOpacity>
              ) : null}
              {isUser ? (
                <TouchableOpacity
                  onPress={() => openEditMessage(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.msgActionText, { color: colors.primary }]}>编辑</Text>
                </TouchableOpacity>
              ) : null}
              {isLast && item.role === 'assistant' && canRegenerate ? (
                <TouchableOpacity
                  onPress={() => void handleRegenerate()}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.msgActionText, { color: colors.primary }]}>重新生成</Text>
                </TouchableOpacity>
              ) : null}
              {isLast && isError && canRegenerate ? (
                <TouchableOpacity
                  onPress={() => void handleRetry()}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.msgActionText, { color: colors.primary }]}>重试</Text>
                </TouchableOpacity>
              ) : null}
              {showExport ? (
                <TouchableOpacity
                  onPress={() => void handleExport()}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="导出/分享会话"
                >
                  <Text style={[styles.msgActionText, { color: colors.textSecondary }]}>
                    导出
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      )
    },
    [
      colors,
      fontSize,
      handleCopy,
      handleExport,
      handleMessageLongPress,
      handleRegenerate,
      handleRetry,
      openEditMessage,
      streaming,
      streamingMessageId,
      lastMessageId,
      canRegenerate,
      messages.length,
    ]
  )

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity style={styles.headerBtn} onPress={() => setDrawerOpen(true)}>
          <Text style={[styles.headerBtnText, { color: colors.primary }]}>菜单</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} onPress={() => setModelPickerOpen(true)}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {active?.title || 'IKUN Chat'}
          </Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {currentModel}
            {hasConvPrompt ? ' · 自定义提示词' : ''}
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

      <FlatList
        ref={listRef}
        data={Array.isArray(messages) ? messages : []}
        keyExtractor={(item, index) => item?.id || `msg_${index}`}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => {
          // 流式中减少滚动动画，降低卡顿/闪退风险
          listRef.current?.scrollToEnd({ animated: !streaming })
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>开始对话</Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
              配置中转站后即可聊天。支持 Markdown、编辑重发、重新生成与错误重试。
            </Text>
          </View>
        }
      />

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
          <View style={styles.sideBtns}>
            {/* 清空暂隐藏；导出/分享在最后一条消息下方 */}
            {/*
            <TouchableOpacity onPress={handleClear} style={styles.sideBtn}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>清空</Text>
            </TouchableOpacity>
            */}
            <TouchableOpacity onPress={() => void openPromptModal()} style={styles.sideBtn}>
              <Text
                style={{
                  color: hasConvPrompt ? colors.primary : colors.textSecondary,
                  fontSize: 12,
                }}
              >
                提示词
              </Text>
            </TouchableOpacity>
          </View>
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

      <Modal
        visible={drawerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setDrawerOpen(false)}
      >
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
                    {item.systemPrompt?.trim() ? ' · 自定义提示词' : ''}
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

      {/* 本会话系统提示词 */}
      <Modal
        visible={promptModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPromptModalOpen(false)}
      >
        <Pressable style={styles.renameMask} onPress={() => setPromptModalOpen(false)}>
          <Pressable
            style={[styles.promptBox, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.drawerTitle, { color: colors.text }]}>本会话系统提示词</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
              仅作用于当前会话；留空保存则使用设置里的全局默认。
            </Text>
            <TextInput
              style={[
                styles.promptInput,
                {
                  backgroundColor: colors.inputBg,
                  color: colors.text,
                  borderColor: colors.border,
                  fontSize,
                },
              ]}
              value={promptDraft}
              onChangeText={setPromptDraft}
              multiline
              textAlignVertical="top"
              placeholder="输入 system prompt…"
              placeholderTextColor={colors.textSecondary}
            />
            <View style={styles.promptActions}>
              <TouchableOpacity onPress={() => void clearPromptOverride()}>
                <Text style={{ color: colors.textSecondary }}>用全局默认</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <TouchableOpacity onPress={() => setPromptModalOpen(false)}>
                  <Text style={{ color: colors.textSecondary }}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void savePrompt()}>
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!editTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setEditTarget(null)}
      >
        <Pressable style={styles.renameMask} onPress={() => setEditTarget(null)}>
          <Pressable
            style={[styles.promptBox, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.drawerTitle, { color: colors.text }]}>编辑并重发</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
              保存后将删除该消息之后的回复，并以新内容重新请求。
            </Text>
            <TextInput
              style={[
                styles.promptInput,
                {
                  backgroundColor: colors.inputBg,
                  color: colors.text,
                  borderColor: colors.border,
                  fontSize,
                },
              ]}
              value={editDraft}
              onChangeText={setEditDraft}
              multiline
              textAlignVertical="top"
              autoFocus
              placeholder="输入消息…"
              placeholderTextColor={colors.textSecondary}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
              <TouchableOpacity onPress={() => setEditTarget(null)}>
                <Text style={{ color: colors.textSecondary }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void confirmEditResend()}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>发送</Text>
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
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  msgActionsRight: { justifyContent: 'flex-end' },
  msgActionText: { fontSize: 13, fontWeight: '600' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  sideBtns: {
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    paddingBottom: 0,
    gap: 8,
  },
  sideBtn: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
    alignSelf: 'center',
    marginBottom: 0,
  },
  sendText: { color: '#fff', fontWeight: '700' },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', flexDirection: 'row' },
  drawer: {
    width: '78%',
    maxWidth: 320,
    height: '100%',
    paddingTop: 48,
    paddingHorizontal: 12,
  },
  drawerTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  newChatBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  newChatText: { color: '#fff', fontWeight: '700' },
  convItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
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
  promptBox: {
    borderRadius: 14,
    padding: 16,
    maxHeight: '80%',
  },
  promptInput: {
    minHeight: 140,
    maxHeight: 280,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  promptActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})

export default Home
