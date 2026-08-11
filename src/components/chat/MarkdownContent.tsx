import { useMemo, useState, useCallback, Fragment, type ReactNode } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Linking,
  ScrollView,
  Image,
  Pressable,
  TouchableOpacity,
  type LayoutChangeEvent,
} from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTheme } from '@/store/theme/hook'
import { toast } from '@/utils/toast'
import Icon from '@/components/common/Icon'
import MarkdownErrorBoundary from './MarkdownErrorBoundary'

type Props = {
  content: string
  fontSize?: number
  textColor?: string
}

type InlineSeg =
  | { t: 'text'; v: string }
  | { t: 'strong'; v: string }
  | { t: 'em'; v: string }
  | { t: 'del'; v: string }
  | { t: 'code'; v: string }
  | { t: 'link'; v: string; href: string }
  | { t: 'image'; alt: string; src: string }

type ListKind = 'ul' | 'ol' | 'task'

type ListNode = {
  kind: ListKind
  text: string
  checked?: boolean
  children: ListNode[]
}

type Align = 'left' | 'center' | 'right'

/** 段落内混合文本 / 独立图片行 */
type ParaPart =
  | { kind: 'text'; text: string }
  | { kind: 'image'; alt: string; src: string }

type Block =
  | { type: 'p'; parts: ParaPart[] }
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string; lang?: string }
  | { type: 'list'; items: ListNode[] }
  | { type: 'image'; alt: string; src: string }
  | { type: 'table'; headers: string[]; rows: string[][]; aligns: Align[] }
  | { type: 'hr' }

const UL_BULLETS = ['•', '◦', '▪', '▫'] as const
const INDENT_UNIT = 16
const MAX_LIST_DEPTH = 6
const MIN_TABLE_COL_WIDTH = 112
const MAX_TABLE_COL_WIDTH = 220
const MIN_TABLE_WIDTH = 420

/**
 * 轻量 Markdown 渲染（不依赖第三方库）。
 * 覆盖聊天常用语法，避免 Hermes 下第三方 rules 崩溃。
 *
 * 支持：标题 / 段落 / 引用 / 代码块 / 行内代码 /
 * 粗体斜体删线 / 链接 / 嵌套列表 / 任务列表 /
 * GFM 表格 / 图片 ![alt](url) / 分隔线
 */
