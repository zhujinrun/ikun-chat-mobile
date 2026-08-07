import { Ionicons } from '@react-native-vector-icons/ionicons'
import type { TextProps } from 'react-native'

/** 应用内统一图标名（映射到 Ionicons） */
export type AppIconName =
  | 'menu'
  | 'settings'
  | 'copy'
  | 'edit'
  | 'refresh'
  | 'retry'
  | 'export'
  | 'trash'
  | 'prompt'
  | 'send'
  | 'stop'
  | 'add'
  | 'close'
  | 'check'
  | 'chat'
  | 'model'
  | 'thinking'

const ICON_MAP: Record<AppIconName, string> = {
  menu: 'menu-outline',
  settings: 'settings-outline',
  copy: 'copy-outline',
  edit: 'create-outline',
  refresh: 'refresh-outline',
  retry: 'reload-outline',
  export: 'share-outline',
  trash: 'trash-outline',
  prompt: 'chatbox-ellipses-outline',
  send: 'send',
  stop: 'stop',
  add: 'add',
  close: 'close',
  check: 'checkmark',
  chat: 'chatbubbles-outline',
  model: 'hardware-chip-outline',
  thinking: 'sync-outline',
}

type Props = {
  name: AppIconName
  size?: number
  color?: string
  style?: TextProps['style']
}

/**
 * 统一图标。基于 Ionicons，避免各处散落文字按钮。
 */
const Icon = ({ name, size = 20, color = '#64748B', style }: Props) => {
  return <Ionicons name={ICON_MAP[name] as any} size={size} color={color} style={style} />
}

export default Icon
