// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2026 BerkaySevinc — MIT License

const { writeFileSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');
const { loadConfig } = require('./lib/config');

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

// ---- geometry (matches contribution-graph.svg) ----
const CELL = 10, GAP = 2.5, MARGIN = 6;
const STEP = CELL + GAP;
const DAYS = 7;
const PAD_TOP = 1, PAD_BOTTOM = 1, PAD_LEFT = 1, PAD_RIGHT = 1;
const LEVEL0_LIGHT = '#ebedf0', LEVEL0_DARK = '#161b22';
const LEVEL_FILL = [null, '#0f5b2c', '#12923f', '#22c95a', '#5dffa0'];

let START_LEN = 4;
let BODY_LIMIT = 20;
const STEPS_PER_SEC = 6;

// Length follows a sqrt curve toward BODY_LIMIT, capped at +1 per eaten cell
// so growth never jumps by more than one unit at a time.
const _lenTableCache = new Map();
function getLenTable(total) {
  if (_lenTableCache.has(total)) return _lenTableCache.get(total);
  const table = new Array(total + 1);
  table[0] = START_LEN;
  if (total <= BODY_LIMIT - START_LEN) {
    for (let e = 1; e <= total; e++) table[e] = START_LEN + e;
  } else {
    for (let e = 1; e <= total; e++) {
      const ideal = START_LEN + (BODY_LIMIT - START_LEN) * Math.sqrt(e / total);
      table[e] = Math.min(table[e - 1] + 1, Math.round(ideal));
    }
  }
  _lenTableCache.set(total, table);
  return table;
}
function bodyLenAt(eaten, total) {
  if (total <= 0) return START_LEN;
  const table = getLenTable(total);
  return table[Math.max(0, Math.min(total, Math.round(eaten)))];
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const l = v => Math.round(v + (255 - v) * amt);
  return '#' + [l(r), l(g), l(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function darken(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const d = v => Math.round(v * (1 - amt));
  return '#' + [d(r), d(g), d(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function lerpColor(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const l = (av, bv) => Math.round(av + (bv - av) * t);
  const r = l((a >> 16) & 255, (b >> 16) & 255);
  const g = l((a >> 8) & 255, (b >> 8) & 255);
  const bl = l(a & 255, b & 255);
  return `rgb(${r},${g},${bl})`;
}

// Pure data solver — no DOM, runs at build time.
function solveSnake(grid) {
  const WEEKS = grid.length;
  const DAYS_TOTAL = DAYS + PAD_TOP + PAD_BOTTOM;
  const WEEKS_TOTAL = WEEKS + PAD_LEFT + PAD_RIGHT;

  const state = [];
  for (let x = 0; x < WEEKS_TOTAL; x++) {
    const col = [];
    const inCol = x >= PAD_LEFT && x < PAD_LEFT + WEEKS;
    for (let y = 0; y < DAYS_TOTAL; y++) {
      const inRow = y >= PAD_TOP && y < PAD_TOP + DAYS;
      if (!inCol || !inRow) { col.push({ level: 0, eaten: false }); continue; }
      col.push({ level: grid[x - PAD_LEFT][y - PAD_TOP], eaten: false });
    }
    state.push(col);
  }

  const trail = [];
  const growAt = [];
  let totalEatable = 0;
  for (let c = 0; c < WEEKS; c++) for (let r = 0; r < DAYS; r++) if (grid[c][r] > 0) totalEatable++;

  const spawnPoint = { x: Math.min(10, WEEKS_TOTAL - 1), y: 0 };
  const cornerPoint = { x: 0, y: 0 };

  let head = spawnPoint;
  let eatenCount = 0;
  trail.push(head); growAt.push(false);

  function bodyAgeMap(ctx) {
    const len = Math.max(1, Math.round(bodyLenAt(ctx.eatenCount, totalEatable)));
    const map = new Map();
    for (let i = ctx.trail.length - 1, n = 0; i >= 0 && n < len; i--, n++) {
      const key = ctx.trail[i].x + ',' + ctx.trail[i].y;
      if (!map.has(key)) map.set(key, n);
    }
    return { map, len };
  }

  // Full Dijkstra from the head, blocked by walls (other uneaten levels) —
  // never crosses one, but will step on the snake's own body as a last
  // resort. dist is BIG-dominant (prefers a body-free route to a given
  // cell when one exists, however much longer) — internal routing only.
  // hopsOf holds the REAL number of steps the resulting route actually
  // takes, used for cross-cell distance comparisons below, so a cell that
  // only needed one quick step across the body isn't reported as if it
  // were hundreds of steps away.
  function reachability(ctx, targetLevel) {
    const { map: bodyAge, len: bodyLen } = bodyAgeMap(ctx);
    // Just needs to exceed the longest possible real path (a simple path can
    // never revisit a cell, so it can't exceed the grid's own cell count) —
    // that alone guarantees a body-free route always outweighs a shorter one
    // that touches the body, no matter how much longer the detour is.
    const BIG = WEEKS_TOTAL * DAYS_TOTAL + 1;
    const startKey = ctx.head.x + ',' + ctx.head.y;
    const dist = new Map([[startKey, 0]]);
    const hopsOf = new Map([[startKey, 0]]);
    const bodyHitsOf = new Map([[startKey, 0]]);
    const prev = new Map();
    const coordOf = new Map([[startKey, { x: ctx.head.x, y: ctx.head.y }]]);
    const finalized = new Set();
    const pq = [{ key: startKey, x: ctx.head.x, y: ctx.head.y, d: 0, hops: 0, bodyHits: 0 }];
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    while (pq.length) {
      let bi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i].d < pq[bi].d) bi = i;
      const cur = pq.splice(bi, 1)[0];
      if (finalized.has(cur.key)) continue;
      finalized.add(cur.key);

      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || nx >= WEEKS_TOTAL || ny < 0 || ny >= DAYS_TOTAL) continue;
        const key = nx + ',' + ny;
        if (finalized.has(key)) continue;
        const ncell = ctx.state[nx][ny];
        const isTarget = ncell.level === targetLevel && !ncell.eaten;
        const isWall = !(ncell.level === 0 || ncell.level === null || ncell.eaten || isTarget);
        if (isWall) continue;
        const nhops = cur.hops + 1;
        const age = bodyAge.get(key);
        const stillOccupied = age !== undefined && nhops < bodyLen - age;
        const bodyCost = stillOccupied ? 1 : 0;
        const nBodyHits = cur.bodyHits + bodyCost;
        const nd = cur.d + bodyCost * BIG + 1;
        if (!dist.has(key) || nd < dist.get(key)) {
          dist.set(key, nd);
          hopsOf.set(key, nhops);
          bodyHitsOf.set(key, nBodyHits);
          prev.set(key, cur.key);
          coordOf.set(key, { x: nx, y: ny });
          pq.push({ key, x: nx, y: ny, d: nd, hops: nhops, bodyHits: nBodyHits });
        }
      }
    }
    return { dist, hopsOf, bodyHitsOf, prev, coordOf };
  }

  // Full Dijkstra from the head, allowed to cross walls (tunnel) — but
  // minimizing wall crossings first, hop count only as a tie-break among
  // routes tied on wall count. hopsOf holds the REAL number of steps that
  // route actually takes, used for cross-cell distance comparisons below —
  // not an estimate, the true walked length, so a cell chosen as "nearest"
  // is never secretly farther once the wall-minimal route to it turns out
  // longer than its hop-only distance would have suggested.
  function reachabilityMinWalls(ctx, targetLevel) {
    const { map: bodyAge, len: bodyLen } = bodyAgeMap(ctx);
    // Exact integer lexicographic ordering, three tiers: wall count first,
    // own-body crossings second, hop count third. Each tier's multiplier is
    // sized so it can never be overtaken by any possible combination of the
    // tiers below it — MAX_HOPS bounds any single tier's raw count (hops,
    // walls, or body-hits can't exceed the grid's cell count), so a lower
    // tier's worst case (MAX_HOPS-1) times its own multiplier still can't
    // reach one unit of the tier above.
    const MAX_HOPS = WEEKS_TOTAL * DAYS_TOTAL + 1;
    const BIG = MAX_HOPS * MAX_HOPS;
    const startKey = ctx.head.x + ',' + ctx.head.y;
    const dist = new Map([[startKey, 0]]);
    const hopsOf = new Map([[startKey, 0]]);
    const wallsOf = new Map([[startKey, 0]]);
    const bodyHitsOf = new Map([[startKey, 0]]);
    const prev = new Map();
    const coordOf = new Map([[startKey, { x: ctx.head.x, y: ctx.head.y }]]);
    const finalized = new Set();
    const pq = [{ key: startKey, x: ctx.head.x, y: ctx.head.y, d: 0, hops: 0, walls: 0, bodyHits: 0 }];
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    while (pq.length) {
      let bi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i].d < pq[bi].d) bi = i;
      const cur = pq.splice(bi, 1)[0];
      if (finalized.has(cur.key)) continue;
      finalized.add(cur.key);

      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || nx >= WEEKS_TOTAL || ny < 0 || ny >= DAYS_TOTAL) continue;
        const key = nx + ',' + ny;
        if (finalized.has(key)) continue;
        const ncell = ctx.state[nx][ny];
        const isTarget = ncell.level === targetLevel && !ncell.eaten;
        const isWall = !(ncell.level === 0 || ncell.level === null || ncell.eaten || isTarget);
        const nhops = cur.hops + 1;
        const nwalls = cur.walls + (isWall ? 1 : 0);
        const age = bodyAge.get(key);
        const stillOccupied = age !== undefined && nhops < bodyLen - age;
        const nBodyHits = cur.bodyHits + (stillOccupied ? 1 : 0);
        const nd = nwalls * BIG + nBodyHits * MAX_HOPS + nhops;
        if (!dist.has(key) || nd < dist.get(key)) {
          dist.set(key, nd);
          hopsOf.set(key, nhops);
          wallsOf.set(key, nwalls);
          bodyHitsOf.set(key, nBodyHits);
          prev.set(key, cur.key);
          coordOf.set(key, { x: nx, y: ny });
          pq.push({ key, x: nx, y: ny, d: nd, hops: nhops, walls: nwalls, bodyHits: nBodyHits });
        }
      }
    }
    return { hopsOf, wallsOf, bodyHitsOf, prev, coordOf };
  }

  // Deterministic stand-in for randomness: same grid, same eaten-so-far
  // state, and same cell always hash to the same value, so a rerun on
  // identical input reproduces the identical snake — but the value isn't
  // biased toward any particular direction the way grid-scan order is.
  function hashTieBreak(ctx, x, y) {
    let h = (x * 374761393 + y * 668265263 + ctx.head.x * 2246822519 + ctx.head.y * 3266489917 + ctx.eatenCount * 2654435761) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return h >>> 0;
  }

  // Finds every uneaten target-level cell tied for best under the fixed
  // hierarchy: fewest real walked hops, then fewest walls crossed, then
  // fewest self-crossings. A tunnel route to a given cell never loses to a
  // real (non-tunnel) route to that SAME cell, no matter how much shorter
  // tunneling would be — but across DIFFERENT cells, only real walked
  // distance (then walls, then self-crossings) decides.
  function collectBestCandidates(ctx, targetLevel) {
    const startKey = ctx.head.x + ',' + ctx.head.y;
    const open = reachability(ctx, targetLevel);
    const tunneled = reachabilityMinWalls(ctx, targetLevel);

    let bestCost = Infinity, bestWalls = Infinity, bestBodyHits = Infinity;
    let candidates = [];
    for (let x = 0; x < WEEKS_TOTAL; x++) {
      for (let y = 0; y < DAYS_TOTAL; y++) {
        const cell = ctx.state[x][y];
        if (cell.level !== targetLevel || cell.eaten) continue;
        const key = x + ',' + y;
        if (key === startKey) continue;
        const search = open.dist.has(key) ? open : (tunneled.hopsOf.has(key) ? tunneled : null);
        if (!search) continue;
        const cand = {
          key, search, x, y,
          cost: search.hopsOf.get(key),
          walls: search === tunneled ? tunneled.wallsOf.get(key) : 0,
          bodyHits: search.bodyHitsOf.get(key),
        };
        if (
          cand.cost < bestCost ||
          (cand.cost === bestCost && cand.walls < bestWalls) ||
          (cand.cost === bestCost && cand.walls === bestWalls && cand.bodyHits < bestBodyHits)
        ) {
          bestCost = cand.cost; bestWalls = cand.walls; bestBodyHits = cand.bodyHits;
          candidates = [cand];
        } else if (cand.cost === bestCost && cand.walls === bestWalls && cand.bodyHits === bestBodyHits) {
          candidates.push(cand);
        }
      }
    }
    return candidates;
  }

  function buildPathTo(ctx, cand) {
    const startKey = ctx.head.x + ',' + ctx.head.y;
    const path = [];
    let k = cand.key;
    while (k !== startKey) { path.push(cand.search.coordOf.get(k)); k = cand.search.prev.get(k); }
    path.reverse();
    return path;
  }

  function cloneCtx(ctx) {
    return {
      state: ctx.state.map(col => col.map(cell => ({ level: cell.level, eaten: cell.eaten }))),
      trail: ctx.trail.slice(),
      head: { x: ctx.head.x, y: ctx.head.y },
      eatenCount: ctx.eatenCount,
    };
  }

  // Walks ctx along path, eating any target-level cell it lands on, and
  // reports whether the path crossed the snake's own current body (judged
  // against how much of the body will still be there when each step
  // actually arrives).
  function applyPath(ctx, path, targetLevel, remainingRef, growAtOut) {
    const { map: bodyBefore, len: bodyLen } = bodyAgeMap(ctx);
    const crossed = path.some((p, idx) => {
      const age = bodyBefore.get(p.x + ',' + p.y);
      return age !== undefined && (idx + 1) < bodyLen - age;
    });
    for (const step of path) {
      ctx.head = step;
      ctx.trail.push(step);
      const cell = ctx.state[step.x][step.y];
      if (cell.level === targetLevel && !cell.eaten) {
        cell.eaten = true;
        ctx.eatenCount++;
        remainingRef.value--;
        if (growAtOut) growAtOut.push(true);
      } else if (growAtOut) {
        growAtOut.push(false);
      }
    }
    return crossed ? 1 : 0;
  }

  // Resolves a tie without branching — used for every decision inside a
  // simulated branch, so the lookahead below stays exactly one level deep
  // instead of recursing into every nested tie it finds.
  function pickBestFast(ctx, targetLevel) {
    const candidates = collectBestCandidates(ctx, targetLevel);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    let best = candidates[0], bestHash = hashTieBreak(ctx, best.x, best.y);
    for (let i = 1; i < candidates.length; i++) {
      const h = hashTieBreak(ctx, candidates[i].x, candidates[i].y);
      if (h < bestHash) { bestHash = h; best = candidates[i]; }
    }
    return best;
  }

  // Runs ctx forward via the fast (non-branching) pick — this level, then
  // every level after it — until a step crosses the snake's own body, or
  // every remaining level is fully eaten. Stops at the FIRST crossing
  // instead of running to completion and counting every one, so each
  // simulated branch below is usually far cheaper. Returns the number of
  // real hops walked before that first crossing, or Infinity if none was
  // ever hit.
  function runUntilFirstCross(ctx, fromLevel, remaining) {
    let steps = 0;
    let level = fromLevel;
    let remainingRef = { value: remaining };
    while (level <= 4) {
      while (remainingRef.value > 0) {
        const cand = pickBestFast(ctx, level);
        if (!cand) break;
        const path = buildPathTo(ctx, cand);
        const crossed = applyPath(ctx, path, level, remainingRef, null);
        steps += path.length;
        if (crossed) return steps;
      }
      level++;
      if (level > 4) break;
      remainingRef = { value: 0 };
      for (let x = 0; x < WEEKS_TOTAL; x++) for (let y = 0; y < DAYS_TOTAL; y++) {
        if (ctx.state[x][y].level === level && !ctx.state[x][y].eaten) remainingRef.value++;
      }
    }
    return Infinity;
  }

  // Picks the next cell to eat. When several tie for best, simulates each
  // tied option (on a cloned, throwaway copy of the state) forward — this
  // level, then every level after it — and keeps whichever stays
  // self-crossing-free the longest (or never crosses at all) — capped to
  // one level of real branching; ties found inside a simulated branch
  // resolve via the fast, non-branching pick above so cost stays bounded
  // instead of exploding combinatorially. Simulating only to the end of
  // THIS level isn't enough: a tie among the last cells of a level doesn't
  // change how many of them get eaten (all tied cells get eaten either
  // way), only the order — but that order decides where the head ends up
  // when the level finishes, which is exactly what determines the next
  // level's starting point and its crossings. Doesn't reach past the last
  // level into the exit/return legs (pathToPoint), which sit outside this
  // ctx/candidate system.
  function pickBestWithLookahead(ctx, targetLevel, remaining) {
    const candidates = collectBestCandidates(ctx, targetLevel);
    if (candidates.length <= 1) return candidates[0] || null;

    let bestCand = null, bestSafeSteps = -Infinity, bestHash = Infinity;
    for (const cand of candidates) {
      const simCtx = cloneCtx(ctx);
      const path = buildPathTo(simCtx, cand);
      const remainingRef = { value: remaining };
      const crossedFirst = applyPath(simCtx, path, targetLevel, remainingRef, null);
      const safeSteps = crossedFirst
        ? path.length
        : path.length + runUntilFirstCross(simCtx, targetLevel, remainingRef.value);
      const hash = hashTieBreak(ctx, cand.x, cand.y);
      if (safeSteps > bestSafeSteps || (safeSteps === bestSafeSteps && hash < bestHash)) {
        bestSafeSteps = safeSteps; bestCand = cand; bestHash = hash;
      }
    }
    return bestCand;
  }

  function pathToPoint(toX, toY, forbidTop, confineTop) {
    const { map: bodyAge, len: bodyLen } = bodyAgeMap({ trail, eatenCount });
    const BIG = 1e6;
    const startKey = head.x + ',' + head.y;
    const goalKey = toX + ',' + toY;
    const dist = new Map([[startKey, 0]]);
    const prev = new Map();
    const coordOf = new Map([[startKey, { x: head.x, y: head.y }]]);
    const finalized = new Set();
    const pq = [{ key: startKey, x: head.x, y: head.y, d: 0, hops: 0 }];
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    while (pq.length) {
      let bi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i].d < pq[bi].d) bi = i;
      const cur = pq.splice(bi, 1)[0];
      if (finalized.has(cur.key)) continue;
      finalized.add(cur.key);
      if (cur.key === goalKey) {
        const path = [];
        let k = cur.key;
        while (k !== startKey) { path.push(coordOf.get(k)); k = prev.get(k); }
        path.reverse();
        return path;
      }

      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || nx >= WEEKS_TOTAL || ny < 0 || ny >= DAYS_TOTAL) continue;
        if (forbidTop && ny === 0) continue;
        if (confineTop && ny !== 0) continue;
        const key = nx + ',' + ny;
        if (finalized.has(key)) continue;
        const ncell = state[nx][ny];
        const isWall = !(ncell.level === 0 || ncell.level === null || ncell.eaten);
        if (isWall) continue;
        const nhops = cur.hops + 1;
        const age = bodyAge.get(key);
        const stillOccupied = age !== undefined && nhops < bodyLen - age;
        const bodyCost = stillOccupied ? 1 : 0;
        const stepCost = bodyCost * BIG + 1;
        const nd = cur.d + stepCost;
        if (!dist.has(key) || nd < dist.get(key)) {
          dist.set(key, nd);
          prev.set(key, cur.key);
          coordOf.set(key, { x: nx, y: ny });
          pq.push({ key, x: nx, y: ny, d: nd, hops: nhops });
        }
      }
    }
    return null;
  }

  const entrancePath = pathToPoint(cornerPoint.x, cornerPoint.y);
  if (entrancePath) for (const step of entrancePath) { head = step; trail.push(head); growAt.push(false); }

  const ctx = { state, trail, head, eatenCount };
  for (let level = 1; level <= 4; level++) {
    let remaining = 0;
    for (let c = 0; c < WEEKS_TOTAL; c++) for (let y = 0; y < DAYS_TOTAL; y++) if (state[c][y].level === level) remaining++;

    while (remaining > 0) {
      const cand = pickBestWithLookahead(ctx, level, remaining);
      if (!cand) break;
      const path = buildPathTo(ctx, cand);
      const remainingRef = { value: remaining };
      applyPath(ctx, path, level, remainingRef, growAt);
      remaining = remainingRef.value;
    }
  }
  head = ctx.head;
  eatenCount = ctx.eatenCount;

  const preExitPoint = { x: WEEKS_TOTAL - 1, y: PAD_TOP };
  const exitCornerPoint = { x: WEEKS_TOTAL - 1, y: 0 };

  const legA = pathToPoint(preExitPoint.x, preExitPoint.y, true);
  if (legA) for (const step of legA) { head = step; trail.push(head); growAt.push(false); }

  const legB = pathToPoint(exitCornerPoint.x, exitCornerPoint.y);
  if (legB) for (const step of legB) { head = step; trail.push(head); growAt.push(false); }

  const legCStartIndex = trail.length - 1;
  const returnPath = pathToPoint(spawnPoint.x, spawnPoint.y, false, true);
  if (returnPath) for (const step of returnPath) { head = step; trail.push(head); growAt.push(false); }

  const legCEndIndex = trail.length - 1;
  const eatenCells = trail.filter((_, i) => growAt[i]);

  return { trail, growAt, legCStartIndex, legCEndIndex, eatenCells, totalEatable, WEEKS_TOTAL, DAYS_TOTAL, WEEKS };
}

