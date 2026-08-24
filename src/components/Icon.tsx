import React from 'react';
import Svg, { Path, Line, Rect, Circle, Polyline, Polygon } from 'react-native-svg';

interface IconProps {
  name: string;
  size?: number;
  stroke?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, stroke = 'currentColor', strokeWidth = 1.8 }: IconProps) {
  const props = {
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  const icons: Record<string, React.ReactNode> = {
    mic: (
      <>
        <Rect x="9" y="2" width="6" height="12" rx="3" {...props} />
        <Path d="M5 11a7 7 0 0 0 14 0" {...props} />
        <Line x1="12" y1="18" x2="12" y2="22" {...props} />
        <Path d="M9 22h6" {...props} />
      </>
    ),
    keyboard: (
      <>
        <Rect x="2" y="5" width="20" height="14" rx="2" {...props} />
        <Line x1="6" y1="10" x2="6" y2="10" {...props} strokeWidth={2.5} />
        <Line x1="10" y1="10" x2="10" y2="10" {...props} strokeWidth={2.5} />
        <Line x1="14" y1="10" x2="14" y2="10" {...props} strokeWidth={2.5} />
        <Line x1="18" y1="10" x2="18" y2="10" {...props} strokeWidth={2.5} />
        <Line x1="6" y1="14" x2="6" y2="14" {...props} strokeWidth={2.5} />
        <Line x1="10" y1="14" x2="10" y2="14" {...props} strokeWidth={2.5} />
        <Line x1="14" y1="14" x2="14" y2="14" {...props} strokeWidth={2.5} />
        <Line x1="18" y1="14" x2="18" y2="14" {...props} strokeWidth={2.5} />
        <Line x1="8" y1="18" x2="16" y2="18" {...props} />
      </>
    ),
    form: (
      <>
        <Rect x="4" y="3" width="16" height="18" rx="2" {...props} />
        <Line x1="8" y1="8" x2="16" y2="8" {...props} />
        <Line x1="8" y1="12" x2="16" y2="12" {...props} />
        <Line x1="8" y1="16" x2="12" y2="16" {...props} />
      </>
    ),
    stats: (
      <>
        <Line x1="4" y1="20" x2="4" y2="10" {...props} />
        <Line x1="10" y1="20" x2="10" y2="4" {...props} />
        <Line x1="16" y1="20" x2="16" y2="13" {...props} />
        <Line x1="22" y1="20" x2="2" y2="20" {...props} />
      </>
    ),
    list: (
      <>
        <Line x1="8" y1="6" x2="21" y2="6" {...props} />
        <Line x1="8" y1="12" x2="21" y2="12" {...props} />
        <Line x1="8" y1="18" x2="21" y2="18" {...props} />
        <Circle cx="4" cy="6" r="1" {...props} />
        <Circle cx="4" cy="12" r="1" {...props} />
        <Circle cx="4" cy="18" r="1" {...props} />
      </>
    ),
    settings: (
      <>
        <Circle cx="12" cy="12" r="3" {...props} />
        <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" {...props} />
      </>
    ),
    filter: (
      <>
        <Polyline points="3 4 10 12 10 20 14 18 14 12 21 4" {...props} />
        <Line x1="3" y1="4" x2="21" y2="4" {...props} />
      </>
    ),
    chev: <Polyline points="9 18 15 12 9 6" {...props} />,
    check: <Polyline points="20 6 9 17 4 12" {...props} />,
    x: (
      <>
        <Line x1="18" y1="6" x2="6" y2="18" {...props} />
        <Line x1="6" y1="6" x2="18" y2="18" {...props} />
      </>
    ),
    edit: (
      <>
        <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" {...props} />
        <Path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" {...props} />
      </>
    ),
    plus: (
      <>
        <Line x1="12" y1="5" x2="12" y2="19" {...props} />
        <Line x1="5" y1="12" x2="19" y2="12" {...props} />
      </>
    ),
    back: (
      <>
        <Line x1="19" y1="12" x2="5" y2="12" {...props} />
        <Polyline points="12 19 5 12 12 5" {...props} />
      </>
    ),
    trash: (
      <>
        <Polyline points="3 6 5 6 21 6" {...props} />
        <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" {...props} />
      </>
    ),
    heart: (
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" {...props} />
    ),
    share: (
      <>
        <Circle cx="18" cy="5" r="3" {...props} />
        <Circle cx="6" cy="12" r="3" {...props} />
        <Circle cx="18" cy="19" r="3" {...props} />
        <Line x1="8.59" y1="13.51" x2="15.42" y2="17.49" {...props} />
        <Line x1="15.41" y1="6.51" x2="8.59" y2="10.49" {...props} />
      </>
    ),
    shield: (
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" {...props} />
    ),
    search: (
      <>
        <Circle cx="11" cy="11" r="8" {...props} />
        <Line x1="21" y1="21" x2="16.65" y2="16.65" {...props} />
      </>
    ),
    // Seta circular de reset — sem texto, para funcionar de cabeça para baixo.
    rotate: (
      <>
        <Path d="M3 12a9 9 0 1 0 3-6.7" {...props} />
        <Polyline points="3 4 3 9 8 9" {...props} />
      </>
    ),
    // Fichas empilhadas: o cluster de contadores.
    counters: (
      <>
        <Circle cx="12" cy="6.5" r="4.5" {...props} />
        <Path d="M4.2 12.5A9 9 0 0 0 12 17a9 9 0 0 0 7.8-4.5" {...props} />
        <Path d="M4.2 17.5A9 9 0 0 0 12 22a9 9 0 0 0 7.8-4.5" {...props} />
      </>
    ),
    users: (
      <>
        <Circle cx="9" cy="8" r="3.2" {...props} />
        <Path d="M3 20a6 6 0 0 1 12 0" {...props} />
        <Path d="M16.5 5.4a3.2 3.2 0 0 1 0 5.2" {...props} />
        <Path d="M18 14.4A6 6 0 0 1 21 20" {...props} />
      </>
    ),
    pin: (
      <>
        <Path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z" {...props} />
        <Circle cx="12" cy="10" r="2.6" {...props} />
      </>
    ),
    // Raio do storm. Preenchido, não contornado: em 24 px dentro de um círculo
    // o traço vira um rabisco — a silhueta cheia é o que se reconhece.
    bolt: (
      <Polygon points="13 2 4 13.5 11 13.5 10 22 20 10.5 13 10.5" fill={stroke} stroke="none" />
    ),
    coffee: (
      <>
        <Path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" {...props} />
        <Path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17" {...props} />
        <Line x1="7" y1="2.5" x2="7" y2="5.5" {...props} />
        <Line x1="11" y1="2.5" x2="11" y2="5.5" {...props} />
        <Line x1="15" y1="2.5" x2="15" y2="5.5" {...props} />
      </>
    ),
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {icons[name] ?? null}
    </Svg>
  );
}
