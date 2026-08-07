export const createId = (prefix = '') => {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}${Date.now().toString(36)}_${rand}`
}
