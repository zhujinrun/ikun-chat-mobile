import { storageDataPrefix } from '@/config/constant'
import defaultSetting from '@/config/defaultSetting'
import { getData, saveData } from '@/plugins/storage'
import settingState from '@/store/setting/state'

const primitiveType = ['string', 'boolean', 'number']
const checkPrimitiveType = (val: unknown): boolean =>
  val === null || primitiveType.includes(typeof val)

const mergeSetting = (
  originSetting: LX.AppSetting,
  targetSetting?: Partial<LX.AppSetting> | null
): {
  setting: LX.AppSetting
  updatedSettingKeys: Array<keyof LX.AppSetting>
  updatedSetting: Partial<LX.AppSetting>
} => {
  const originSettingCopy: LX.AppSetting = { ...originSetting }
  const updatedSettingKeys: Array<keyof LX.AppSetting> = []
  const updatedSetting: Partial<LX.AppSetting> = {}

  if (targetSetting) {
    for (const key of Object.keys(originSettingCopy) as Array<keyof LX.AppSetting>) {
      const targetValue = targetSetting[key]
      if (!checkPrimitiveType(targetValue) || targetValue === originSettingCopy[key]) continue
      updatedSettingKeys.push(key)
      // @ts-expect-error dynamic assign
      updatedSetting[key] = targetValue
      // @ts-expect-error dynamic assign
      originSettingCopy[key] = targetValue
    }
  }

  return {
    setting: originSettingCopy,
    updatedSettingKeys,
    updatedSetting,
  }
}

export const updateSetting = (setting?: Partial<LX.AppSetting> | null, isInit: boolean = false) => {
  const originSetting: LX.AppSetting = isInit ? { ...defaultSetting } : settingState.setting
  const result = mergeSetting(originSetting, setting)
  void saveData(storageDataPrefix.setting, result.setting)
  global.lx.setting = result.setting
  return result
}

export const initSetting = async () => {
  const stored = await getData<LX.AppSetting>(storageDataPrefix.setting)
  const result = updateSetting(stored, true)
  return result.setting
}
