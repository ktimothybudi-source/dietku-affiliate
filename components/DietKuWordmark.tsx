import React, { useEffect, useId, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

type Props = {
  premium: boolean;
  /** Text color when not premium */
  color: string;
  fontSize?: number;
  letterSpacing?: number;
  fontWeight?: '800' | '900';
};

/**
 * “DietKu” title: gold gradient when premium (subtle animated sheen), solid color otherwise.
 */
export function DietKuWordmark({
  premium,
  color,
  fontSize = 26,
  letterSpacing = -0.5,
  fontWeight = '800',
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!premium) return;
    const id = setInterval(() => {
      setPhase((p) => (p + 0.038) % (Math.PI * 2));
    }, 48);
    return () => clearInterval(id);
  }, [premium]);

  if (!premium) {
    return (
      <Text style={{ fontSize, fontWeight, letterSpacing, color }}>DietKu</Text>
    );
  }

  const gradId = `dkg-${uid}`;
  const width = Math.round(fontSize * 4.6);
  const height = Math.round(fontSize * 1.32);
  const textY = Math.round(fontSize * 0.9);

  const s = Math.sin(phase);
  const c = Math.cos(phase * 0.73);
  // Subtle sheen: slow drift of gradient axis (RevenueCat / billing unchanged — UI only)
  const x1 = `${-10 + s * 5}%`;
  const y1 = `${-2 + c * 6}%`;
  const x2 = `${104 + s * 6}%`;
  const y2 = `${88 - c * 10}%`;
  const mid = 44 + s * 12;

  return (
    <View style={{ height, justifyContent: 'center' }}>
      <Svg width={width} height={height} accessibilityLabel="DietKu">
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
          fontWeight={fontWeight}
          x="0"
          y={textY}
          letterSpacing={letterSpacing}
          {...(Platform.OS === 'ios' ? { fontFamily: 'System' } : { fontFamily: 'sans-serif' })}
        >
          DietKu
        </SvgText>
      </Svg>
    </View>
  );
}
