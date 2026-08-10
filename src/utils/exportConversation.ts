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
    const attachments = m.attachments || []
    if (!body && !attachments.length && m.role !== 'error') continue
    lines.push(`## ${roleLabel}`)
    if (body) lines.push(body)
    for (const [index, attachment] of attachments.entries()) {
      const kind = attachment.type === 'file' ? '文件' : '图片'
      const label = attachment.name || `${kind} ${index + 1}`
      const size = attachment.size ? `，${Math.round(attachment.size / 1024)}KB` : ''
      lines.push(`[${kind}: ${label}${size}]`)
    }
    if (!body && !attachments.length) lines.push('（空）')
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}
