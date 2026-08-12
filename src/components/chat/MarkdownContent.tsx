import { useMemo, type ReactNode } from 'react'
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import parser from 'react-native-markdown-display/src/lib/parser'
import AstRenderer from 'react-native-markdown-display/src/lib/AstRenderer'
import { useTheme } from '@/store/theme/hook'
import { toast } from '@/utils/toast'
import Icon from '@/components/common/Icon'
import MarkdownErrorBoundary from './MarkdownErrorBoundary'

type Props = {
  content: string
  fontSize?: number
  textColor?: string
}

type ASTNode = {
  type: string
  key: string
  content?: string
  markup?: string
  index: number
  attributes?: Record<string, any>
  children?: ASTNode[]
  sourceInfo?: string
}

type RenderRule = (
  node: ASTNode,
  children: ReactNode[],
  parentNodes: ASTNode[],
  styles: any,
  ...args: any[]
) => ReactNode

const MarkdownIt = require('markdown-it/dist/markdown-it')

const MIN_TABLE_COL_WIDTH = 112
const MIN_TABLE_WIDTH = 420
const markdownIt = MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})

const TEXT_STYLE_KEYS = new Set([
  'color',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textDecorationLine',
  'textShadowColor',
  'textShadowOffset',
  'textShadowRadius',
  'textTransform',
])

