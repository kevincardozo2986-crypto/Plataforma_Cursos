import { CertificateLayout } from '../../../core/certificates/certificates.models';

/**
 * La geometría de cada diseño de certificado, con las mismas coordenadas (en puntos, A4
 * horizontal) que usa el generador del PDF en el backend
 * (backend/src/modules/certificates/certificate-pdf.ts). Así la vista previa se ve como el PDF.
 * Si cambias un diseño allá, cámbialo aquí.
 */

export const PAGE_WIDTH = 841.89;
export const PAGE_HEIGHT = 595.28;

const W = PAGE_WIDTH;
const H = PAGE_HEIGHT;

const HEX = /^#[0-9A-Fa-f]{6}$/;
export const DEFAULT_ACCENT = '#1F3A8A';

/** Mezcla un color con blanco (amount > 0) o con negro (amount < 0). */
export function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  const target = amount >= 0 ? 255 : 0;
  const mixed = channels.map((channel) =>
    Math.round(channel + (target - channel) * Math.abs(amount)),
  );

  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** Dónde y con qué colores va el texto de un diseño (en puntos). */
export interface TextBox {
  x: number;
  width: number;
  align: 'center' | 'left';
  titleY: number;
  titleSize: number;
  upper: boolean;
  contentY: number;
  rule: 'center' | 'left' | 'none';
  signature: { x: number; width: number };
  footerY: number;
  colors: {
    title: string;
    name: string;
    text: string;
    soft: string;
    accent: string;
    line: string;
    footer: string;
  };
}

const INK = '#111827';
const GRAY = '#4B5563';
const LIGHT = '#9CA3AF';

const baseColors = (accent: string): TextBox['colors'] => ({
  title: accent,
  name: INK,
  text: '#1F2937',
  soft: GRAY,
  accent,
  line: '#374151',
  footer: LIGHT,
});

const centered = (x: number, titleY: number, accent: string): TextBox => ({
  x,
  width: W - x * 2,
  align: 'center',
  titleY,
  titleSize: 34,
  upper: false,
  contentY: 150,
  rule: 'center',
  signature: { x: W / 2 - 120, width: 240 },
  footerY: H - 44,
  colors: baseColors(accent),
});

/** Color seguro: si no es un hexadecimal de 6 dígitos (p. ej. mientras se escribe), el de siempre. */
export function safeAccent(color: string): string {
  return HEX.test(color) ? color : DEFAULT_ACCENT;
}

export function textBox(layout: CertificateLayout, color: string): TextBox {
  const accent = safeAccent(color);

  switch (layout) {
    case 'MODERN':
      return {
        ...centered(78, 72, accent),
        width: W - 138,
        align: 'left',
        titleSize: 26,
        upper: true,
        rule: 'none',
        signature: { x: 78, width: 230 },
      };
    case 'ELEGANT':
      return { ...centered(80, 78, accent), titleSize: 32, contentY: 158 };
    case 'BOLD': {
      const box = centered(70, 66, accent);

      return { ...box, contentY: 205, colors: { ...box.colors, title: '#FFFFFF' } };
    }
    case 'MINIMAL':
      return {
        ...centered(70, 90, accent),
        align: 'left',
        titleSize: 30,
        contentY: 165,
        rule: 'none',
        signature: { x: 70, width: 240 },
      };
    case 'SEAL':
      return { ...centered(70, 86, accent), signature: { x: 110, width: 240 } };
    case 'GEOMETRIC':
      return centered(120, 90, accent);
    case 'SIDEBAR':
      return {
        ...centered(270, 84, accent),
        width: W - 320,
        align: 'left',
        titleSize: 28,
        rule: 'left',
        signature: { x: 270, width: 230 },
      };
    case 'FRAME':
      return centered(90, 88, accent);
    case 'DARK':
      return {
        ...centered(80, 86, accent),
        colors: {
          title: shade(accent, 0.45),
          name: '#FFFFFF',
          text: '#E5E7EB',
          soft: '#CBD5E1',
          accent: shade(accent, 0.45),
          line: '#CBD5E1',
          footer: '#94A3B8',
        },
      };
    case 'WAVES': {
      const box = centered(70, 34, accent);

      return {
        ...box,
        titleSize: 30,
        contentY: 175,
        footerY: H - 66,
        colors: { ...box.colors, title: '#FFFFFF' },
      };
    }
    case 'RIBBON':
      return { ...centered(70, 86, accent), width: W - 70 - 190 };
    default:
      return centered(70, 84, accent);
  }
}

