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
  | 'chevron-down'
  | 'arrow-down'
  | 'warning'
  | 'pin'
  | 'search'
  | 'time'
  | 'eye'
  | 'eye-off'
  | 'image'
  | 'file'
  | 'more'

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
  'chevron-down': 'chevron-down',
  'arrow-down': 'arrow-down',
  warning: 'warning-outline',
  pin: 'pin-outline',
  search: 'search-outline',
  time: 'time-outline',
  eye: 'eye-outline',
  'eye-off': 'eye-off-outline',
  image: 'image-outline',
  file: 'document-text-outline',
  more: 'ellipsis-horizontal',
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
  // vector-icons 自带的 @types/react-native 与项目 RN 类型有冲突，style 需放宽
  return (
    <Ionicons name={ICON_MAP[name] as any} size={size} color={color} style={style as any} />
  )
}

export default Icon