// Bakes the trail into CSS keyframes — GitHub renders this as a static
// <img>, no JS at runtime.

// Collapse straight runs down to direction-change corners — CSS's linear
// interpolation reconstructs the run exactly, so every intermediate step
// would just bloat the file.
function collapseCollinear(trail) {
  const stops = [{ i: 0, x: trail[0].x, y: trail[0].y }];
  for (let i = 1; i < trail.length - 1; i++) {
    const prev = trail[i - 1], cur = trail[i], next = trail[i + 1];
    const d1x = cur.x - prev.x, d1y = cur.y - prev.y;
    const d2x = next.x - cur.x, d2y = next.y - cur.y;
    if (d1x !== d2x || d1y !== d2y) stops.push({ i, x: cur.x, y: cur.y });
  }
  stops.push({ i: trail.length - 1, x: trail[trail.length - 1].x, y: trail[trail.length - 1].y });
  return stops;
}

function buildSvg(grid, colors, speedMultiplier = 1) {
  const solved = solveSnake(grid);
  const { trail, growAt, legCStartIndex, legCEndIndex, eatenCells, WEEKS_TOTAL, DAYS_TOTAL, WEEKS } = solved;
  const lastIdx = trail.length - 1;
  const stepsPerSec = STEPS_PER_SEC * speedMultiplier;
  const totalDuration = trail.length / stepsPerSec;

  const cx = c => MARGIN + c * STEP + CELL / 2;
  const cy = r => MARGIN + r * STEP + CELL / 2;
  const W = MARGIN * 2 + WEEKS_TOTAL * STEP - GAP;
  const H = MARGIN * 2 + DAYS_TOTAL * STEP - GAP;

  const HEAD_COLOR = lighten(colors.base, 0.4);
  const BODY_COLOR = colors.base;
  const TAIL_COLOR = darken(colors.base, 0.6);

  let style = `:root{--lvl0:${LEVEL0_DARK};}@media (prefers-color-scheme: light){:root{--lvl0:${LEVEL0_LIGHT};}}`;

  // ---- grid cells: static level-0, per-cell hide/reveal keyframe for eaten ones ----
  const eatenIndexOf = new Map();
  for (let k = 0; k < trail.length; k++) if (growAt[k]) eatenIndexOf.set(trail[k].x + ',' + trail[k].y, k);

  const legCFinishSpan = Math.max(1, (legCEndIndex - legCStartIndex) - 1);

  // Reveal pop-in takes POP_DUR_SEC real seconds — reserve 1.5x that (in
  // steps) off the end of the return leg so every cell's pop finishes
  // before the loop wraps, instead of only the last few getting cut off.
  const POP_DUR_SEC = 0.4;
  const revealReserve = POP_DUR_SEC * stepsPerSec * 1.5;
  const revealSpan = Math.max(1, legCFinishSpan - revealReserve);
  const revealIndexOf = new Map();
  eatenCells.forEach((p, m) => {
    revealIndexOf.set(p.x + ',' + p.y, legCStartIndex + (m / eatenCells.length) * revealSpan);
  });

  let cells = '';
  let cellAnimId = 0;
  for (let c = 0; c < WEEKS; c++) {
    for (let r = 0; r < DAYS; r++) {
      const level = grid[c][r];
      if (level === null) continue;
      const x = c + PAD_LEFT, y = r + PAD_TOP;
      const px = (cx(x) - CELL / 2).toFixed(1), py = (cy(y) - CELL / 2).toFixed(1);
      if (level === 0) {
        cells += `<use href="#cs" x="${px}" y="${py}" fill="var(--lvl0)"/>`;
        continue;
      }
      const key = x + ',' + y;
      const tEaten = (eatenIndexOf.get(key) / lastIdx) * 100;
      const tReveal = (revealIndexOf.get(key) / lastIdx) * 100;
      const color = LEVEL_FILL[level];
      const name = `cg${cellAnimId++}`;
      const eps = 0.03;
      // Pop-in spans POP_DUR_SEC total: growPct to the overshoot, the rest
      // settling back down — same 2:1 ratio as the original fixed offsets.
      const popPct = (POP_DUR_SEC / totalDuration) * 100;
      const growPct = popPct * (2 / 3);
      style += `@keyframes ${name}{`
        + `0%{fill:${color};opacity:1;transform:scale(1);}`
        + `${(tEaten).toFixed(2)}%{fill:${color};opacity:1;transform:scale(1);}`
        + `${(tEaten + eps).toFixed(2)}%{fill:var(--lvl0);opacity:1;transform:scale(1);}`
        + `${(tReveal).toFixed(2)}%{fill:var(--lvl0);opacity:1;transform:scale(1);}`
        + `${(tReveal + eps).toFixed(2)}%{fill:${color};opacity:0;transform:scale(0.2);}`
        + `${Math.min(100, tReveal + eps + growPct).toFixed(2)}%{fill:${color};opacity:1;transform:scale(1.12);}`
        + `${Math.min(100, tReveal + eps + popPct).toFixed(2)}%{fill:${color};opacity:1;transform:scale(1);}`
        + `100%{fill:${color};opacity:1;transform:scale(1);}`
        + `}`;
      // Cells are static, so origin can use view-box, computed once at build
      // time (segments move, so they need fill-box instead — see below).
      cells += `<use href="#cs" x="${px}" y="${py}" style="will-change:transform;animation:${name} ${totalDuration.toFixed(2)}s linear infinite;transform-box:view-box;transform-origin:${cx(x).toFixed(1)}px ${cy(y).toFixed(1)}px;"/>`;
    }
  }

  // One shared position keyframe, reused by every segment via a delayed
  // animation-delay — keeps file size sane regardless of segment count.
  const posStops = collapseCollinear(trail);
  const originPx = cx(trail[0].x), originPy = cy(trail[0].y);
  style += `@keyframes snake-pos{`
    + posStops.map(s => `${((s.i / lastIdx) * 100).toFixed(2)}%{transform:translate(${(cx(s.x) - originPx).toFixed(2)}px,${(cy(s.y) - originPy).toFixed(2)}px);}`).join('')
    + `}`;

  // Per-segment size/color: each segment's alive window is found by binary
  // search, then sampled only inside it — even sampling across the whole
  // cycle would starve the birth moment, where the growth curve is steepest.
  const MIN_SIZE = CELL * 0.28, MAX_SIZE = CELL;

  const cumEaten = new Array(trail.length);
  { let e = 0; for (let i = 0; i < trail.length; i++) { if (growAt[i]) e++; cumEaten[i] = e; } }

  // Rounded to match bodyAgeMap — a raw float let tt = n/(len-1) exceed 1,
  // shrinking a segment below its minimum size right at birth. The
  // return-leg shrink reaches START_LEN by the end of revealSpan (the same
  // window the cell reveals use), not the full return leg, so tail
  // segments finish vanishing with the same safety margin the pops get.
  function bodyLenAtStep(i) {
    let raw;
    if (i <= legCStartIndex) raw = bodyLenAt(cumEaten[i], solved.totalEatable);
    else {
      const p = Math.min(1, (i - legCStartIndex) / revealSpan);
      const full = bodyLenAt(solved.totalEatable, solved.totalEatable);
      raw = full + (START_LEN - full) * p;
    }
    return Math.max(1, Math.round(raw));
  }

  function findBirth(n) {
    if (bodyLenAtStep(0) > n) return 0;
    let lo = 0, hi = legCStartIndex;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bodyLenAtStep(mid) > n) hi = mid; else lo = mid + 1;
    }
    return lo;
  }
  // Shared by both the growth phase (shapeAt, below) and the return-leg
  // checkpoint loop — same formula for a segment's shape given any body
  // length, real or virtual, so shrinking uses the exact same curve as
  // growing instead of a separately hardcoded one.
  function shapeForLen(n, len) {
    // Past the current body length entirely (only possible during the
    // return-leg shrink, as len counts down) — this index isn't part of
    // the body at all anymore, so it's fully gone. The short-body floor
    // below only applies to segments that ARE part of the body; applying
    // it here would leave a departed segment stuck at a visible size.
    if (n >= len) return { scale: 0, fill: TAIL_COLOR, tt: 1 };
    // Anchored at the head end, not the tail: the segment right after the
    // head is always exactly BODY_COLOR, and the tail tip only approaches
    // TAIL_COLOR asymptotically as len grows — never quite reaching it for
    // short bodies, instead of the tail tip being forced there always.
    const tt = len <= 1 ? 0 : (n - 1) / (len - 1);
    // Short bodies get a gentler floor for the tail — full MAX_SIZE at 1
    // segment, ramping linearly down to MIN_SIZE by 10 segments and
    // staying there above that. Same quadratic curve shape either way,
    // just a shallower range.
    const floorT = Math.min(1, Math.max(0, (len - 1) / 9));
    const minForLen = MAX_SIZE - (MAX_SIZE - MIN_SIZE) * floorT;
    const size = MAX_SIZE - (MAX_SIZE - minForLen) * (tt * tt);
    return { scale: size / MAX_SIZE, fill: lerpColor(BODY_COLOR, TAIL_COLOR, tt), tt };
  }
  function shapeAt(n, i) {
    return shapeForLen(n, bodyLenAtStep(i));
  }

  let segments = '';
  const segCount = Math.min(Math.round(bodyLenAt(solved.totalEatable, solved.totalEatable)), BODY_LIMIT);
  const pctOf = i => (i / lastIdx) * 100;

  // Tail-fade: excess segments (beyond the final body length) each get an
  // equal, contiguous slice of the shared window (tail-most first), and
  // drop straight from their held shape to gone — a plain 2-point linear
  // scale-down, not a sampled curve, so there's no stepping.
  const finalLen = bodyLenAtStep(legCEndIndex);
  const dyingCount = Math.max(0, segCount - finalLen);
  const tailFadeSliceSteps = dyingCount > 0 ? revealSpan / dyingCount : 0;

  for (let n = 0; n < segCount; n++) {
    // Positive delay trails segment n behind the head by n steps (wrapper
    // position only — the shape animation below is already absolute-timed
    // and must not be delayed again).
    const posDelay = n / stepsPerSec;
    if (n === 0) {
      segments += `<g style="will-change:transform;animation:snake-pos ${totalDuration.toFixed(2)}s linear infinite;animation-delay:${posDelay.toFixed(3)}s;">`
        + `<rect x="${(-MAX_SIZE / 2).toFixed(2)}" y="${(-MAX_SIZE / 2).toFixed(2)}" width="${MAX_SIZE}" height="${MAX_SIZE}" rx="${(MAX_SIZE * 0.32).toFixed(2)}" fill="${HEAD_COLOR}"/>`
        + `</g>`;
      continue;
    }
    const birth = findBirth(n);

    const stopList = [];
    if (birth > 0) stopList.push([0, 'opacity:0;transform:scale(0);']);

    // A stop at every step where the rounded body length actually changes
    // (not N evenly-spaced samples) — eating pace is uneven, so even
    // sampling could miss bursts of several eat-events in a row. Only
    // covers the eating phase — the return leg is handled by the shared
    // checkpoint loop below, for every segment uniformly.
    const aliveEnd = legCStartIndex;
    const events = [];
    let prevLen = null;
    for (let i = birth; i <= aliveEnd; i++) {
      const len = bodyLenAtStep(i);
      if (len === prevLen) continue;
      prevLen = len;
      events.push({ pct: pctOf(i), ...shapeAt(n, i) });
    }
    if (!events.length || events[events.length - 1].pct < pctOf(aliveEnd)) {
      events.push({ pct: pctOf(aliveEnd), ...shapeAt(n, aliveEnd) });
    }

    // React to eating rather than anticipate it: hold, then ramp to the new
    // value over at most HOLD_CAP seconds — otherwise a late-cycle gap
    // between eat-events (growth flattens near the end) gets smeared across
    // the whole gap, repainting every frame for a change nobody can see.
    // Birth/death reuse the same ramp for appearing/vanishing.
    const HOLD_CAP = 0.3;
    const capPct = (HOLD_CAP / totalDuration) * 100;
    const styleOf = e => `opacity:1;transform:scale(${e.scale.toFixed(2)});fill:${e.fill};`;
    const pushStop = (pct, s) => {
      const last = stopList[stopList.length - 1];
      if (last && last[0] === pct && last[1] === s) return;
      stopList.push([pct, s]);
    };

    // Each transition ramps for up to capPct — but if the next one arrives
    // before that finishes, don't jump straight to either target. Track
    // where the ramp actually is the instant it's interrupted (a plain
    // linear read of its own progress so far — the same value CSS itself
    // would be showing right then) and start the next ramp from there,
    // aimed at the newly-known target. Nothing is ever anticipated ahead
    // of an event that hasn't happened yet — a backlog only makes the next
    // ramp move faster to still land within capPct, never earlier.
    const changePoints = [];
    if (birth > 0) {
      changePoints.push({ pct: events[0].pct, scale: events[0].scale, tt: events[0].tt });
    } else {
      pushStop(events[0].pct, styleOf(events[0]));
    }
    for (let k = 1; k < events.length; k++) {
      changePoints.push({ pct: events[k].pct, scale: events[k].scale, tt: events[k].tt });
    }
    let curPct, curScale, curTt;
    if (birth > 0) {
      curPct = changePoints[0].pct;
      curScale = 0;
      curTt = changePoints[0].tt;
      pushStop(curPct, 'opacity:0;transform:scale(0);');
    } else {
      curPct = events[0].pct;
      curScale = events[0].scale;
      curTt = events[0].tt;
    }
    for (let idx = 0; idx < changePoints.length; idx++) {
      const cp = changePoints[idx];
      const naturalEndPct = curPct + capPct;
      const nextPct = idx + 1 < changePoints.length ? changePoints[idx + 1].pct : pctOf(aliveEnd);
      if (naturalEndPct <= nextPct) {
        const style = styleOf({ scale: cp.scale, fill: lerpColor(BODY_COLOR, TAIL_COLOR, Math.min(cp.tt, 1)) });
        pushStop(naturalEndPct, style);
        if (naturalEndPct < nextPct) pushStop(nextPct, style);
        curPct = nextPct; curScale = cp.scale; curTt = cp.tt;
      } else {
        const f = (nextPct - curPct) / capPct;
        const midScale = curScale + (cp.scale - curScale) * f;
        const midTt = curTt + (cp.tt - curTt) * f;
        pushStop(nextPct, styleOf({ scale: midScale, fill: lerpColor(BODY_COLOR, TAIL_COLOR, Math.min(Math.max(midTt, 0), 1)) }));
        curPct = nextPct; curScale = midScale; curTt = midTt;
      }
    }
    // Return leg: the window is sliced into as many equal steps as
    // segments will vanish, and at every slice boundary EVERY segment
    // (not just whichever one is currently vanishing) gets a new
    // waypoint — its shape as if the body were now exactly one segment
    // shorter (virtualLen counts straight down: segCount, segCount-1, ...,
    // finalLen). A straight line connects each pair of waypoints, so the
    // whole tail moves together instead of one segment fading in isolation.
    for (let k = 1; k <= dyingCount; k++) {
      const virtualLen = segCount - k;
      const { scale, fill } = shapeForLen(n, virtualLen);
      const pct = pctOf(legCStartIndex + k * tailFadeSliceSteps);
      pushStop(pct, `opacity:1;transform:scale(${scale.toFixed(2)});fill:${fill};`);
      if (scale === 0) break;
    }
    pushStop(100, stopList[stopList.length - 1][1]);

    let kf = '';
    for (const [pct, bit] of stopList) kf += `${pct.toFixed(2)}%{${bit}}`;
    const name = `seg${n}`;
    style += `@keyframes ${name}{${kf}}`;
    segments += `<g style="will-change:transform;animation:snake-pos ${totalDuration.toFixed(2)}s linear infinite;animation-delay:${posDelay.toFixed(3)}s;">`
      + `<rect x="${(-MAX_SIZE / 2).toFixed(2)}" y="${(-MAX_SIZE / 2).toFixed(2)}" width="${MAX_SIZE}" height="${MAX_SIZE}" rx="${(MAX_SIZE * 0.32).toFixed(2)}" fill="${BODY_COLOR}" style="will-change:transform;animation:${name} ${totalDuration.toFixed(2)}s linear infinite;transform-box:fill-box;transform-origin:center;"/>`
      + `</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="100%" height="100%">
  <defs><rect id="cs" width="${CELL}" height="${CELL}" rx="2.4"/><style>${style}</style></defs>
  ${cells}
  <g transform="translate(${originPx.toFixed(2)},${originPy.toFixed(2)})">${segments}</g>
</svg>`;
}

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  if (!owner) {
    console.error('Error: GITHUB_REPOSITORY_OWNER environment variable is not set.');
    process.exit(1);
  }

  const config = loadConfig();
  // contributionSnake.color is independent of theme.gradient — if unset, falls back to theme.accent.
  const colors = {
    base: config.contributionSnake?.color ?? config.theme?.accent ?? '#a78bfa',
  };
  const rawSpeed = config.contributionSnake?.speed;
  const speedMultiplier = typeof rawSpeed === 'number' && rawSpeed > 0 ? Math.max(0.1, Math.min(rawSpeed, 3)) : 1;

  const rawStartLength = config.contributionSnake?.startLength;
  const rawMaxLength = config.contributionSnake?.maxLength;
  if (typeof rawStartLength === 'number' && rawStartLength >= 0) START_LEN = Math.max(1, Math.min(50, Math.round(rawStartLength)));
  if (typeof rawMaxLength === 'number' && rawMaxLength >= 1) BODY_LIMIT = Math.min(50, Math.round(rawMaxLength));
  if (BODY_LIMIT < START_LEN) BODY_LIMIT = START_LEN;

  const grid = await fetchCalendar(owner, process.env.GITHUB_TOKEN);

  const outPath = join(__dirname, '..', 'assets', 'contribution-snake.svg');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buildSvg(grid, colors, speedMultiplier), 'utf8');

  console.log(`Generated assets/contribution-snake.svg — ${grid.length} weeks`);
}

main();
