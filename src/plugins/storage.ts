import AsyncStorage from '@react-native-async-storage/async-storage'

const partKeyArrPrefix = '@___PART_A___'
const partKeyArrPrefixRxp = /^@___PART_A___/
const limit = 500000

const buildData = (key: string, value: unknown, datas: Array<[string, string]>) => {
  const valueStr = JSON.stringify(value)
  if (valueStr.length <= limit) {
    datas.push([key, valueStr])
    return
  }

  const partKeys: string[] = []
  for (let i = 0, len = Math.floor(valueStr.length / limit); i <= len; i++) {
    const partKey = `${partKeyArrPrefix}${key}${i}`
    partKeys.push(partKey)
    datas.push([partKey, valueStr.substring(i * limit, (i + 1) * limit)])
  }
  datas.push([key, partKeyArrPrefix + JSON.stringify(partKeys)])
}

const handleGetData = async <T>(partKeys: string): Promise<T> => {
  const keys = JSON.parse(partKeys.replace(partKeyArrPrefixRxp, '')) as string[]
  return AsyncStorage.multiGet(keys).then((datas) => {
    return JSON.parse(datas.map((data) => data[1]).join('')) as T
  })
}

export const saveData = async (key: string, value: unknown) => {
  const datas: Array<[string, string]> = []
  buildData(key, value, datas)
  await removeData(key)
  await AsyncStorage.multiSet(datas)
}

export const getData = async <T = unknown>(key: string): Promise<T | null> => {
  try {
    const value = await AsyncStorage.getItem(key)
    if (value == null) return null
    if (value.startsWith(partKeyArrPrefix)) return handleGetData<T>(value)
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export const removeData = async (key: string) => {
  try {
    const value = await AsyncStorage.getItem(key)
    if (value == null) return
    if (value.startsWith(partKeyArrPrefix)) {
      const keys = JSON.parse(value.replace(partKeyArrPrefixRxp, '')) as string[]
      await AsyncStorage.multiRemove([...keys, key])
      return
    }
    await AsyncStorage.removeItem(key)
  } catch {
    // ignore
  }
}