/**
 * 项目统一 Markdown 渲染封装。
 * Markdown 语法解析交给 markdown-it / react-native-markdown-display 的 AST 流程；
 * 项目侧只保留主题样式、代码/表格移动端滚动和安全图片渲染。
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
  const monoFontSize = Math.max(12, fontSize - 1)
  const cellFont = Math.max(12, fontSize - 1)

  const markdownStyles = useMemo(
    () =>
      createMarkdownStyles({
        color,
        fontSize,
        lineHeight,
        monoFontSize,
        cellFont,
        codeBg,
        muted,
        primary: colors.primary,
        border: colors.border,
        tableBorder,
        tableHeaderBg,
        isDark: theme.isDark,
      }),
    [
      cellFont,
      codeBg,
      color,
      colors.border,
      colors.primary,
      fontSize,
      lineHeight,
      monoFontSize,
      muted,
      tableBorder,
      tableHeaderBg,
      theme.isDark,
    ]
  )

  const rules = useMemo<Record<string, RenderRule>>(
    () => createRenderRules(colors.primary),
    [colors.primary]
  )

  const renderer = useMemo(
    () => new AstRenderer(rules, markdownStyles, undefined, undefined, undefined, [], null, false),
    [markdownStyles, rules]
  )

  const rendered = useMemo(
    () => (content ? parser(content, renderer.render, markdownIt) : null),
    [content, renderer]
  )

  if (!content) return null

  return (
    <MarkdownErrorBoundary fallbackText={content} textColor={color} fontSize={fontSize}>
      {rendered}
    </MarkdownErrorBoundary>
  )
}

function createRenderRules(copyIconColor: string): Record<string, RenderRule> {
  return {
    unknown: (node) => null,
    body: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_body}>
        {children}
      </View>
    ),
    heading1: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_heading1}>
        {children}
      </View>
    ),
    heading2: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_heading2}>
        {children}
      </View>
    ),
    heading3: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_heading3}>
        {children}
      </View>
    ),
    heading4: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_heading4}>
        {children}
      </View>
    ),
    heading5: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_heading5}>
        {children}
      </View>
    ),
    heading6: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_heading6}>
        {children}
      </View>
    ),
    hr: (node, _children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_hr} />
    ),
    strong: (node, children, _parent, styles) => (
      <Text key={node.key} style={styles.strong}>
        {children}
      </Text>
    ),
    em: (node, children, _parent, styles) => (
      <Text key={node.key} style={styles.em}>
        {children}
      </Text>
    ),
    s: (node, children, _parent, styles) => (
      <Text key={node.key} style={styles.s}>
        {children}
      </Text>
    ),
    blockquote: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_blockquote}>
        {children}
      </View>
    ),
    bullet_list: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_bullet_list}>
        {children}
      </View>
    ),
    ordered_list: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_ordered_list}>
        {children}
      </View>
    ),
    list_item: (node, children, parent, styles) => {
      if (hasParent(parent, 'ordered_list')) {
        const orderedList = parent.find((item) => item.type === 'ordered_list')
        const start = Number(orderedList?.attributes?.start || 1)
        return (
          <View key={node.key} style={styles._VIEW_SAFE_list_item}>
            <Text style={styles.ordered_list_icon}>
              {start + node.index}
              {node.markup || '.'}
            </Text>
            <View style={styles._VIEW_SAFE_ordered_list_content}>{children}</View>
          </View>
        )
      }

      return (
        <View key={node.key} style={styles._VIEW_SAFE_list_item}>
          <Text style={styles.bullet_list_icon} accessible={false}>
            {Platform.select({ ios: '\u00B7', default: '\u2022' })}
          </Text>
          <View style={styles._VIEW_SAFE_bullet_list_content}>{children}</View>
        </View>
      )
    },
    code_inline: (node, _children, _parent, styles, inheritedStyles = {}) => (
      <Text key={node.key} style={[inheritedStyles, styles.code_inline]}>
        {node.content}
      </Text>
    ),
    code_block: (node, _children, _parent, styles) =>
      renderCodeBlock(node, styles, copyIconColor, undefined),
    fence: (node, _children, _parent, styles) =>
      renderCodeBlock(node, styles, copyIconColor, getFenceLanguage(node)),
    table: (node, children, _parent, styles) => {
      const colCount = getTableColumnCount(node)
      const minWidth =
        colCount >= 3 ? Math.max(MIN_TABLE_WIDTH, colCount * MIN_TABLE_COL_WIDTH) : undefined
      const table = (
        <View
          key={`${node.key}-table`}
          style={[
            styles._VIEW_SAFE_table,
            minWidth ? { minWidth } : { alignSelf: 'stretch' },
          ]}
        >
          {children}
        </View>
      )

      if (!minWidth) {
        return (
          <View key={node.key} style={styles._VIEW_SAFE_tableViewport}>
            {table}
          </View>
        )
      }

      return (
        <View key={node.key} style={styles._VIEW_SAFE_tableViewport}>
          <ScrollView
            horizontal
            nestedScrollEnabled
            directionalLockEnabled
            showsHorizontalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            {table}
          </ScrollView>
        </View>
      )
    },
    thead: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_thead}>
        {children}
      </View>
    ),
    tbody: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_tbody}>
        {children}
      </View>
    ),
    tr: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_tr}>
        {children}
      </View>
    ),
    th: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_th}>
        <Text style={styles.tableCellText}>{children}</Text>
      </View>
    ),
    td: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_td}>
        <Text style={styles.tableCellText}>{children}</Text>
      </View>
    ),
    link: (node, children, _parent, styles) => (
      <Text
        key={node.key}
        style={styles.link}
        onPress={() => {
          const href = String(node.attributes?.href || '')
          if (href) void Linking.openURL(href).catch(() => null)
        }}
      >
        {children}
      </Text>
    ),
    blocklink: (node, children, _parent, styles) => (
      <Pressable
        key={node.key}
        style={styles._VIEW_SAFE_blocklink}
        onPress={() => {
          const href = String(node.attributes?.href || '')
          if (href) void Linking.openURL(href).catch(() => null)
        }}
      >
        {children}
      </Pressable>
    ),
    image: (node, _children, _parent, styles) => {
      const src = String(node.attributes?.src || '')
      const alt = String(node.attributes?.alt || '')
      if (!isSafeImageUrl(src)) {
        return (
          <Text key={node.key} style={styles.link}>
            {alt || src || '[图片]'}
          </Text>
        )
      }

      return (
        <View key={node.key} style={styles._VIEW_SAFE_imageWrap}>
          {!!alt && <Text style={styles.imageAlt}>{alt}</Text>}
          <Image
            source={{ uri: src }}
            style={styles._VIEW_SAFE_image}
            resizeMode="contain"
            accessibilityLabel={alt || '图片'}
          />
        </View>
      )
    },
    text: (node, _children, _parent, styles, inheritedStyles = {}) => (
      <Text key={node.key} style={[inheritedStyles, styles.text]}>
        {node.content}
      </Text>
    ),
    textgroup: (node, children, _parent, styles) => (
      <Text key={node.key} style={styles.textgroup} selectable>
        {children}
      </Text>
    ),
    paragraph: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_paragraph}>
        {children}
      </View>
    ),
    hardbreak: (node, _children, _parent, styles) => (
      <Text key={node.key} style={styles.hardbreak}>
        {'\n'}
      </Text>
    ),
    softbreak: (node, _children, _parent, styles) => (
      <Text key={node.key} style={styles.softbreak}>
        {'\n'}
      </Text>
    ),
    pre: (node, children, _parent, styles) => (
      <View key={node.key} style={styles._VIEW_SAFE_pre}>
        {children}
      </View>
    ),
    inline: (node, children, _parent, styles) => (
      <Text key={node.key} style={styles.inline}>
        {children}
      </Text>
    ),
    span: (node, children, _parent, styles) => (
      <Text key={node.key} style={styles.span}>
        {children}
      </Text>
    ),
  }
}

function createMarkdownStyles({
  color,
  fontSize,
  lineHeight,
  monoFontSize,
  cellFont,
  codeBg,
  muted,
  primary,
  border,
  tableBorder,
  tableHeaderBg,
  isDark,
}: {
  color: string
  fontSize: number
  lineHeight: number
  monoFontSize: number
  cellFont: number
  codeBg: string
  muted: string
  primary: string
  border: string
  tableBorder: string
  tableHeaderBg: string
  isDark: boolean
}) {
  const base: Record<string, any> = {
    body: {
      color,
      fontSize,
      lineHeight,
    },
    text: {
      color,
      fontSize,
      lineHeight,
    },
    textgroup: {
      color,
      fontSize,
      lineHeight,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 6,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
    },
    heading1: {
      color,
      fontSize: fontSize + 6,
      fontWeight: '700',
      lineHeight: fontSize + 10,
      marginTop: 8,
      marginBottom: 4,
    },
    heading2: {
      color,
      fontSize: fontSize + 4,
      fontWeight: '700',
      lineHeight: fontSize + 8,
      marginTop: 8,
      marginBottom: 4,
    },
    heading3: {
      color,
      fontSize: fontSize + 2,
      fontWeight: '700',
      lineHeight: fontSize + 6,
      marginTop: 6,
      marginBottom: 4,
    },
    heading4: {
      color,
      fontSize: fontSize + 1,
      fontWeight: '700',
      lineHeight: fontSize + 5,
      marginTop: 6,
      marginBottom: 4,
    },
    heading5: {
      color,
      fontSize,
      fontWeight: '700',
      lineHeight,
      marginTop: 6,
      marginBottom: 4,
    },
    heading6: {
      color,
      fontSize,
      fontWeight: '700',
      lineHeight,
      marginTop: 6,
      marginBottom: 4,
    },
    strong: {
      color,
      fontWeight: '700',
    },
    em: {
      color,
      fontStyle: 'italic',
    },
    s: {
      color: muted,
      textDecorationLine: 'line-through',
    },
    link: {
      color: primary,
      textDecorationLine: 'underline',
    },
    blocklink: {
      alignSelf: 'stretch',
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: primary,
      backgroundColor: codeBg,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginVertical: 6,
    },
    hr: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: border,
      marginVertical: 10,
    },
    bullet_list: {
      marginBottom: 6,
    },
    ordered_list: {
      marginBottom: 6,
    },
    list_item: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      marginBottom: 2,
    },
    bullet_list_icon: {
      color,
      fontSize,
      lineHeight,
      width: 22,
      marginLeft: 0,
      marginRight: 0,
      textAlign: 'center',
    },
    bullet_list_content: {
      flex: 1,
    },
    ordered_list_icon: {
      color,
      fontSize,
      lineHeight,
      minWidth: 28,
      marginLeft: 0,
      marginRight: 0,
    },
    ordered_list_content: {
      flex: 1,
    },
    code_inline: {
      color,
      backgroundColor: codeBg,
      fontFamily: 'monospace',
      fontSize: monoFontSize,
      borderWidth: 0,
      paddingHorizontal: 3,
      paddingVertical: 1,
      borderRadius: 4,
    },
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
      borderBottomColor: border,
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
      backgroundColor: isDark ? 'rgba(59,130,246,0.14)' : 'rgba(37,99,235,0.08)',
    },
    codeCopyText: {
      color: primary,
      fontSize: 11,
      fontWeight: '700',
    },
    codeScroller: {
      maxWidth: '100%',
    },
    codeScrollerContent: {
      alignItems: 'flex-start',
    },
    codeText: {
      color,
      fontFamily: 'monospace',
      fontSize: monoFontSize,
      lineHeight: Math.round(monoFontSize * 1.45),
      paddingHorizontal: 10,
      paddingVertical: 10,
      flexShrink: 0,
    },
    tableViewport: {
      alignSelf: 'stretch',
      maxWidth: '100%',
      marginVertical: 8,
    },
    table: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tableBorder,
      borderRadius: 8,
      overflow: 'hidden',
    },
    thead: {},
    tbody: {},
    tr: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: tableBorder,
    },
    th: {
      flex: 1,
      paddingVertical: 6,
      paddingHorizontal: 8,
      backgroundColor: tableHeaderBg,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: tableBorder,
    },
    td: {
      flex: 1,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: tableBorder,
    },
    tableCellText: {
      color,
      fontSize: cellFont,
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
      height: 180,
      backgroundColor: codeBg,
    },
    imageAlt: {
      color: muted,
      fontSize: Math.max(12, fontSize - 2),
      padding: 8,
      fontStyle: 'italic',
    },
    hardbreak: {
      width: '100%',
      height: 1,
    },
    softbreak: {},
    pre: {},
    inline: {},
    span: {},
  }
  const viewSafe = Object.fromEntries(
    Object.entries(base).map(([key, value]) => [`_VIEW_SAFE_${key}`, stripTextStyles(value)])
  )
  return StyleSheet.create({ ...base, ...viewSafe }) as any
}

function stripTextStyles(style: Record<string, any>) {
  const out: Record<string, any> = {}
  Object.keys(style || {}).forEach((key) => {
    if (!TEXT_STYLE_KEYS.has(key)) out[key] = style[key]
  })
  return out
}

function renderCodeBlock(
  node: ASTNode,
  styles: any,
  copyIconColor: string,
  lang?: string
): ReactNode {
  const content = trimTrailingNewline(node.content || '')
  const textStyle = StyleSheet.flatten(styles.codeText) || {}
  const codeFontSize = typeof textStyle.fontSize === 'number' ? textStyle.fontSize : 13
  const longestLineLength = Math.max(0, ...content.split('\n').map((line) => line.length))
  const estimatedCodeWidth = Math.ceil(longestLineLength * codeFontSize * 0.62 + 20)
  return (
    <View key={node.key} style={styles._VIEW_SAFE_codeBlock}>
      <View style={styles._VIEW_SAFE_codeHeader}>
        <Text style={styles.codeLang}>{lang || 'code'}</Text>
        <TouchableOpacity
          style={styles._VIEW_SAFE_codeCopyBtn}
          onPress={() => {
            Clipboard.setString(content)
            toast('代码已复制')
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="复制代码"
        >
          <Icon name="copy" size={14} color={copyIconColor} />
          <Text style={styles.codeCopyText}>复制</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator
        keyboardShouldPersistTaps="handled"
        style={styles._VIEW_SAFE_codeScroller}
        contentContainerStyle={styles._VIEW_SAFE_codeScrollerContent}
      >
        <Text style={[styles.codeText, estimatedCodeWidth ? { minWidth: estimatedCodeWidth } : null]}>
          {content}
        </Text>
      </ScrollView>
    </View>
  )
}

function hasParent(parentNodes: ASTNode[], type: string): boolean {
  return parentNodes.some((node) => node.type === type)
}

function trimTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value.slice(0, -1) : value
}

function getFenceLanguage(node: ASTNode): string | undefined {
  const sourceInfo = node.sourceInfo
  return typeof sourceInfo === 'string' && sourceInfo.trim()
    ? sourceInfo.trim().split(/\s+/)[0]
    : undefined
}

function getTableColumnCount(node: ASTNode): number {
  const rows: ASTNode[] = []
  collectNodes(node, 'tr', rows)
  return Math.max(
    0,
    ...rows.map((row) =>
      (row.children || []).filter((child) => child.type === 'th' || child.type === 'td').length
    )
  )
}

function collectNodes(node: ASTNode, type: string, out: ASTNode[]) {
  if (node.type === type) out.push(node)
  node.children?.forEach((child) => collectNodes(child, type, out))
}

function isSafeImageUrl(src: string): boolean {
  const value = src.trim()
  return /^https?:\/\//i.test(value) || /^data:image\//i.test(value)
}

export default MarkdownContent
