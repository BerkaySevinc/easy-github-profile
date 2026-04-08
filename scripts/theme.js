// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2025 BerkaySevinc — MIT License

const { readFileSync } = require('fs');
const { join } = require('path');

const DEFAULT_GRADIENT = ['#0d1117', '#4c1d95'];
const DEFAULT_ACCENT   = '#a78bfa';

// Named CSS colors → { r, g, b }
const NAMED_COLORS = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  none:        { r: 0, g: 0, b: 0, a: 0 },
  black:       { r: 0,   g: 0,   b: 0,   a: 1 },
  white:       { r: 255, g: 255, b: 255, a: 1 },
  red:         { r: 255, g: 0,   b: 0,   a: 1 },
  green:       { r: 0,   g: 128, b: 0,   a: 1 },
  blue:        { r: 0,   g: 0,   b: 255, a: 1 },
  yellow:      { r: 255, g: 255, b: 0,   a: 1 },
  cyan:        { r: 0,   g: 255, b: 255, a: 1 },
  magenta:     { r: 255, g: 0,   b: 255, a: 1 },
  orange:      { r: 255, g: 165, b: 0,   a: 1 },
  purple:      { r: 128, g: 0,   b: 128, a: 1 },
  pink:        { r: 255, g: 192, b: 203, a: 1 },
  gray:        { r: 128, g: 128, b: 128, a: 1 },
  grey:        { r: 128, g: 128, b: 128, a: 1 },
};

// Parse any CSS color string → { r, g, b, a } (r/g/b: 0–255, a: 0–1)
// Returns null if unrecognized.
function parseColor(v) {
  if (!v || typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();

  if (NAMED_COLORS[s]) return { ...NAMED_COLORS[s] };

  // #rrggbb
  if (/^#[0-9a-f]{6}$/.test(s)) {
    return {
      r: parseInt(s.slice(1, 3), 16),
      g: parseInt(s.slice(3, 5), 16),
      b: parseInt(s.slice(5, 7), 16),
      a: 1,
    };
  }

  // #rrggbbaa
  if (/^#[0-9a-f]{8}$/.test(s)) {
    return {
      r: parseInt(s.slice(1, 3), 16),
      g: parseInt(s.slice(3, 5), 16),
      b: parseInt(s.slice(5, 7), 16),
      a: parseInt(s.slice(7, 9), 16) / 255,
    };
  }

  // #rgb
  if (/^#[0-9a-f]{3}$/.test(s)) {
    return {
      r: parseInt(s[1] + s[1], 16),
      g: parseInt(s[2] + s[2], 16),
      b: parseInt(s[3] + s[3], 16),
      a: 1,
    };
  }

  // rgb(r, g, b) / rgba(r, g, b, a)
  const rgb = s.match(/^rgba?\s*\(\s*([\d.%]+)\s*,\s*([\d.%]+)\s*,\s*([\d.%]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (rgb) {
    const ch = v => v.endsWith('%') ? parseFloat(v) / 100 * 255 : parseFloat(v);
    return {
      r: ch(rgb[1]), g: ch(rgb[2]), b: ch(rgb[3]),
      a: rgb[4] !== undefined ? parseFloat(rgb[4]) : 1,
    };
  }

  // hsl(h, s%, l%) / hsla(h, s%, l%, a)
  const hsl = s.match(/^hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (hsl) {
    const h = parseFloat(hsl[1]) / 360;
    const sv = parseFloat(hsl[2]) / 100;
    const l  = parseFloat(hsl[3]) / 100;
    const a  = hsl[4] !== undefined ? parseFloat(hsl[4]) : 1;
    if (sv === 0) {
      const val = Math.round(l * 255);
      return { r: val, g: val, b: val, a };
    }
    const q = l < 0.5 ? l * (1 + sv) : l + sv - l * sv;
    const p = 2 * l - q;
    const hue2rgb = t => {
      const tn = ((t % 1) + 1) % 1;
      if (tn < 1/6) return p + (q - p) * 6 * tn;
      if (tn < 1/2) return q;
      if (tn < 2/3) return p + (q - p) * (2/3 - tn) * 6;
      return p;
    };
    return {
      r: hue2rgb(h + 1/3) * 255,
      g: hue2rgb(h)       * 255,
      b: hue2rgb(h - 1/3) * 255,
      a,
    };
  }

  return null;
}

// { r, g, b, a } → "rgba(r, g, b, a)" SVG-compatible string
function colorToRgba({ r, g, b, a }) {
  const c = v => Math.round(Math.max(0, Math.min(255, v)));
  const alpha = Math.max(0, Math.min(1, a));
  if (alpha === 1) return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
  return `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${parseFloat(alpha.toFixed(4))})`;
}

// Lerp two CSS color strings → rgba string
function lerpColor(c1, c2, t) {
  const a = parseColor(c1) ?? { r: 0, g: 0, b: 0, a: 0 };
  const b = parseColor(c2) ?? { r: 0, g: 0, b: 0, a: 0 };
  return colorToRgba({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  });
}

function isValidColor(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Returns { gradientStops, accent } from config.theme.
 *
 * gradientStops: 3 stops — start, lerped mid at 40%, end
 * accent: direct from config (used for typing text, cursor, stats values)
 */
function resolveTheme(theme) {
  const raw = theme?.gradient;
  const [start, end] = (Array.isArray(raw) && raw.length === 2 && raw.every(isValidColor))
    ? raw
    : DEFAULT_GRADIENT;

  const accent = isValidColor(theme?.accent) ? theme.accent : DEFAULT_ACCENT;
  const mid    = lerpColor(start, end, 0.35);

  return {
    gradientStops: [
      { offset: '0%',   color: start },
      { offset: '40%',  color: mid   },
      { offset: '100%', color: end   },
    ],
    accent,
    gradientEnd: end,
  };
}

function loadTheme() {
  try {
    const config = JSON.parse(readFileSync(join(__dirname, '..', 'config.json'), 'utf8'));
    return config.theme ?? {};
  } catch {
    return {};
  }
}

module.exports = { resolveTheme, loadTheme };
