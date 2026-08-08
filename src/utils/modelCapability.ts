/** 模型图片能力：vision=支持视觉，text=仅文本，unknown=无法确定 */
export type VisionCapability = 'vision' | 'text' | 'unknown'

/**
 * 通过模型 ID 推断图片输入能力。
 * 中转站 /models 接口不会返回多模态能力字段，这里用命名习惯做合理推断；
 * 未知模型返回 'unknown'，配合「发送前提示」避免用户选了文本模型后才发现报错。
 */
const VISION_PATTERNS: RegExp[] = [
  // 名字里直接带 vision / vl / visual / camera
  /(?:^|[-_.\s])vision(?:[^a-z]|$)/,
  /(?:^|[-_.])vl(?:[^a-z0-9]|$)/,
  /(?:^|[-_.])visual/,
  // OpenAI / 微软系
  /gpt-4o/,
  /gpt-4\.1/,
  /gpt-4-turbo/,
  /gpt-4\.5/,
  /gpt-4-vision/,
  /gpt-5/,
  /gpt-oss/,
  /o4-mini/,
  /phi-[34]\s*-?vision/,
  /phi-4-multimodal/,
  // Anthropic Claude 全系（opus/sonnet/haiku）均支持视觉
  /claude/,
  // Google Gemini 主流版本均支持图像输入
  /gemini/,
  // 智谱 GLM 视觉版
  /glm-4v/,
  /glm-4\.1v/,
  /glm-4\.5v/,
  /glm-5v/,
  /glm-photo/,
  /glm-4\.5-flash/,
  // 通义千问 VL 系列（qwen2.5-vl / qwen3-vl 等）
  /qwen[\d.]*-vl/,
  // 其他开源多模态
  /llava/,
  /intern(?:vl|[-_]vl)/,
  /minicpm[^a-z]?v/,
  /yi-?[\d.]+-?(?:v|vl|vision)/,
  /yi-v/,
  /step-?1-?v/,
  /moonshot.*(?:vision|vl)/,
  /kimi.*(?:vision|vl|vlm)/,
  /doubao.*(?:vision|vl)/,
  /(?:^|[-_.])multimodal/,
  // 常见中转站视觉模块
  /(?:^|[-_.])visual/,
]

/** 确认已知的仅文本模型（有把握才标记，避免误伤） */
const TEXT_ONLY_PATTERNS: RegExp[] = [
  /(?:^|[-\/_.])deepseek/,
  /gpt-3\.5/,
  /(?:^|[-\/_.])gpt-4(?:[-.]?[0-9]+)?$/,
  /(?:^|[-\/_.])gpt-4-32k/,
  // o 系列推理模型（o4 及以上已支持视觉，除外）
  /(?:^|[-\/_.])o1(?:[^a-z0-9]|$)/,
  /(?:^|[-\/_.])o3(?:[^a-z0-9]|$)/,
  /(?:^|[-\/_.])text(?:[^a-z0-9]|$)/,
  /(?:^|[-\/_.])codex/,
]

export function inferVisionCapability(modelId?: string | null): VisionCapability {
  const id = String(modelId || '').trim().toLowerCase()
  if (!id) return 'unknown'
  if (VISION_PATTERNS.some((re) => re.test(id))) return 'vision'
  if (TEXT_ONLY_PATTERNS.some((re) => re.test(id))) return 'text'
  return 'unknown'
}

export const visionCapabilityLabel = (cap: VisionCapability): string => {
  switch (cap) {
    case 'vision':
      return '视觉'
    case 'text':
      return '仅文本'
    default:
      return '未知'
  }
}