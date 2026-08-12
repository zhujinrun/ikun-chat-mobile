import React, { useMemo } from 'react'
import {
  CommonActions,
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Platform, StatusBar, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { enableScreens } from 'react-native-screens'
import IconButton from '@/components/common/IconButton'
import Home from '@/screens/Home'
import Setting from '@/screens/Setting'
import { useTheme } from '@/store/theme/hook'
import { HOME_SCREEN, SETTING_SCREEN } from './screenNames'
import { navigationRef } from './navigation'
import type { RootStackParamList } from './types'

enableScreens(true)

const Stack = createNativeStackNavigator<RootStackParamList>()

type SettingHeaderProps = {
  colors: {
    surface: string
    border: string
    text: string
  }
  isDark: boolean
  onBack: () => void
}

const SettingHeader = ({ colors, isDark, onBack }: SettingHeaderProps) => {
  const insets = useSafeAreaInsets()
  const topInset = Platform.OS === 'android' ? StatusBar.currentHeight || insets.top : insets.top

  return (
    <View
      style={[
        styles.settingHeader,
        {
          paddingTop: topInset,
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <View style={styles.settingHeaderInner}>
        <IconButton
          name="back"
          accessibilityLabel="返回"
          color={colors.text}
          size={24}
          hitSlop={12}
          style={styles.settingBackButton}
          onPress={onBack}
        />
        <Text style={[styles.settingTitle, { color: colors.text }]} numberOfLines={1}>
          设置
        </Text>
        <View style={styles.settingHeaderSpacer} />
      </View>
    </View>
  )
}

const AppNavigator = () => {
  const theme = useTheme()
  const colors = theme.colors

  const navigationTheme = useMemo(() => {
    const baseTheme = theme.isDark ? DarkTheme : DefaultTheme

    return {
      ...baseTheme,
      dark: theme.isDark,
      colors: {
        ...baseTheme.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.primary,
      },
    }
  }, [colors.background, colors.border, colors.primary, colors.surface, colors.text, theme.isDark])

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef} theme={navigationTheme}>
        <Stack.Navigator
          initialRouteName={HOME_SCREEN}
          screenOptions={{
            contentStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen
            name={HOME_SCREEN}
            component={Home}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name={SETTING_SCREEN}
            component={Setting}
            options={({ navigation }) => ({
              header: () => (
                <SettingHeader
                  colors={colors}
                  isDark={theme.isDark}
                  onBack={() => {
                    if (navigation.canGoBack()) {
                      navigation.goBack()
                      return
                    }
                    navigation.dispatch(
                      CommonActions.reset({
                        index: 0,
                        routes: [{ name: HOME_SCREEN }],
                      })
                    )
                  }}
                />
              ),
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
              headerTitleStyle: { fontWeight: '600' },
              contentStyle: { backgroundColor: colors.background },
              statusBarBackgroundColor: 'transparent',
              statusBarStyle: theme.isDark ? 'light' : 'dark',
              statusBarTranslucent: true,
            })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  settingHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  settingHeaderInner: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTitle: {
    flex: 1,
    marginLeft: 2,
    fontSize: 18,
    fontWeight: '700',
  },
  settingHeaderSpacer: {
    width: 40,
  },
})

export default AppNavigator
