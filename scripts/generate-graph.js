// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2025 BerkaySevinc — MIT License

const { writeFileSync, mkdirSync, readFileSync } = require('fs');
const { join, dirname } = require('path');

function loadConfig() {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', 'config.json'), 'utf8'));
  } catch { return {}; }
}

// GitHub's own quartile bucketing for each day — same levels shown on
// the real github.com contribution graph, so ours always matches it
// exactly instead of approximating it with our own quartile math.
const CONTRIBUTION_LEVEL = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

async function fetchCalendar(owner, token) {
  const headers = { 'User-Agent': 'github-profile-generator', 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          weeks {
            contributionDays { contributionLevel date }
          }
        }
      }
    }
  }`;

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST', headers,
    body: JSON.stringify({ query, variables: { login: owner } }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${res.statusText}`);

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);

  // GitHub doesn't pad the first/last week to 7 days — the calendar
  // starts mid-week and stops at today, so those weeks' contributionDays
  // arrays are shorter. Placing by array index would misalign every row
  // after a short week. Instead, align each day to its actual day-of-week
  // (from its date) into a fixed 7-row array, leaving the rest `null` —
  // "no real day here" rather than "a real day with zero contributions".
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .map(week => {
      const row = Array(7).fill(null);
      for (const day of week.contributionDays) {
        const dayOfWeek = new Date(`${day.date}T00:00:00Z`).getUTCDay();
        row[dayOfWeek] = CONTRIBUTION_LEVEL[day.contributionLevel] ?? 0;
      }
      return row;
    });
}

const CELL = 10, GAP = 2.5, MARGIN = 6;
const STEP = CELL + GAP;
// Matches the outside padding used by the snake grid (contribution-snake.svg)
// so both SVGs share the same cell scale when placed side by side at width=100%.
const PAD_TOP = 1, PAD_BOTTOM = 1, PAD_LEFT = 1, PAD_RIGHT = 1;
// Level 0 (no contributions) matches GitHub's own light/dark empty-cell
// color; levels 1-4 keep the fixed green scale, unchanged either theme.
const LEVEL0_LIGHT = '#ebedf0';
const LEVEL0_DARK   = '#161b22';
const LEVEL_FILL = [null, '#0f5b2c', '#12923f', '#22c95a', '#5dffa0'];
const LEVEL_GLOW = [false, false, false, true, true];

