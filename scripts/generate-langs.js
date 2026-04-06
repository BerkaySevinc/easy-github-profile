// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2025 BerkaySevinc — MIT License

const { writeFileSync } = require('fs');
const { join } = require('path');

const MAX_LANGS = 6;
const BAR_X = 20, BAR_Y = 42, BAR_W = 760, BAR_H = 22;

async function fetchLangs(owner, token) {
  const headers = { 'User-Agent': 'github-profile-generator', 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const query = `query($login: String!) {
    user(login: $login) {
      repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
        nodes {
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
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

  const totals = new Map();
  for (const repo of json.data.user.repositories.nodes) {
    for (const { size, node } of repo.languages.edges) {
      const existing = totals.get(node.name);
      if (existing) {
        existing.size += size;
      } else {
        totals.set(node.name, { size, color: node.color || '#808080' });
      }
    }
  }

  return [...totals.entries()]
    .map(([name, { size, color }]) => ({ name, size, color }))
    .sort((a, b) => b.size - a.size)
    .slice(0, MAX_LANGS);
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildSvg(langs) {
  const W = 800, H = 120;

  if (!langs.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="60" viewBox="0 0 ${W} 60">
  <style>
    @media (prefers-color-scheme: dark)  { .msg { fill: #8b949e; } }
    @media (prefers-color-scheme: light) { .msg { fill: #636e7b; } }
    .msg { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 13px; }
  </style>
  <text class="msg" x="${W / 2}" y="35" text-anchor="middle">No language data available.</text>
</svg>`;
  }

  const totalSize = langs.reduce((s, l) => s + l.size, 0);
  const withPct   = langs.map(l => ({ ...l, pct: l.size / totalSize }));

  // Stacked bar segments
  let barX = BAR_X;
  let barSegs = '';
  for (const lang of withPct) {
    const segW = Math.round(lang.pct * BAR_W);
    if (segW < 1) continue;
    barSegs += `      <rect x="${barX}" y="${BAR_Y}" width="${segW}" height="${BAR_H}" fill="${lang.color}"/>\n`;
    barX += segW;
  }

  // Legend items
  const itemW = Math.floor((W - 40) / langs.length);
  let legend = '';
  for (let i = 0; i < langs.length; i++) {
    const lx = 20 + i * itemW;
    legend += `  <circle cx="${lx + 5}" cy="88" r="5" fill="${langs[i].color}"/>\n`;
    legend += `  <text x="${lx + 16}" y="93" class="leg">${escapeXml(langs[i].name)} ${(withPct[i].pct * 100).toFixed(1)}%</text>\n`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <mask id="bar-mask">
      <rect x="${BAR_X}" y="${BAR_Y}" width="0" height="${BAR_H}" fill="white">
        <animate attributeName="width" from="0" to="${BAR_W}" dur="1.2s"
                 calcMode="spline" keyTimes="0;1" keySplines="0.25 0.1 0.25 1"
                 fill="freeze"/>
      </rect>
    </mask>
    <clipPath id="bar-shape">
      <rect x="${BAR_X}" y="${BAR_Y}" width="${BAR_W}" height="${BAR_H}" rx="4"/>
    </clipPath>
  </defs>
  <style>
    @media (prefers-color-scheme: dark) {
      .ttl { fill: #e6edf3; }
      .trk { fill: #21262d; }
      .leg { fill: #8b949e; }
    }
    @media (prefers-color-scheme: light) {
      .ttl { fill: #1f2328; }
      .trk { fill: #eaeef2; }
      .leg { fill: #636e7b; }
    }
    .ttl { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 14px; font-weight: 600; }
    .leg { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 11px; }
  </style>

  <text class="ttl" x="${W / 2}" y="24" text-anchor="middle">Top Languages</text>

  <!-- Bar track (background) -->
  <rect class="trk" x="${BAR_X}" y="${BAR_Y}" width="${BAR_W}" height="${BAR_H}" rx="4"/>

  <!-- Colored segments: rounded via clipPath, animated via mask -->
  <g clip-path="url(#bar-shape)" mask="url(#bar-mask)">
${barSegs}  </g>

  <!-- Legend -->
${legend}
</svg>`;
}

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  if (!owner) {
    console.error('Error: GITHUB_REPOSITORY_OWNER environment variable is not set.');
    process.exit(1);
  }

  const langs = await fetchLangs(owner, process.env.GITHUB_TOKEN);
  writeFileSync(join(__dirname, '..', 'assets', 'langs.svg'), buildSvg(langs), 'utf8');
  console.log(`Generated assets/langs.svg — ${langs.map(l => l.name).join(', ')}`);
}

main();
