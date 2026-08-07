/** 将会话消息格式化为可复制 / 分享的纯文本 */
export const formatConversationText = (
  title: string,
  model: string | undefined,
  messages: LX.ChatMessage[]
): string => {
  const lines: string[] = []
  lines.push(`# ${title || '会话'}`)
  if (model) lines.push(`模型: ${model}`)
  lines.push('')

  for (const m of messages) {
    if (m.role === 'system') continue
    const roleLabel =
      m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role === 'error' ? '错误' : m.role
    const body = (m.content || '').trim()
    if (!body && m.role !== 'error') continue
    lines.push(`## ${roleLabel}`)
    lines.push(body || '（空）')
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}