// ---------- Dibujo (SVG con las mismas coordenadas que el PDF) ----------

const n = (value: number): string => value.toFixed(2);

const rect = (x: number, y: number, w: number, h: number, attrs: string) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" ${attrs}/>`;

const poly = (points: [number, number][], fill: string) =>
  `<polygon points="${points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="${fill}"/>`;

const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, width: number) =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${width}"/>`;

function starPoints(cx: number, cy: number, outer: number, inner: number): [number, number][] {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * index - Math.PI / 2;

    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

function seal(cx: number, cy: number, r: number, color: string, tails: boolean): string {
  const dark = shade(color, -0.25);
  const ribbons = tails
    ? poly(
        [
          [cx - r * 0.55, cy],
          [cx - r * 0.1, cy],
          [cx - r * 0.35, cy + r * 1.9],
          [cx - r * 0.75, cy + r * 1.55],
        ],
        dark,
      ) +
      poly(
        [
          [cx + r * 0.55, cy],
          [cx + r * 0.1, cy],
          [cx + r * 0.35, cy + r * 1.9],
          [cx + r * 0.75, cy + r * 1.55],
        ],
        dark,
      )
    : '';

  return (
    ribbons +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${color}"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.82)}" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>` +
    poly(starPoints(cx, cy, r * 0.5, r * 0.22), '#FFFFFF')
  );
}

const outline = (x: number, y: number, w: number, h: number, stroke: string, width: number) =>
  rect(x, y, w, h, `fill="none" stroke="${stroke}" stroke-width="${width}"`);

/** El SVG completo (viewBox del tamaño de la página) con la decoración del diseño. */
export function certificateArt(layout: CertificateLayout, color: string): string {
  const a = safeAccent(color);
  const dark = shade(a, -0.3);
  const body = ART[layout]?.(a, dark) ?? ART.CLASSIC(a, dark);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`;
}

const ART: Record<CertificateLayout, (a: string, dark: string) => string> = {
  CLASSIC: (a) => outline(22, 22, W - 44, H - 44, a, 7) + outline(36, 36, W - 72, H - 72, a, 1),

  MODERN: (a) =>
    rect(0, 0, 30, H, `fill="${a}"`) +
    rect(30, 0, 6, H, `fill="${a}" fill-opacity="0.35"`) +
    line(78, 112, 168, 112, a, 2),

  ELEGANT: (a) => {
    const corners = [
      [34, 34],
      [W - 34, 34],
      [34, H - 34],
      [W - 34, H - 34],
    ]
      .map(
        ([x, y]) =>
          rect(x - 7, y - 7, 14, 14, `fill="${a}"`) + rect(x - 3, y - 3, 6, 6, 'fill="#FFFDF7"'),
      )
      .join('');

    return (
      rect(0, 0, W, H, 'fill="#FFFDF7"') +
      outline(26, 26, W - 52, H - 52, a, 1.4) +
      outline(34, 34, W - 68, H - 68, a, 0.6) +
      corners +
      line(W / 2 - 130, 132, W / 2 - 12, 132, a, 1) +
      line(W / 2 + 12, 132, W / 2 + 130, 132, a, 1) +
      poly(
        [
          [W / 2, 126],
          [W / 2 + 6, 132],
          [W / 2, 138],
          [W / 2 - 6, 132],
        ],
        a,
      )
    );
  },

  BOLD: (a, dark) =>
    rect(0, 0, W, 165, `fill="${a}"`) +
    rect(0, 165, W, 6, `fill="${dark}"`) +
    rect(0, H - 14, W, 14, `fill="${a}"`),

  MINIMAL: (a) =>
    rect(70, 58, 64, 5, `fill="${a}"`) + line(70, H - 60, W - 70, H - 60, '#D1D5DB', 0.6),

  SEAL: (a) =>
    outline(24, 24, W - 48, H - 48, a, 2.5) +
    outline(32, 32, W - 64, H - 64, a, 0.7) +
    seal(W - 150, H - 175, 46, a, true),

  GEOMETRIC: (a, dark) =>
    poly(
      [
        [0, 0],
        [270, 0],
        [0, 210],
      ],
      a,
    ) +
    poly(
      [
        [0, 0],
        [170, 0],
        [0, 130],
      ],
      dark,
    ) +
    poly(
      [
        [W, H],
        [W - 270, H],
        [W, H - 210],
      ],
      a,
    ) +
    poly(
      [
        [W, H],
        [W - 170, H],
        [W, H - 130],
      ],
      dark,
    ),

  SIDEBAR: (a, dark) =>
    rect(0, 0, 230, H, `fill="${a}"`) +
    rect(222, 0, 8, H, `fill="${dark}"`) +
    seal(115, 230, 56, dark, true) +
    line(40, 120, 190, 120, shade(a, 0.55), 1) +
    line(40, 470, 190, 470, shade(a, 0.55), 1),

  FRAME: (a) => {
    const light = shade(a, 0.92);
    const corners = [
      [26, 26],
      [W - 26, 26],
      [26, H - 26],
      [W - 26, H - 26],
    ]
      .map(
        ([x, y]) =>
          `<circle cx="${x}" cy="${y}" r="16" fill="${light}" stroke="${a}" stroke-width="2"/>`,
      )
      .join('');

    return (
      rect(0, 0, W, H, `fill="${light}"`) +
      rect(20, 20, W - 40, H - 40, 'fill="#FFFFFF"') +
      outline(26, 26, W - 52, H - 52, a, 12) +
      corners
    );
  },

  DARK: (a) =>
    rect(0, 0, W, H, `fill="${shade(a, -0.78)}"`) +
    outline(24, 24, W - 48, H - 48, shade(a, 0.45), 2.5) +
    outline(34, 34, W - 68, H - 68, shade(a, 0.2), 0.6),

  WAVES: (a) =>
    `<path d="M0 0 L${W} 0 L${W} 120 C${n(W * 0.75)} 190 ${n(W * 0.35)} 60 0 130 Z" fill="${shade(a, 0.45)}"/>` +
    `<path d="M0 0 L${W} 0 L${W} 96 C${n(W * 0.72)} 160 ${n(W * 0.32)} 38 0 104 Z" fill="${a}"/>` +
    `<path d="M0 ${H} L${W} ${H} L${W} ${H - 34} C${n(W * 0.65)} ${H - 6} ${n(W * 0.3)} ${H - 56} 0 ${H - 28} Z" fill="${a}"/>`,

  RIBBON: (a, dark) => {
    const x = W - 150;

    return (
      outline(24, 24, W - 48, H - 48, '#D1D5DB', 1) +
      poly(
        [
          [x, 24],
          [x + 76, 24],
          [x + 76, 250],
          [x + 38, 218],
          [x, 250],
        ],
        a,
      ) +
      rect(x + 8, 24, 3, 205, `fill="${shade(a, 0.4)}"`) +
      rect(x + 65, 24, 3, 205, `fill="${shade(a, 0.4)}"`) +
      seal(x + 38, 262, 34, dark, false)
    );
  },
};

/** El tamaño de letra que cabe en `maxWidth` puntos (aproximado, para la vista previa). */
export function fitSize(text: string, start: number, maxWidth: number, min: number): number {
  const widest = text.length * 0.56;

  return widest * start <= maxWidth ? start : Math.max(min, Math.floor(maxWidth / widest));
}
