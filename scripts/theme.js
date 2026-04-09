// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2025 BerkaySevinc — MIT License

const { readFileSync } = require('fs');
const { join } = require('path');

const DEFAULT_GRADIENT = ['#0d1117', '#4c1d95'];
const DEFAULT_ACCENT   = '#a78bfa';

// GitHub page background colors — update if GitHub changes their theme
const GITHUB_BG_DARK  = '#0d1117';
const GITHUB_BG_LIGHT = '#ffffff';

// Named CSS colors → { r, g, b, a }
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
function parseColor(v) {
  if (!v || typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();

  if (NAMED_COLORS[s]) return { ...NAMED_COLORS[s] };

  if (/^#[0-9a-f]{6}$/.test(s))
    return { r: parseInt(s.slice(1,3),16), g: parseInt(s.slice(3,5),16), b: parseInt(s.slice(5,7),16), a: 1 };

  if (/^#[0-9a-f]{8}$/.test(s))
    return { r: parseInt(s.slice(1,3),16), g: parseInt(s.slice(3,5),16), b: parseInt(s.slice(5,7),16), a: parseInt(s.slice(7,9),16)/255 };

  if (/^#[0-9a-f]{3}$/.test(s))
    return { r: parseInt(s[1]+s[1],16), g: parseInt(s[2]+s[2],16), b: parseInt(s[3]+s[3],16), a: 1 };

  const rgb = s.match(/^rgba?\s*\(\s*([\d.%]+)\s*,\s*([\d.%]+)\s*,\s*([\d.%]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (rgb) {
    const ch = v => v.endsWith('%') ? parseFloat(v)/100*255 : parseFloat(v);
    return { r: ch(rgb[1]), g: ch(rgb[2]), b: ch(rgb[3]), a: rgb[4] !== undefined ? parseFloat(rgb[4]) : 1 };
  }

  const hsl = s.match(/^hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (hsl) {
    const h = parseFloat(hsl[1])/360, sv = parseFloat(hsl[2])/100, l = parseFloat(hsl[3])/100;
    const a = hsl[4] !== undefined ? parseFloat(hsl[4]) : 1;
    if (sv === 0) { const val = Math.round(l*255); return { r: val, g: val, b: val, a }; }
    const q = l < 0.5 ? l*(1+sv) : l+sv-l*sv, p = 2*l-q;
    const hue2rgb = t => { const tn = ((t%1)+1)%1; if (tn<1/6) return p+(q-p)*6*tn; if (tn<1/2) return q; if (tn<2/3) return p+(q-p)*(2/3-tn)*6; return p; };
    return { r: hue2rgb(h+1/3)*255, g: hue2rgb(h)*255, b: hue2rgb(h-1/3)*255, a };
  }

  return null;
}

function colorToRgba({ r, g, b, a }) {
  const c = v => Math.round(Math.max(0, Math.min(255, v)));
  const alpha = Math.max(0, Math.min(1, a));
  if (alpha === 1) return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
  return `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${parseFloat(alpha.toFixed(4))})`;
}

function lerpParsed(a, b, t) {
  return { r: a.r+(b.r-a.r)*t, g: a.g+(b.g-a.g)*t, b: a.b+(b.b-a.b)*t, a: a.a+(b.a-a.a)*t };
}

function isAdaptive(parsed) {
  return parsed && parsed.a === 0;
}

function isValidColor(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Returns { gradientStops, accent, gradientEnd }.
 *
 * Each stop is either:
 *   { offset, color }                         — normal, single color
 *   { offset, dark, light, adaptive: true }   — adaptive bg color (prefers-color-scheme)
 *
 * When a gradient end is transparent/none/alpha=0, it is replaced with
 * the GitHub background color for dark/light mode respectively,
 * so the gradient blends seamlessly with the page background.
 */
function resolveTheme(theme) {
  const raw = theme?.gradient;
  const [start, end] = (Array.isArray(raw) && raw.length === 2 && raw.every(isValidColor))
    ? raw : DEFAULT_GRADIENT;

  const accent = isValidColor(theme?.accent) ? theme.accent : DEFAULT_ACCENT;

  const startP = parseColor(start) ?? { r: 0, g: 0, b: 0, a: 0 };
  const endP   = parseColor(end)   ?? { r: 0, g: 0, b: 0, a: 0 };

  const startAdaptive = isAdaptive(startP);
  const endAdaptive   = isAdaptive(endP);

  // Compute mid for dark and light variants separately
  const startDark  = startAdaptive ? parseColor(GITHUB_BG_DARK)  : startP;
  const startLight = startAdaptive ? parseColor(GITHUB_BG_LIGHT) : startP;
  const endDark    = endAdaptive   ? parseColor(GITHUB_BG_DARK)  : endP;
  const endLight   = endAdaptive   ? parseColor(GITHUB_BG_LIGHT) : endP;

  const midDark  = lerpParsed(startDark,  endDark,  0.35);
  const midLight = lerpParsed(startLight, endLight, 0.35);

  const midAdaptive = startAdaptive || endAdaptive;

  const gradientStops = [
    startAdaptive
      ? { offset: '0%',  adaptive: true, dark: GITHUB_BG_DARK,          light: GITHUB_BG_LIGHT }
      : { offset: '0%',  color: start },
    midAdaptive
      ? { offset: '40%', adaptive: true, dark: colorToRgba(midDark),     light: colorToRgba(midLight) }
      : { offset: '40%', color: colorToRgba(lerpParsed(startP, endP, 0.35)) },
    endAdaptive
      ? { offset: '100%', adaptive: true, dark: GITHUB_BG_DARK,          light: GITHUB_BG_LIGHT }
      : { offset: '100%', color: end },
  ];

  return { gradientStops, accent, gradientEnd: end };
}

/**
 * Converts gradientStops to SVG <stop> elements + optional CSS for adaptive stops.
 * Returns { stopsHtml, css } — embed css inside <style>, stopsHtml inside <linearGradient>.
 */
function buildGradientSvg(gradientStops, gradientId) {
  let css = '';
  let stopsHtml = '';

  gradientStops.forEach((stop, i) => {
    if (stop.adaptive) {
      const cls = `gs-${gradientId}-${i}`;
      css += `\n    @media (prefers-color-scheme: dark)  { .${cls} { stop-color: ${stop.dark}; } }`;
      css += `\n    @media (prefers-color-scheme: light) { .${cls} { stop-color: ${stop.light}; } }`;
      stopsHtml += `      <stop class="${cls}" offset="${stop.offset}"/>\n`;
    } else {
      stopsHtml += `      <stop offset="${stop.offset}" stop-color="${stop.color}"/>\n`;
    }
  });

  return { stopsHtml, css };
}

function loadTheme() {
  try {
    const config = JSON.parse(readFileSync(join(__dirname, '..', 'config.json'), 'utf8'));
    return config.theme ?? {};
  } catch {
    return {};
  }
}

module.exports = { resolveTheme, loadTheme, buildGradientSvg };
