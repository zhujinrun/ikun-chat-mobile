import { useEffect, useRef } from 'react'
import { Animated, Easing, View, StyleSheet } from 'react-native'
import Icon from './Icon'

type Props = {
  color?: string
  size?: number
}

/**
 * 流式等待态：旋转图标替代「正在思考…」大段文字。
 */
const ThinkingIndicator = ({ color = '#64748B', size = 18 }: Props) => {
  const spin = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0.45)).current

  useEffect(() => {
    const rotateLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    )
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    )
    rotateLoop.start()
    pulseLoop.start()
    return () => {
      rotateLoop.stop()
      pulseLoop.stop()
    }
  }, [spin, pulse])

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel="正在思考"
    >
      <Animated.View style={{ transform: [{ rotate }], opacity: pulse }}>
        <Icon name="thinking" size={size} color={color} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 22,
    justifyContent: 'center',
    paddingVertical: 2,
  },
})

export default ThinkingIndicator