const MarkdownContent = ({ content, fontSize = 16, textColor }: Props) => {
  const theme = useTheme()
  const colors = theme.colors
  const color = textColor || colors.text
  const codeBg = theme.isDark ? '#0B1220' : '#F1F5F9'
  const tableBorder = theme.isDark ? '#334155' : '#E2E8F0'
  const tableHeaderBg = theme.isDark ? '#1E293B' : '#F8FAFC'
  const muted = colors.textSecondary || (theme.isDark ? '#94A3B8' : '#64748B')
  const lineHeight = Math.round(fontSize * 1.55)
  const cellFont = Math.max(12, fontSize - 1)

  const blocks = useMemo(() => parseBlocks(content || ''), [content])

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flexShrink: 1 },
        p: { color, fontSize, lineHeight, marginBottom: 6 },
        h1: {
          color,
          fontSize: fontSize + 6,
          fontWeight: '700',
          marginTop: 8,
          marginBottom: 4,
          lineHeight: fontSize + 10,
        },
        h2: {
          color,
          fontSize: fontSize + 4,
          fontWeight: '700',
          marginTop: 8,
          marginBottom: 4,
          lineHeight: fontSize + 8,
        },
        h3: {
          color,
          fontSize: fontSize + 2,
          fontWeight: '700',
          marginTop: 6,
          marginBottom: 4,
          lineHeight: fontSize + 6,
        },
        strong: { color, fontWeight: '700' },
        em: { color, fontStyle: 'italic' },
        del: { color: muted, textDecorationLine: 'line-through' },
        codeInline: {
          color,
          backgroundColor: codeBg,
          fontFamily: 'monospace',
          fontSize: Math.max(12, fontSize - 1),
        },
        link: { color: colors.primary, textDecorationLine: 'underline' },
        codeBlock: {
          backgroundColor: codeBg,
          borderRadius: 8,
          marginVertical: 6,
          overflow: 'hidden',
        },
        codeHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        codeLang: {
          color: muted,
          fontSize: 11,
          fontWeight: '600',
          flex: 1,
        },
        codeCopyBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 8,
          backgroundColor: theme.isDark ? 'rgba(59,130,246,0.14)' : 'rgba(37,99,235,0.08)',
        },
        codeCopyText: {
          color: colors.primary,
          fontSize: 11,
          fontWeight: '700',
        },
        codeBody: {
          paddingVertical: 10,
        },
        codeText: {
          color,
          fontFamily: 'monospace',
          fontSize: Math.max(12, fontSize - 1),
          lineHeight: Math.max(12, fontSize - 1) * 1.45,
          paddingHorizontal: 10,
        },
        quote: {
          borderLeftWidth: 3,
          borderLeftColor: colors.primary,
          backgroundColor: codeBg,
          paddingHorizontal: 10,
          paddingVertical: 6,
          marginVertical: 6,
        },
        list: { marginBottom: 6 },
        liRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          marginBottom: 2,
        },
        liBullet: {
          color,
          fontSize,
          lineHeight,
          width: 22,
          textAlign: 'center',
        },
        liCheck: {
          color: colors.primary,
          fontSize,
          lineHeight,
          width: 22,
          textAlign: 'center',
          fontWeight: '700',
        },
        liCheckEmpty: {
          color: muted,
          fontSize,
          lineHeight,
          width: 22,
          textAlign: 'center',
        },
        liBody: {
          color,
          fontSize,
          lineHeight,
          flex: 1,
          flexShrink: 1,
        },
        liDone: {
          color: muted,
          textDecorationLine: 'line-through',
        },
        hr: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginVertical: 10,
        },
        tableViewport: {
          alignSelf: 'stretch',
          maxWidth: '100%',
          marginVertical: 8,
        },
        tableScroll: {
          width: '100%',
        },
        tableScrollContent: {
          paddingRight: 2,
        },
        tableWrap: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: tableBorder,
          borderRadius: 8,
          overflow: 'hidden',
        },
        tableRow: {
          flexDirection: 'row',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: tableBorder,
        },
        tableRowLast: {
          borderBottomWidth: 0,
        },
        tableHeaderRow: {
          backgroundColor: tableHeaderBg,
        },
        tableCell: {
          paddingVertical: 6,
          paddingHorizontal: 8,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderRightColor: tableBorder,
          justifyContent: 'center',
        },
        tableCellLast: {
          borderRightWidth: 0,
        },
        tableCellText: {
          color,
          fontSize: cellFont,
          lineHeight: Math.round(cellFont * 1.4),
        },
        tableHeaderText: {
          color,
          fontSize: cellFont,
          fontWeight: '700',
          lineHeight: Math.round(cellFont * 1.4),
        },
        imageWrap: {
          marginVertical: 6,
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: codeBg,
          alignSelf: 'stretch',
        },
        image: {
          width: '100%',
          minHeight: 80,
          backgroundColor: codeBg,
        },
        imageAlt: {
          color: muted,
          fontSize: Math.max(12, fontSize - 2),
          padding: 8,
          fontStyle: 'italic',
        },
        imageBroken: {
          color: muted,
          fontSize: Math.max(12, fontSize - 2),
          padding: 10,
        },
      }),
    [
      color,
      fontSize,
      lineHeight,
      codeBg,
      colors.primary,
      colors.border,
      muted,
      tableBorder,
      tableHeaderBg,
      cellFont,
    ]
  )

  if (!content) return null

  /**
   * 渲染行内节点。必须作为「单个父级 Text」的 children 使用，
   * 不要再外包一层 Text，否则 Android 上易出现文字重影/重复。
   * 普通文本用 string，样式片段才用嵌套 Text。
   */
  const renderInlines = (segs: InlineSeg[], keyPrefix: string, baseStyle?: object): ReactNode[] =>
    segs.map((s, i) => {
      const k = `${keyPrefix}-${i}`
      if (s.t === 'strong')
        return (
          <Text key={k} style={[baseStyle, styles.strong]}>
            {s.v}
          </Text>
        )
      if (s.t === 'em')
        return (
          <Text key={k} style={[baseStyle, styles.em]}>
            {s.v}
          </Text>
        )
      if (s.t === 'del')
        return (
          <Text key={k} style={[baseStyle, styles.del]}>
            {s.v}
          </Text>
        )
      if (s.t === 'code')
        return (
          <Text key={k} style={[baseStyle, styles.codeInline]}>
            {s.v}
          </Text>
        )
      if (s.t === 'link')
        return (
          <Text
            key={k}
            style={[baseStyle, styles.link]}
            onPress={() => {
              void Linking.openURL(s.href).catch(() => null)
            }}
          >
            {s.v}
          </Text>
        )
      if (s.t === 'image')
        return (
          <Text key={k} style={[baseStyle, styles.link]}>
            {s.alt || '[图片]'}
          </Text>
        )
      // 纯文本用 Fragment 包一层拿 key，避免再套 Text 造成 Android 重影
      return <Fragment key={k}>{s.v}</Fragment>
    })

  /** 纯文本块（标题等）：行内图片降级为可点链接文案 */
  const renderTextBlock = (text: string, style: object, key: string) => (
    <Text key={key} style={style} selectable>
      {renderInlines(parseInlines(text), key)}
    </Text>
  )

  const renderListNodes = (nodes: ListNode[], key: string, depth: number, olStart = 1): ReactNode => (
    <View key={key} style={depth === 0 ? styles.list : undefined}>
      {nodes.map((node, j) => {
        const itemKey = `${key}-${j}`
        const done = node.kind === 'task' && !!node.checked
        let marker: ReactNode
        if (node.kind === 'task') {
          marker = (
            <Text style={done ? styles.liCheck : styles.liCheckEmpty}>{done ? '☑' : '☐'}</Text>
          )
        } else if (node.kind === 'ol') {
          // 嵌套有序列表：顶层 1. 2.；一层 a. b.；更深退回数字
          const n = olStart + j
          const label =
            depth === 1
              ? `${String.fromCharCode(97 + ((n - 1) % 26))}.`
              : `${n}.`
          marker = <Text style={styles.liBullet}>{label}</Text>
        } else {
          marker = (
            <Text style={styles.liBullet}>{UL_BULLETS[Math.min(depth, UL_BULLETS.length - 1)]}</Text>
          )
        }
        const bodyStyle = done ? [styles.liBody, styles.liDone] : styles.liBody
        return (
          <View key={itemKey}>
            <View style={[styles.liRow, { paddingLeft: Math.min(depth, MAX_LIST_DEPTH) * INDENT_UNIT }]}>
              {marker}
              <Text style={bodyStyle} selectable>
                {renderInlines(parseInlines(node.text), itemKey, done ? styles.liDone : undefined)}
              </Text>
            </View>
            {node.children.length > 0
              ? renderListNodes(node.children, `${itemKey}-c`, depth + 1, 1)
              : null}
          </View>
        )
      })}
    </View>
  )

  const renderTable = (b: Extract<Block, { type: 'table' }>, key: string) => {
    const rowWidths = b.rows.map((r) => r.length)
    const colCount = Math.max(b.headers.length, 1, ...(rowWidths.length ? rowWidths : [0]))
    const pad = (cells: string[]) => {
      const out = cells.slice(0, colCount)
      while (out.length < colCount) out.push('')
      return out
    }
    const alignStyle = (idx: number) => {
      const a = b.aligns[idx] || 'left'
      return { textAlign: a as 'left' | 'center' | 'right' }
    }
    const allRows: { cells: string[]; header: boolean }[] = [
      { cells: pad(b.headers), header: true },
      ...b.rows.map((r) => ({ cells: pad(r), header: false })),
    ]
    const columnWidths = measureTableColumnWidths(allRows.map((row) => row.cells), cellFont)
    const minTableWidth =
      colCount >= 3 ? Math.max(MIN_TABLE_WIDTH, colCount * MIN_TABLE_COL_WIDTH) : 320
    const tableWidth = Math.max(
      minTableWidth,
      columnWidths.reduce((sum, width) => sum + width, 0)
    )
    return (
      <View key={key} style={styles.tableViewport}>
        <ScrollView
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator
          style={styles.tableScroll}
          contentContainerStyle={styles.tableScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.tableWrap, { width: tableWidth }]}>
            {allRows.map((row, ri) => (
              <View
                key={`${key}-r${ri}`}
                style={[
                  styles.tableRow,
                  row.header && styles.tableHeaderRow,
                  ri === allRows.length - 1 && styles.tableRowLast,
                ]}
              >
                {row.cells.map((cell, ci) => (
                  <View
                    key={`${key}-r${ri}-c${ci}`}
                    style={[
                      styles.tableCell,
                      { width: columnWidths[ci] },
                      ci === colCount - 1 && styles.tableCellLast,
                    ]}
                  >
                    <Text
                      style={[
                        row.header ? styles.tableHeaderText : styles.tableCellText,
                        alignStyle(ci),
                      ]}
                    >
                      {renderInlines(
                        parseInlines(cell),
                        `${key}-r${ri}-c${ci}`,
                        row.header ? styles.tableHeaderText : styles.tableCellText
                      )}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    )
  }

  const renderParagraph = (parts: ParaPart[], key: string) => {
    // 纯文本段落：单个 Text，便于选择复制
    if (parts.length === 1 && parts[0].kind === 'text') {
      return (
        <Text key={key} style={styles.p} selectable>
          {renderInlines(parseInlines(parts[0].text), key)}
        </Text>
      )
    }
    return (
      <View key={key} style={{ marginBottom: 6 }}>
        {parts.map((part, i) => {
          const pk = `${key}-p${i}`
          if (part.kind === 'image') {
            return (
              <MarkdownImage
                key={pk}
                src={part.src}
                alt={part.alt}
                styles={styles}
              />
            )
          }
          return (
            <Text key={pk} style={styles.p} selectable>
              {renderInlines(parseInlines(part.text), pk)}
            </Text>
          )
        })}
      </View>
    )
  }

  return (
    <MarkdownErrorBoundary fallbackText={content} textColor={color} fontSize={fontSize}>
      <View style={styles.root}>
        {blocks.map((b, idx) => {
          const key = `b-${idx}`
          switch (b.type) {
            case 'code':
              return (
                <View key={key} style={styles.codeBlock}>
                  <View style={styles.codeHeader}>
                    <Text style={styles.codeLang}>{b.lang || 'code'}</Text>
                    <TouchableOpacity
                      style={styles.codeCopyBtn}
                      onPress={() => {
                        Clipboard.setString(b.text)
                        toast('代码已复制')
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="复制代码"
                    >
                      <Icon name="copy" size={14} color={colors.primary} />
                      <Text style={styles.codeCopyText}>复制</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.codeBody}>
                    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
                      <Text style={styles.codeText} selectable>
                        {b.text}
                      </Text>
                    </ScrollView>
                  </View>
                </View>
              )
            case 'hr':
              return <View key={key} style={styles.hr} />
            case 'quote':
              return (
                <View key={key} style={styles.quote}>
                  <Text style={styles.p} selectable>
                    {renderInlines(parseInlines(b.text), key)}
                  </Text>
                </View>
              )
            case 'list':
              return renderListNodes(b.items, key, 0)
            case 'table':
              return renderTable(b, key)
            case 'image':
              return <MarkdownImage key={key} src={b.src} alt={b.alt} styles={styles} />
            case 'h1':
              return renderTextBlock(b.text, styles.h1, key)
            case 'h2':
              return renderTextBlock(b.text, styles.h2, key)
            case 'h3':
              return renderTextBlock(b.text, styles.h3, key)
            case 'p':
              return renderParagraph(b.parts, key)
            default:
              return null
          }
        })}
      </View>
    </MarkdownErrorBoundary>
  )
}

// ─── image component ────────────────────────────────────────────

type ImgStyles = {
  imageWrap: object
  image: object
  imageAlt: object
  imageBroken: object
}

function isSafeImageUrl(src: string): boolean {
  const s = (src || '').trim()
  if (!s) return false
  if (/^https?:\/\//i.test(s)) return true
  if (/^data:image\//i.test(s)) return true
  return false
}

function MarkdownImage({
  src,
  alt,
  styles,
}: {
  src: string
  alt: string
  styles: ImgStyles
}) {
  const [ratio, setRatio] = useState(16 / 9)
  const [failed, setFailed] = useState(false)
  const [maxW, setMaxW] = useState(0)

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (w > 0) setMaxW(w)
  }, [])

  if (!isSafeImageUrl(src)) {
    return (
      <Pressable
        onPress={() => {
          if (/^https?:\/\//i.test(src)) void Linking.openURL(src).catch(() => null)
        }}
        style={styles.imageWrap}
      >
        <Text style={styles.imageBroken}>{alt ? `🖼 ${alt}` : `🖼 ${src || '图片'}`}</Text>
      </Pressable>
    )
  }

  if (failed) {
    return (
      <Pressable
        onPress={() => {
          void Linking.openURL(src).catch(() => null)
        }}
        style={styles.imageWrap}
      >
        <Text style={styles.imageBroken}>{alt || '图片加载失败（点此打开）'}</Text>
      </Pressable>
    )
  }

  const height = maxW > 0 ? Math.min(Math.max(maxW / ratio, 60), 420) : 160

  return (
    <View style={styles.imageWrap} onLayout={onLayout}>
      {!!alt && <Text style={styles.imageAlt}>{alt}</Text>}
      <Image
        source={{ uri: src }}
        style={[styles.image, { height }]}
        resizeMode="contain"
        onLoad={(e) => {
          const { width, height: h } = e.nativeEvent.source
          if (width > 0 && h > 0) setRatio(width / h)
        }}
        onError={() => setFailed(true)}
        accessibilityLabel={alt || '图片'}
      />
    </View>
  )
}

function measureTableColumnWidths(rows: string[][], cellFont: number): number[] {
  const colCount = Math.max(1, ...rows.map((row) => row.length))
  const widths = Array.from({ length: colCount }, (_, colIndex) => {
    const maxUnits = Math.max(
      4,
      ...rows.map((row) => measureTextUnits(row[colIndex] || ''))
    )
    const width = Math.ceil(maxUnits * cellFont * 0.58 + 28)
    return Math.min(MAX_TABLE_COL_WIDTH, Math.max(MIN_TABLE_COL_WIDTH, width))
  })
  const total = widths.reduce((sum, width) => sum + width, 0)
  if (total >= MIN_TABLE_WIDTH) return widths

  const extra = (MIN_TABLE_WIDTH - total) / colCount
  return widths.map((width) => Math.ceil(width + extra))
}

function measureTextUnits(raw: string): number {
  const text = getPlainTableText(raw)
  if (!text) return 4
  return Array.from(text).reduce((sum, ch) => {
    if (/\s/.test(ch)) return sum + 0.35
    if (/[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/.test(ch)) return sum + 1.8
    if (/[A-Z0-9]/.test(ch)) return sum + 1.05
    return sum + 0.9
  }, 0)
}

function getPlainTableText(raw: string): string {
  return (raw || '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]+/g, '')
    .trim()
}

// ─── block parser ───────────────────────────────────────────────

const TASK_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/
const UL_RE = /^(\s*)[-*+]\s+(.*)$/
const OL_RE = /^(\s*)\d+\.\s+(.*)$/
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/
const TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/
/** 整行仅为图片：![alt](url) 可选 title */
const IMAGE_LINE_RE = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // fenced code
    const fence = line.match(/^```(\S*)\s*$/)
    if (fence) {
      const lang = fence[1] || ''
      const body: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i])
        i++
      }
      if (i < lines.length) i++
      blocks.push({ type: 'code', text: body.join('\n'), lang })
      continue
    }

    if (isTableStart(lines, i)) {
      const table = parseTable(lines, i)
      blocks.push(table.block)
      i = table.next
      continue
    }

    if (/^\s*([-*_]){3,}\s*$/.test(line)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = Math.min(heading[1].length, 3)
      const text = heading[2]
      if (level === 1) blocks.push({ type: 'h1', text })
      else if (level === 2) blocks.push({ type: 'h2', text })
      else blocks.push({ type: 'h3', text })
      i++
      continue
    }

    if (/^>\s?/.test(line)) {
      const q: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        q.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', text: q.join('\n') })
      continue
    }

    // standalone image line
    const imgLine = line.match(IMAGE_LINE_RE)
    if (imgLine) {
      blocks.push({ type: 'image', alt: imgLine[1], src: imgLine[2].trim() })
      i++
      continue
    }

    // nested list (ul / ol / task 可混排、可缩进)
    if (isListLine(line)) {
      const parsed = parseListBlock(lines, i)
      blocks.push({ type: 'list', items: parsed.items })
      i = parsed.next
      continue
    }

    if (!line.trim()) {
      i++
      continue
    }

    // paragraph：合并连续普通行，再拆出内嵌整行图片
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !isListLine(lines[i]) &&
      !/^\s*([-*_]){3,}\s*$/.test(lines[i]) &&
      !isTableStart(lines, i) &&
      !IMAGE_LINE_RE.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    // 若下一块是独立图片行，段落结束后由循环处理；段落内的 ![ ]() 由 splitParaParts 处理
    blocks.push({ type: 'p', parts: splitParaParts(para.join('\n')) })
  }

  return blocks
}

function isListLine(line: string): boolean {
  return TASK_RE.test(line) || UL_RE.test(line) || OL_RE.test(line)
}

type RawListItem = {
  indent: number
  kind: ListKind
  text: string
  checked?: boolean
}

function parseListLine(line: string): RawListItem | null {
  let m = line.match(TASK_RE)
  if (m) {
    return {
      indent: expandTabs(m[1]).length,
      kind: 'task',
      text: m[3],
      checked: m[2].toLowerCase() === 'x',
    }
  }
  m = line.match(OL_RE)
  if (m) {
    return {
      indent: expandTabs(m[1]).length,
      kind: 'ol',
      text: m[2],
    }
  }
  m = line.match(UL_RE)
  if (m) {
    return {
      indent: expandTabs(m[1]).length,
      kind: 'ul',
      text: m[2],
    }
  }
  return null
}

function expandTabs(ws: string): string {
  return ws.replace(/\t/g, '    ')
}

/**
 * 收集连续列表行（含缩进嵌套），按缩进建树。
 * 允许列表项后续续行（缩进更深的非列表行并入上一项 text）。
 */
function parseListBlock(
  lines: string[],
  start: number
): { items: ListNode[]; next: number } {
  const raw: RawListItem[] = []
  let i = start
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      // 空行：若下一行仍是列表则跳过空行继续；否则结束
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j++
      if (j < lines.length && isListLine(lines[j])) {
        i = j
        continue
      }
      break
    }
    const item = parseListLine(line)
    if (item) {
      raw.push(item)
      i++
      // 续行：比当前项更深缩进、且不是新列表项的普通行
      while (i < lines.length) {
        const cont = lines[i]
        if (!cont.trim()) break
        if (isListLine(cont)) break
        const contIndent = expandTabs(cont.match(/^(\s*)/)?.[1] || '').length
        if (contIndent <= item.indent) break
        raw[raw.length - 1].text += ' ' + cont.trim()
        i++
      }
      continue
    }
    break
  }

  return { items: buildListTree(raw), next: i }
}

function buildListTree(raw: RawListItem[]): ListNode[] {
  type Frame = { indent: number; node: ListNode; children: ListNode[] }
  const root: ListNode[] = []
  const stack: Frame[] = [{ indent: -1, node: null as unknown as ListNode, children: root }]

  for (const item of raw) {
    const node: ListNode = {
      kind: item.kind,
      text: item.text,
      checked: item.checked,
      children: [],
    }
    while (stack.length > 1 && stack[stack.length - 1].indent >= item.indent) {
      stack.pop()
    }
    const parent = stack[stack.length - 1]
    parent.children.push(node)
    stack.push({ indent: item.indent, node, children: node.children })
  }
  return root
}

/** 把段落文本按行内/行级图片切成 parts */
function splitParaParts(text: string): ParaPart[] {
  const parts: ParaPart[] = []
  // 先按行处理：整行图片单独 part；否则累积文本，再在文本里拆行内图片
  const lines = text.split('\n')
  let textBuf: string[] = []
  const flushText = () => {
    if (!textBuf.length) return
    const joined = textBuf.join('\n')
    textBuf = []
    pushTextWithInlineImages(parts, joined)
  }
  for (const line of lines) {
    const m = line.match(IMAGE_LINE_RE)
    if (m) {
      flushText()
      parts.push({ kind: 'image', alt: m[1], src: m[2].trim() })
    } else {
      textBuf.push(line)
    }
  }
  flushText()
  if (!parts.length) parts.push({ kind: 'text', text })
  return parts
}

function pushTextWithInlineImages(parts: ParaPart[], text: string) {
  if (!text) return
  const re = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let last = 0
  let m: RegExpExecArray | null
  let found = false
  while ((m = re.exec(text))) {
    found = true
    if (m.index > last) {
      parts.push({ kind: 'text', text: text.slice(last, m.index) })
    }
    parts.push({ kind: 'image', alt: m[1], src: m[2].trim() })
    last = m.index + m[0].length
  }
  // 无图片：整段一次；有图片：只补尾巴。切勿再 push 全文，否则段落会整段重复。
  if (!found) {
    parts.push({ kind: 'text', text })
    return
  }
  if (last < text.length) {
    parts.push({ kind: 'text', text: text.slice(last) })
  }
}

function isTableStart(lines: string[], i: number): boolean {
  if (i + 1 >= lines.length) return false
  if (!TABLE_ROW_RE.test(lines[i]) && !looksLikeTableRow(lines[i])) return false
  return TABLE_SEP_RE.test(lines[i + 1])
}

function looksLikeTableRow(line: string): boolean {
  const t = line.trim()
  if (!t || t.startsWith('```')) return false
  return t.includes('|') && !t.startsWith('>')
}

function parseTable(
  lines: string[],
  start: number
): { block: Extract<Block, { type: 'table' }>; next: number } {
  const headers = splitTableRow(lines[start])
  const aligns = parseAligns(lines[start + 1], headers.length)
  const rows: string[][] = []
  let i = start + 2
  while (i < lines.length) {
    const raw = lines[i]
    if (!raw.trim()) break
    if (!looksLikeTableRow(raw) && !TABLE_ROW_RE.test(raw)) break
    if (TABLE_SEP_RE.test(raw)) {
      i++
      continue
    }
    rows.push(splitTableRow(raw))
    i++
  }
  return {
    block: { type: 'table', headers, rows, aligns },
    next: i,
  }
}

function splitTableRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

function parseAligns(sepLine: string, colCount: number): Align[] {
  const cells = splitTableRow(sepLine)
  const aligns: Align[] = cells.map((c) => {
    const t = c.replace(/\s/g, '')
    const left = t.startsWith(':')
    const right = t.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    return 'left'
  })
  while (aligns.length < colCount) aligns.push('left')
  return aligns.slice(0, colCount)
}

// ─── inline parser ──────────────────────────────────────────────

/**
 * 行内优先级：code → image → link → strong → del → em
 * 支持：`code` ![alt](url) [text](url) **bold** ~~del~~ *em*
 */
function parseInlines(text: string): InlineSeg[] {
  const segs: InlineSeg[] = []
  const re =
    /(`+)([^`]+?)\1|!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) {
      segs.push({ t: 'text', v: text.slice(last, m.index) })
    }
    if (m[2] != null) segs.push({ t: 'code', v: m[2] })
    else if (m[3] != null && m[4] != null) segs.push({ t: 'image', alt: m[3], src: m[4].trim() })
    else if (m[5] != null && m[6] != null) segs.push({ t: 'link', v: m[5], href: m[6] })
    else if (m[7] != null) segs.push({ t: 'strong', v: m[7] })
    else if (m[8] != null) segs.push({ t: 'strong', v: m[8] })
    else if (m[9] != null) segs.push({ t: 'del', v: m[9] })
    else if (m[10] != null) segs.push({ t: 'em', v: m[10] })
    else if (m[11] != null) segs.push({ t: 'em', v: m[11] })
    last = m.index + m[0].length
  }
  if (last < text.length) segs.push({ t: 'text', v: text.slice(last) })
  if (!segs.length) segs.push({ t: 'text', v: text })
  return segs
}

export default MarkdownContent
