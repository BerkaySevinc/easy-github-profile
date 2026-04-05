// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2025 BerkaySevinc — MIT License

const { writeFileSync } = require('fs');
const { join } = require('path');

async function fetchRepos(owner, token) {
  const headers = { 'User-Agent': 'github-profile-generator', 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const query = `query($login: String!) {
    user(login: $login) {
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository {
            name description stargazerCount forkCount
            primaryLanguage { name color }
          }
        }
      }
      repositories(ownerAffiliations: OWNER, isFork: false,
                   orderBy: { field: STARGAZERS, direction: DESC }, first: 6) {
        nodes {
          name description stargazerCount forkCount
          primaryLanguage { name color }
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

  const pinned = json.data.user.pinnedItems.nodes;
  return pinned.length > 0 ? pinned : json.data.user.repositories.nodes;
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapText(str, maxChars) {
  if (!str) return [''];
  if (str.length <= maxChars) return [str];
  const cut = str.lastIndexOf(' ', maxChars);
  if (cut < 1) return [str.slice(0, maxChars - 1) + '\u2026'];
  const line1 = str.slice(0, cut);
  const rest  = str.slice(cut + 1);
  if (rest.length <= maxChars) return [line1, rest];
  return [line1, rest.slice(0, maxChars - 1) + '\u2026'];
}

function buildCard(repo, x, y, cardW, cardH) {
  const pad      = 14;
  const name     = escapeXml(repo.name);
  const maxChars = Math.floor((cardW - pad * 2) / 6.5);
  const lines    = wrapText(repo.description || '', maxChars);
  const lang     = repo.primaryLanguage;
  const footerY  = y + cardH - 10;

  let out = `  <!-- ${name} -->\n`;
  out += `  <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" class="card" rx="8"/>\n`;
  out += `  <text x="${x + pad}" y="${y + 22}" class="cname">${name}</text>\n`;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    out += `  <text x="${x + pad}" y="${y + 40 + i * 15}" class="cdesc">${escapeXml(lines[i])}</text>\n`;
  }
  if (lang) {
    out += `  <circle cx="${x + pad + 5}" cy="${footerY - 4}" r="5" fill="${lang.color || '#808080'}"/>\n`;
    out += `  <text x="${x + pad + 16}" y="${footerY}" class="cmeta">${escapeXml(lang.name)}</text>\n`;
  }
  out += `  <text x="${x + cardW - pad}" y="${footerY}" text-anchor="end" class="cmeta">&#9733; ${repo.stargazerCount}</text>\n`;
  return out;
}

function buildSvg(repos) {
  const W       = 800;
  const COLS    = 3, GAP = 16, PAD = 16;
  const cardW   = Math.floor((W - PAD * 2 - GAP * (COLS - 1)) / COLS);
  const cardH   = 115;
  const rows    = Math.max(1, Math.ceil(repos.length / COLS));
  const TITLE_H = 48;
  const H       = TITLE_H + rows * (cardH + GAP) - GAP + PAD;

  if (!repos.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="80" viewBox="0 0 ${W} 80">
  <style>
    @media (prefers-color-scheme: dark)  { .msg { fill: #8b949e; } }
    @media (prefers-color-scheme: light) { .msg { fill: #636e7b; } }
    .msg { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 13px; }
  </style>
  <text class="msg" x="${W / 2}" y="45" text-anchor="middle">No repositories to display.</text>
</svg>`;
  }

  let cards = '';
  for (let i = 0; i < repos.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx  = PAD + col * (cardW + GAP);
    const cy  = TITLE_H + row * (cardH + GAP);
    cards += buildCard(repos[i], cx, cy, cardW, cardH);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>
    @media (prefers-color-scheme: dark) {
      .ttl   { fill: #e6edf3; }
      .hdl   { stroke: #30363d; }
      .card  { fill: #161b22; stroke: #30363d; }
      .cname { fill: #58a6ff; }
      .cdesc { fill: #8b949e; }
      .cmeta { fill: #8b949e; }
    }
    @media (prefers-color-scheme: light) {
      .ttl   { fill: #1f2328; }
      .hdl   { stroke: #d0d7de; }
      .card  { fill: #f6f8fa; stroke: #d0d7de; }
      .cname { fill: #0969da; }
      .cdesc { fill: #636e7b; }
      .cmeta { fill: #636e7b; }
    }
    .card  { stroke-width: 1; }
    .ttl   { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 14px; font-weight: 600; }
    .cname { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 13px; font-weight: 600; }
    .cdesc { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 11px; }
    .cmeta { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 11px; }
    .hdl   { stroke-width: 1; }
  </style>

  <text class="ttl" x="18" y="24">Pinned Repositories</text>
  <line class="hdl" x1="18" y1="36" x2="${W - 18}" y2="36"/>

${cards}
</svg>`;
}

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  if (!owner) {
    console.error('Error: GITHUB_REPOSITORY_OWNER environment variable is not set.');
    process.exit(1);
  }

  const repos = await fetchRepos(owner, process.env.GITHUB_TOKEN);
  writeFileSync(join(__dirname, '..', 'assets', 'repos.svg'), buildSvg(repos), 'utf8');
  console.log(`Generated assets/repos.svg — ${repos.length} repos`);
}

main();
