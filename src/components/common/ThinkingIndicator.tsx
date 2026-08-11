import { useEffect, useRef } from 'react'
import { Animated, Easing, View, StyleSheet } from 'react-native'

type Props = {
  color?: string
  size?: number
}

const DOTS = [0, 1, 2] as const

/**
 * 流式等待态：轻量三点呼吸，避免旋转图标在聊天区产生过强干扰。
 */
const ThinkingIndicator = ({ color = '#64748B', size = 18 }: Props) => {
  const dots = useRef(DOTS.map(() => new Animated.Value(0.38))).current
  const dotSize = Math.max(5, Math.min(8, Math.round(size * 0.36)))
  const wrapHeight = Math.max(22, dotSize + 12)

  useEffect(() => {
    const loops = dots.map((dot, index) =>
      Animated.sequence([
        Animated.delay(index * 150),
        Animated.loop(
          Animated.sequence([
            Animated.timing(dot, {
              toValue: 1,
              duration: 360,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              toValue: 0.38,
              duration: 420,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.delay(180),
          ])
        ),
      ])
    )
    loops.forEach((loop) => loop.start())
    return () => {
      loops.forEach((loop) => loop.stop())
    }
  }, [dots])

  return (
    <View
      style={[styles.wrap, { minHeight: wrapHeight }]}
      accessibilityRole="progressbar"
      accessibilityLabel="正在思考"
    >
      <View style={styles.dots}>
        {dots.map((dot, index) => {
          const scale = dot.interpolate({
            inputRange: [0.38, 1],
            outputRange: [0.82, 1.18],
          })
          return (
            <Animated.View
              key={DOTS[index]}
              style={[
                styles.dot,
                {
                  width: dotSize,
                  height: dotSize,
                  borderRadius: dotSize / 2,
                  backgroundColor: color,
                  opacity: dot,
                  transform: [{ scale }],
                },
              ]}
            />
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    opacity: 0.38,
  },
})

export default ThinkingIndicator
