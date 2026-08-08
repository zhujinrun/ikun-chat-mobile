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
import Icon from '@/components/common/Icon'
import IconButton from '@/components/common/IconButton'
import ThinkingIndicator from '@/components/common/ThinkingIndicator'

type Props = {
  componentId: string
}

type EditTarget = {
  id: string
  content: string
}

const formatConversationTime = (ts?: number) => {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
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
  const [conversationQuery, setConversationQuery] = useState('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [input, setInput] = useState('')
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
  const [renameText, setRenameText] = useState('')
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [editDraft, setEditDraft] = useState('')
  /** 输入区「+」附件菜单：提示词等次要能力 */
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const listRef = useRef<FlatList>(null)

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  )

  const filteredConversations = useMemo(() => {
    const query = conversationQuery.trim().toLowerCase()
    if (!query) return conversations
    return conversations.filter((item) =>
      [item.title, item.model, item.systemPrompt]
        .filter(Boolean)
        .some((text) => String(text).toLowerCase().includes(query))
      )
  }, [conversationQuery, conversations])

  const filteredModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase()
    if (!query) return models
    return models.filter((item) => item.id.toLowerCase().includes(query))
  }, [modelQuery, models])

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
    setConversationQuery('')
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

  const handleTogglePinChat = useCallback(async (id: string, pinned?: boolean) => {
    await conversationAction.updateConversation(id, { pinned: !pinned })
    toast(pinned ? '已取消置顶' : '已置顶')
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
      setModelQuery('')
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
                isStreamingThis ? (
                  <ThinkingIndicator color={textColor} size={Math.max(16, fontSize)} />
                ) : null
              ) : isUser ? (
                <Text
                  style={{ color: textColor, fontSize: fontSize, lineHeight: fontSize * 1.5 }}
                  selectable
                >
                  {item.content}
                </Text>
              ) : isError ? (
                <View>
                  <View style={styles.errorTitleRow}>
                    <Icon name="warning" size={16} color={textColor} />
                    <Text
                      style={{
                        color: textColor,
                        fontSize: Math.max(13, fontSize - 1),
                        fontWeight: '700',
                        marginLeft: 6,
                      }}
                    >
                      生成失败
                    </Text>
                  </View>
                  {item.content ? (
                    <Text
                      style={{
                        color: textColor,
                        fontSize: fontSize,
                        lineHeight: fontSize * 1.5,
                        marginTop: 6,
                        opacity: 0.95,
                      }}
                      selectable
                    >
                      {item.content}
                    </Text>
                  ) : null}
                  {isLast && canRegenerate ? (
                    <TouchableOpacity
                      style={styles.errorRetryBtn}
                      onPress={() => void handleRetry()}
                      accessibilityLabel="重试"
                      accessibilityRole="button"
                    >
                      <Icon name="retry" size={16} color={textColor} />
                      <Text style={[styles.errorRetryText, { color: textColor }]}>重试</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
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
                <IconButton
                  name="copy"
                  accessibilityLabel="复制"
                  color={colors.textSecondary}
                  size={18}
                  onPress={() => handleCopy(item.content)}
                />
              ) : null}
              {isUser ? (
                <IconButton
                  name="edit"
                  accessibilityLabel="编辑并重发"
                  color={colors.primary}
                  size={18}
                  onPress={() => openEditMessage(item)}
                />
              ) : null}
              {isLast && item.role === 'assistant' && canRegenerate ? (
                <IconButton
                  name="refresh"
                  accessibilityLabel="重新生成"
                  color={colors.primary}
                  size={18}
                  onPress={() => void handleRegenerate()}
                />
              ) : null}
              {/* 错误重试已在气泡内「图标+文字」展示，操作条不再重复 */}
              {showExport ? (
                <IconButton
                  name="export"
                  accessibilityLabel="导出/分享会话"
                  color={colors.textSecondary}
                  size={18}
                  onPress={() => void handleExport()}
                />
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
        <IconButton
          name="menu"
          accessibilityLabel="菜单"
          color={colors.primary}
          size={24}
          style={styles.headerBtn}
          onPress={() => setDrawerOpen(true)}
        />
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => setModelPickerOpen(true)}
          accessibilityLabel="选择模型"
          accessibilityRole="button"
        >
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {active?.title || 'IKUN Chat'}
          </Text>
          <View style={styles.headerSubRow}>
            <Icon name="model" size={12} color={colors.textSecondary} />
            <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {currentModel}
              {hasConvPrompt ? ' · 提示词' : ''}
            </Text>
            <Icon name="chevron-down" size={12} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
        <IconButton
          name="settings"
          accessibilityLabel="设置"
          color={colors.primary}
          size={24}
          style={styles.headerBtn}
          onPress={() => void navigations.pushSettingScreen(componentId)}
        />
      </View>

      {needSetup ? (
        <View style={styles.banner}>
          <Icon name="warning" size={16} color="#92400E" />
          <Text style={[styles.bannerText, { marginLeft: 8 }]}>
            尚未配置中转站，请先填写 API URL 与 API Key
          </Text>
          <TouchableOpacity
            style={styles.bannerActionRow}
            onPress={() => void navigations.pushSettingScreen(componentId)}
            accessibilityLabel="去设置"
            accessibilityRole="button"
          >
            <Icon name="settings" size={14} color="#B45309" />
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
          <IconButton
            name="add"
            accessibilityLabel="更多"
            color={hasConvPrompt ? colors.primary : colors.textSecondary}
            size={22}
            disabled={streaming}
            onPress={() => setAttachMenuOpen(true)}
          />
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
            accessibilityLabel="消息输入框"
          />
          {streaming ? (
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.error }]}
              onPress={handleStop}
              accessibilityLabel="停止生成"
              accessibilityRole="button"
            >
              <Icon name="stop" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: input.trim() ? colors.primary : colors.surfaceSecondary },
              ]}
              onPress={() => void handleSend()}
              disabled={!input.trim()}
              accessibilityLabel="发送"
              accessibilityRole="button"
            >
              <Icon name="send" size={18} color="#fff" />
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
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>会话</Text>
              <IconButton
                name="close"
                accessibilityLabel="关闭"
                color={colors.textSecondary}
                size={22}
                onPress={() => setDrawerOpen(false)}
              />
            </View>
            <TouchableOpacity
              style={[styles.newChatBtn, { backgroundColor: colors.primary }]}
              onPress={() => void handleNewChat()}
              accessibilityLabel="新对话"
              accessibilityRole="button"
            >
              <Icon name="add" size={20} color="#fff" />
              <Text style={styles.newChatText}>新对话</Text>
            </TouchableOpacity>
            <View
              style={[
                styles.drawerSearch,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
              ]}
            >
              <Icon name="search" size={16} color={colors.textSecondary} />
              <TextInput
                style={[styles.drawerSearchInput, { color: colors.text }]}
                value={conversationQuery}
                onChangeText={setConversationQuery}
                placeholder="搜索会话、模型或提示词…"
                placeholderTextColor={colors.textSecondary}
                autoCorrect={false}
                accessibilityLabel="搜索会话"
              />
              {conversationQuery ? (
                <IconButton
                  name="close"
                  accessibilityLabel="清空搜索"
                  color={colors.textSecondary}
                  size={16}
                  hitSlop={8}
                  onPress={() => setConversationQuery('')}
                />
              ) : null}
            </View>
            <FlatList
              data={filteredConversations}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.convItem,
                    item.id === activeId && { backgroundColor: colors.surfaceSecondary },
                  ]}
                  onPress={() => void handleSelectChat(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`切换到会话 ${item.title}`}
                  onLongPress={() => {
                    Alert.alert(item.title, undefined, [
                      { text: '取消', style: 'cancel' },
                      {
                        text: item.pinned ? '取消置顶' : '置顶',
                        onPress: () => void handleTogglePinChat(item.id, item.pinned),
                      },
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
                  <View style={styles.convTitleRow}>
                    <Text style={[styles.convTitle, { color: colors.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.pinned ? <Icon name="pin" size={13} color={colors.primary} /> : null}
                    <Text style={[styles.convTime, { color: colors.textSecondary }]}>
                      {formatConversationTime(item.updatedAt)}
                    </Text>
                  </View>
                  <View style={styles.convMetaRow}>
                    <Icon name="model" size={12} color={colors.textSecondary} />
                    <Text
                      style={[styles.convMetaText, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {item.model || '默认模型'}
                      {item.systemPrompt?.trim() ? ' · 自定义提示词' : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.textSecondary, padding: 12 }}>
                  {conversationQuery ? '未找到匹配会话' : '暂无会话'}
                </Text>
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
        <Pressable style={styles.modalMaskCol} onPress={() => setModelPickerOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>选择模型</Text>
              <IconButton
                name="close"
                accessibilityLabel="关闭"
                color={colors.textSecondary}
                size={22}
                onPress={() => setModelPickerOpen(false)}
              />
            </View>
            <View
              style={[
                styles.drawerSearch,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
              ]}
            >
              <Icon name="search" size={16} color={colors.textSecondary} />
              <TextInput
                style={[styles.drawerSearchInput, { color: colors.text }]}
                value={modelQuery}
                onChangeText={setModelQuery}
                placeholder="搜索模型…"
                placeholderTextColor={colors.textSecondary}
                autoCorrect={false}
                accessibilityLabel="搜索模型"
              />
              {modelQuery ? (
                <IconButton
                  name="close"
                  accessibilityLabel="清空模型搜索"
                  color={colors.textSecondary}
                  size={16}
                  hitSlop={8}
                  onPress={() => setModelQuery('')}
                />
              ) : null}
            </View>
            <FlatList
              data={filteredModels}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => {
                const selected = item.id === currentModel
                return (
                  <TouchableOpacity
                    style={[
                      styles.modelItem,
                      selected && { backgroundColor: colors.surfaceSecondary },
                    ]}
                    onPress={() => void handleSelectModel(item.id)}
                    accessibilityLabel={selected ? `已选 ${item.id}` : item.id}
                    accessibilityRole="button"
                  >
                    <Icon
                      name="model"
                      size={18}
                      color={selected ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={{
                        color: colors.text,
                        flex: 1,
                        marginLeft: 10,
                        fontWeight: selected ? '700' : '400',
                      }}
                      numberOfLines={1}
                    >
                      {item.id}
                    </Text>
                    {selected ? <Icon name="check" size={18} color={colors.primary} /> : null}
                  </TouchableOpacity>
                )
              }}
              ListEmptyComponent={
                <Text style={{ color: colors.textSecondary, padding: 12 }}>
                  {modelQuery ? '未找到匹配模型' : '暂无模型，请先在设置中测试连接并刷新模型'}
                </Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* 输入区「+」菜单：次要能力（图标+文字） */}
      <Modal
        visible={attachMenuOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setAttachMenuOpen(false)}
      >
        <Pressable style={styles.modalMaskCol} onPress={() => setAttachMenuOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>更多</Text>
              <IconButton
                name="close"
                accessibilityLabel="关闭"
                color={colors.textSecondary}
                size={22}
                onPress={() => setAttachMenuOpen(false)}
              />
            </View>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setAttachMenuOpen(false)
                void openPromptModal()
              }}
              accessibilityLabel="会话提示词"
              accessibilityRole="button"
            >
              <Icon
                name="prompt"
                size={20}
                color={hasConvPrompt ? colors.primary : colors.textSecondary}
              />
              <View style={styles.menuRowText}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                  会话提示词
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {hasConvPrompt ? '已设置本会话覆盖' : '使用全局默认，可在此覆盖'}
                </Text>
              </View>
            </TouchableOpacity>
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
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>重命名会话</Text>
              <IconButton
                name="close"
                accessibilityLabel="关闭"
                color={colors.textSecondary}
                size={22}
                onPress={() => setRenameTarget(null)}
              />
            </View>
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
              accessibilityLabel="会话名称"
            />
            <View style={styles.renameActions}>
              <TouchableOpacity
                style={styles.renameActionBtn}
                onPress={() => setRenameTarget(null)}
                accessibilityRole="button"
                accessibilityLabel="取消重命名"
              >
                <Text style={[styles.renameActionText, { color: colors.textSecondary }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.renameActionBtn}
                onPress={confirmRename}
                accessibilityRole="button"
                accessibilityLabel="保存会话名称"
              >
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
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>本会话系统提示词</Text>
              <IconButton
                name="close"
                accessibilityLabel="关闭"
                color={colors.textSecondary}
                size={22}
                onPress={() => setPromptModalOpen(false)}
              />
            </View>
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
              accessibilityLabel="本会话系统提示词"
            />
            <View style={styles.promptActions}>
              <TouchableOpacity
                onPress={() => void clearPromptOverride()}
                accessibilityRole="button"
                accessibilityLabel="使用全局默认提示词"
              >
                <Text style={{ color: colors.textSecondary }}>用全局默认</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <TouchableOpacity
                  onPress={() => setPromptModalOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="取消编辑提示词"
                >
                  <Text style={{ color: colors.textSecondary }}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void savePrompt()}
                  accessibilityRole="button"
                  accessibilityLabel="保存提示词"
                >
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
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>编辑并重发</Text>
              <IconButton
                name="close"
                accessibilityLabel="关闭"
                color={colors.textSecondary}
                size={22}
                onPress={() => setEditTarget(null)}
              />
            </View>
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
              accessibilityLabel="编辑消息内容"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
              <TouchableOpacity
                onPress={() => setEditTarget(null)}
                accessibilityRole="button"
                accessibilityLabel="取消编辑消息"
              >
                <Text style={{ color: colors.textSecondary }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void confirmEditResend()}
                accessibilityRole="button"
                accessibilityLabel="发送编辑后的消息"
              >
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
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    maxWidth: '100%',
  },
  headerSub: { fontSize: 12, flexShrink: 1 },
  banner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerText: { color: '#92400E', flex: 1, fontSize: 13 },
  bannerActionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 },
  bannerAction: { color: '#B45309', fontWeight: '700' },
  listContent: { padding: 12, paddingBottom: 24, flexGrow: 1 },
  bubbleWrap: { marginVertical: 4, maxWidth: '88%' },
  bubbleLeft: { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  errorTitleRow: { flexDirection: 'row', alignItems: 'center' },
  errorRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.45)',
    gap: 6,
  },
  errorRetryText: { fontSize: 14, fontWeight: '700' },
  msgActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  msgActionsRight: { justifyContent: 'flex-end' },
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
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', flexDirection: 'row' },
  modalMaskCol: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  drawer: {
    width: '78%',
    maxWidth: 320,
    height: '100%',
    paddingTop: 48,
    paddingHorizontal: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalHeaderTitle: { fontSize: 18, fontWeight: '700', flex: 1, paddingRight: 8 },
  newChatBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  newChatText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  drawerSearch: {
    minHeight: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drawerSearchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 14,
  },
  convItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  convTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  convTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  convTime: { fontSize: 11 },
  convMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  convMetaText: { flex: 1, fontSize: 12 },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    gap: 12,
  },
  menuRowDisabled: { opacity: 0.55 },
  menuRowText: { flex: 1 },
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
