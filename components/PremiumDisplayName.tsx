import React, { useEffect, useId, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Platform, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

type Props = {
  text: string;
  premium: boolean;
  /** Used when not premium */
  color: string;
  fontSize?: number;
  fontWeight?: '600' | '700' | '800';
  numberOfLines?: number;
};

const MAX_SVG_WIDTH = Math.min(320, Dimensions.get('window').width * 0.62);

/**
 * Display name with the same gold gradient treatment as DietKuWordmark when premium.
 */
export function PremiumDisplayName({
  text,
  premium,
  color,
  fontSize = 15,
  fontWeight = '700',
  numberOfLines = 1,
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [phase, setPhase] = useState(0);
  const drift = useRef(new Animated.Value(0)).current;

  // Gradient sheen (same idea as DietKuWordmark), slightly stronger so it reads on 12–16px type.
  useEffect(() => {
    if (!premium) return;
    const id = setInterval(() => {
      setPhase((p) => (p + 0.042) % (Math.PI * 2));
    }, 40);
    return () => clearInterval(id);
  }, [premium]);

  // Subtle horizontal drift on native driver — visible even if SVG gradient repaints are subtle.
  useEffect(() => {
    if (!premium) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      drift.setValue(0);
    };
  }, [premium, drift]);

  if (!text) {
    return null;
  }

  if (!premium) {
    return (
      <Text style={{ fontSize, fontWeight, color }} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  const displayText =
    numberOfLines === 1 && text.length > 26 ? `${text.slice(0, 25)}…` : text;
  const estWidth = Math.ceil(displayText.length * fontSize * 0.55);
  const width = Math.max(40, Math.min(MAX_SVG_WIDTH, estWidth));
  const height = Math.round(fontSize * 1.34);
  const textY = Math.round(fontSize * 0.92);

  const gradId = `pdn-${uid}`;
  const s = Math.sin(phase);
  const c = Math.cos(phase * 0.73);
  const x1 = `${-12 + s * 8}%`;
  const y1 = `${-4 + c * 9}%`;
  const x2 = `${106 + s * 9}%`;
  const y2 = `${90 - c * 12}%`;
  const mid = 44 + s * 14;

  const svgWeight = fontWeight === '600' ? '600' : fontWeight === '800' ? '800' : '700';

  const tx = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-1.4, 1.4],
  });

  return (
    <Animated.View style={{ maxWidth: MAX_SVG_WIDTH, transform: [{ translateX: tx }] }}>
      <Svg
        width={width}
        height={height}
        accessibilityLabel={`${text}${premium ? ', Premium' : ''}`}
      >
        <Defs>
          <LinearGradient id={gradId} x1={x1} y1={y1} x2={x2} y2={y2}>
            <Stop offset="0%" stopColor="#92400E" />
            <Stop offset={`${Math.max(14, mid - 20)}%`} stopColor="#CA8A04" />
            <Stop offset={`${mid}%`} stopColor="#FDE047" />
            <Stop offset={`${Math.min(86, mid + 18)}%`} stopColor="#EAB308" />
            <Stop offset="100%" stopColor="#A16207" />
          </LinearGradient>
        </Defs>
        <SvgText
          fill={`url(#${gradId})`}
          fontSize={fontSize}
          fontWeight={svgWeight}
          x="0"
          y={textY}
          letterSpacing={-0.2}
          {...(Platform.OS === 'ios' ? { fontFamily: 'System' } : { fontFamily: 'sans-serif' })}
        >
          {displayText}
        </SvgText>
      </Svg>
    </Animated.View>
  );
}
