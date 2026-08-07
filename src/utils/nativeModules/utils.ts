import { NativeModules } from 'react-native'

const { UtilsModule } = NativeModules

export const exitApp = () => {
  if (UtilsModule?.exitApp) UtilsModule.exitApp()
}

export const getWindowSize = async (): Promise<{ width: number; height: number }> => {
  if (UtilsModule?.getWindowSize) return UtilsModule.getWindowSize()
  return { width: 0, height: 0 }
}