function buildSvg(grid, effects) {
  const WEEKS = grid.length;
  const DAYS = 7;
  const W = MARGIN * 2 + (WEEKS + PAD_LEFT + PAD_RIGHT) * STEP - GAP;
  const H = MARGIN * 2 + (DAYS + PAD_TOP + PAD_BOTTOM) * STEP - GAP;

  const cx = c => MARGIN + PAD_LEFT * STEP + c * STEP + CELL / 2;
  const cy = r => MARGIN + PAD_TOP * STEP + r * STEP + CELL / 2;

  let defs = `<filter id="cell-glow" x="-150%" y="-150%" width="400%" height="400%">
    <feGaussianBlur stdDeviation="0.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;
  let style = `
    @media (prefers-color-scheme: light) { .lvl0 { fill: ${LEVEL0_LIGHT}; } }
    @media (prefers-color-scheme: dark)  { .lvl0 { fill: ${LEVEL0_DARK}; } }`;
  let cells = '';
  let rainLayer = '';
  let digitsLayer = '';

  // ---- cells (static, or animating in via Tetris Drop-in) ----
  const tetrisDur = 6.5;
  if (effects.tetrisDropIn) {
    style += `@keyframes tet-drop{
      0%{transform:translateY(-${MARGIN + 20}px);opacity:0;}
      6%{opacity:1;}9%{transform:translateY(0);}10.5%{transform:translateY(-2px);}12%{transform:translateY(0);}
      70%{transform:translateY(0);opacity:1;}100%{transform:translateY(0);opacity:1;}}`;
  }
  for (let c = 0; c < WEEKS; c++) {
    for (let r = 0; r < DAYS; r++) {
      const level = grid[c][r];
      if (level === null) continue; // no real calendar day at this slot
      const x = cx(c) - CELL / 2, y = cy(r) - CELL / 2;
      const glow = LEVEL_GLOW[level] ? ' filter="url(#cell-glow)"' : '';
      const fillAttr = level === 0 ? ' class="lvl0"' : ` fill="${LEVEL_FILL[level]}"`;
      if (effects.tetrisDropIn) {
        const delayFrac = (c / WEEKS) * 0.55 + (r / DAYS) * 0.1;
        cells += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${CELL}" height="${CELL}" rx="2.4"${fillAttr}${glow} style="transform-box:fill-box;animation:tet-drop ${tetrisDur}s cubic-bezier(.2,.9,.3,1.2) infinite;animation-delay:${(-delayFrac * tetrisDur).toFixed(3)}s;"/>`;
      } else {
        cells += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${CELL}" height="${CELL}" rx="2.4"${fillAttr}${glow}/>`;
      }
    }
  }

  // ---- Matrix Rain overlay ----
  if (effects.matrixRain) {
    let beams = '';
    // One slot per week/column, so every column has an equal shot at rain
    // over time — each slot keeps its own column forever, but with this
    // many of them (each on a different, independently-drifting cycle
    // length) the set of columns visible together keeps recombining,
    // instead of a small fixed set of pillars repeating. Density is kept
    // the same via DUTY_CYCLE regardless of how many weeks there are.
    const count = WEEKS;
    const TARGET_VISIBLE = 9;
    const DUTY_CYCLE = TARGET_VISIBLE / count;
    // Plain per-beam Math.random() can clump by pure chance — several
    // columns close together, several start phases near-aligned. Instead,
    // stratify: split the width into `count` equal slots and the cycle
    // into `count` equal phase slots, one beam per slot with a small
    // random jitter inside it — guarantees even spread across both space
    // and time. Column slots are also shuffled (not paired 1:1 with the
    // same index as their phase slot), so there's no residual grid-like
    // correlation between "when" and "where" a beam falls.
    const colSlots = Array.from({ length: count }, (_, k) => k);
    for (let k = colSlots.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [colSlots[k], colSlots[j]] = [colSlots[j], colSlots[k]];
    }
    for (let i = 0; i < count; i++) {
      const col = Math.min(WEEKS - 1, Math.floor((colSlots[i] + Math.random()) * WEEKS / count));
      const x = cx(col);
      // Shorter beams read as distinct falling drops instead of a solid
      // bar spanning most of the grid's height.
      const beamH = H * (0.2 + Math.random() * 0.25);
      const fallDur = 2.6 + Math.random() * 2.4;
      const totalDur = (fallDur / DUTY_CYCLE).toFixed(2);
      const phase = (i + Math.random()) / count; // 0..1, evenly stratified
      const delay = (-phase * totalDur).toFixed(2);
      const id = `rain-${i}`;
      beams += `<rect id="${id}" class="rain-beam" x="${(x - 1.1).toFixed(1)}" y="${(-beamH).toFixed(1)}" width="2.2" height="${beamH.toFixed(1)}"/>`;
      style += `#${id}{animation:rain-fall ${totalDur}s linear infinite;animation-delay:${delay}s;}`;
    }
    const fallPct = (DUTY_CYCLE * 100).toFixed(1);
    style += `@keyframes rain-fall{0%{transform:translateY(0);}${fallPct}%{transform:translateY(${(H + 40).toFixed(1)}px);}100%{transform:translateY(${(H + 40).toFixed(1)}px);}}`;
    // Two gradients, swapped by theme via CSS: white + screen reads as a
    // glowing streak on a dark page, but screen blend on white does
    // nothing visible — so light mode gets a dark "ink" streak + multiply
    // instead, which reads the same way against a light background.
    defs += `<linearGradient id="rain-grad-dark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#eafff0" stop-opacity="0"/>
      <stop offset="78%" stop-color="#eafff0" stop-opacity="0.05"/>
      <stop offset="96%" stop-color="#eafff0" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#c8ffe0" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="rain-grad-light" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1f2328" stop-opacity="0"/>
      <stop offset="78%" stop-color="#1f2328" stop-opacity="0.08"/>
      <stop offset="96%" stop-color="#1f2328" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#1f2328" stop-opacity="1"/>
    </linearGradient>`;
    style += `
      .rain-layer { mix-blend-mode: screen; }
      .rain-beam { fill: url(#rain-grad-dark); }
      @media (prefers-color-scheme: light) {
        .rain-layer { mix-blend-mode: multiply; }
        .rain-beam { fill: url(#rain-grad-light); }
      }`;
    // Fades beams out within the top/bottom padding band (before they reach
    // the actual cell rows), instead of hard-clipping at the viewBox edge.
    const topBorder = MARGIN + PAD_TOP * STEP;
    const bottomBorder = MARGIN + PAD_BOTTOM * STEP;
    const topPct = (topBorder / H * 100).toFixed(1);
    const bottomPct = (100 - bottomBorder / H * 100).toFixed(1);
    defs += `<linearGradient id="rain-fade-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="white" stop-opacity="0"/>
      <stop offset="${topPct}%" stop-color="white" stop-opacity="1"/>
      <stop offset="${bottomPct}%" stop-color="white" stop-opacity="1"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <mask id="rain-fade-mask">
      <rect width="${W}" height="${H}" fill="url(#rain-fade-grad)"/>
    </mask>`;
    rainLayer = `<g mask="url(#rain-fade-mask)"><g class="rain-layer">${beams}</g></g>`;
  }

  // ---- Digit Flicker overlay ----
  if (effects.digitFlicker) {
    const loopDur = 9;
    style += `@keyframes dg-flicker{0%{opacity:0;}2%{opacity:1;}4%{opacity:1;}9%{opacity:0;}100%{opacity:0;}}`;
    let glyphs = '';
    let i = 0;
    for (let c = 0; c < WEEKS; c++) {
      for (let r = 0; r < DAYS; r++) {
        const level = grid[c][r];
        if (!level || Math.random() < 0.55) { i++; continue; } // null (no day) or 0 (no contributions)
        const x = cx(c), y = cy(r);
        const delay = -((i % 40) / 40) * loopDur - Math.random() * 0.6;
        glyphs += `<text x="${x.toFixed(1)}" y="${(y + 2.6).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,'IBM Plex Mono',monospace" font-size="7.5" fill="#eafff0" style="animation:dg-flicker ${loopDur}s linear infinite;animation-delay:${delay.toFixed(3)}s;">${level}</text>`;
        i++;
      }
    }
    digitsLayer = `<g style="mix-blend-mode:screen">${glyphs}</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%">
  <defs>
    ${defs}
    <style>${style}</style>
  </defs>
  ${cells}
  ${rainLayer}
  ${digitsLayer}
</svg>`;
}

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  if (!owner) {
    console.error('Error: GITHUB_REPOSITORY_OWNER environment variable is not set.');
    process.exit(1);
  }

  const config = loadConfig();
  const effects = {
    matrixRain: config.contributionGraph?.effects?.matrixRain === true,
    tetrisDropIn: config.contributionGraph?.effects?.tetrisDropIn === true,
    digitFlicker: config.contributionGraph?.effects?.digitFlicker === true,
  };

  const grid = await fetchCalendar(owner, process.env.GITHUB_TOKEN);

  const outPath = join(__dirname, '..', 'assets', 'contribution-graph.svg');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buildSvg(grid, effects), 'utf8');

  const active = Object.entries(effects).filter(([, on]) => on).map(([name]) => name);
  console.log(`Generated assets/contribution-graph.svg — ${grid.length} weeks, effects: ${active.length ? active.join(', ') : 'none'}`);
}

main();
