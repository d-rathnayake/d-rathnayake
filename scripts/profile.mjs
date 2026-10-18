#!/usr/bin/env node
// Generates the magical profile SVGs and README.md from GitHub data.
// Private repositories are only counted or aggregated. Their names,
// descriptions and links are never written to any output file.
import fs from 'node:fs';
import path from 'node:path';
import { computeRpg, levelSvg, achievementsSvg } from './magic.mjs';

const API = 'https://api.github.com';
const UA = 'magic-profile-generator';

/* ---------------------------------------------------------------- helpers */

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const num = (n) => Number(n).toLocaleString('en-US');

const isSet = (v) => typeof v === 'string' && v.trim() !== '' && !v.startsWith('YOUR_');

// Small deterministic PRNG so the star field is identical between runs.
export function seeded(seed = 7) {
  let s = seed;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

const FONT = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', HTML: '#e34c26', CSS: '#563d7c',
  Java: '#b07219', PHP: '#4F5D95', Shell: '#89e051', Kotlin: '#A97BFF', Dart: '#00B4AB', Go: '#00ADD8',
  'C++': '#f34b7d', C: '#555555', 'C#': '#178600', Ruby: '#701516', Rust: '#dea584', Vue: '#41b883',
  SCSS: '#c6538c', Swift: '#F05138', Lua: '#000080',
};
const PALETTE = ['#a78bfa', '#22d3ee', '#f472b6', '#facc15', '#34d399', '#fb923c', '#60a5fa'];

/* ---------------------------------------------------------- GitHub client */

export function makeClient(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': UA,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return {
    async rest(p) {
      const res = await fetch(API + p, { headers });
      if (!res.ok) throw new Error(`GET ${p} failed: ${res.status}`);
      return res.json();
    },
    async gql(query, variables) {
      const res = await fetch(API + '/graphql', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) throw new Error(`GraphQL failed: ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '));
      return json.data;
    },
  };
}

export async function fetchRepos(api, login, hasPat) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const p = hasPat
      ? `/user/repos?affiliation=owner&visibility=all&per_page=100&page=${page}`
      : `/users/${login}/repos?type=owner&per_page=100&page=${page}`;
    const batch = await api.rest(p);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out.filter((r) => r.owner && r.owner.login.toLowerCase() === login.toLowerCase());
}

export async function fetchLanguages(api, repos, exclude = []) {
  const skip = new Set(exclude.map((s) => s.toLowerCase()));
  const totals = {};
  const queue = repos.filter((r) => !r.fork && !r.archived && !skip.has(r.name.toLowerCase()));
  const worker = async () => {
    while (queue.length) {
      const r = queue.shift();
      try {
        const langs = await api.rest(`/repos/${r.full_name}/languages`);
        for (const [name, bytes] of Object.entries(langs)) totals[name] = (totals[name] || 0) + bytes;
      } catch {
        /* skip repos that cannot be read */
      }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  return totals;
}

const CONTRIB_QUERY = `query($login:String!){
  user(login:$login){
    contributionsCollection{
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } }
    }
  }
}`;

export async function fetchContributions(api, login) {
  const data = await api.gql(CONTRIB_QUERY, { login });
  const c = data.user.contributionsCollection;
  const days = c.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    total: c.contributionCalendar.totalContributions,
    commits: c.totalCommitContributions,
    prs: c.totalPullRequestContributions,
    issues: c.totalIssueContributions,
    days,
  };
}

export async function fetchEvents(api, login) {
  try {
    return await api.rest(`/users/${login}/events/public?per_page=50`);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------ data processing */

export function streaks(days) {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    if (d.count > 0) {
      run++;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--; // today may not have activity yet
  let current = 0;
  while (i >= 0 && days[i].count > 0) {
    current++;
    i--;
  }
  return { current, longest };
}

export function repoStats(repos, hasPat) {
  const pub = repos.filter((r) => !r.private);
  const own = pub.filter((r) => !r.fork);
  return {
    publicCount: pub.length,
    privateCount: hasPat ? repos.filter((r) => r.private).length : null,
    stars: own.reduce((a, r) => a + r.stargazers_count, 0),
    forks: own.reduce((a, r) => a + r.forks_count, 0),
  };
}

export function pickFeatured(repos, cfg = {}, login = '', now = Date.now()) {
  const ex = new Set([...(cfg.exclude || []), login].map((s) => s.toLowerCase()));
  const pool = repos.filter((r) => !r.private && !r.fork && !r.archived && !ex.has(r.name.toLowerCase()));
  const pinned = (cfg.pin || [])
    .map((n) => pool.find((r) => r.name.toLowerCase() === n.toLowerCase()))
    .filter(Boolean);
  const score = (r) => {
    const days = (now - new Date(r.pushed_at).getTime()) / 864e5;
    return (
      r.stargazers_count * 4 +
      r.forks_count * 3 +
      20 * Math.exp(-days / 90) +
      (r.description ? 6 : 0) +
      Math.min((r.topics || []).length, 5) * 0.6
    );
  };
  const rest = pool.filter((r) => !pinned.includes(r)).sort((a, b) => score(b) - score(a));
  return [...pinned, ...rest].slice(0, cfg.count || 4);
}

export function topTopics(repos, limit = 12) {
  const freq = {};
  for (const r of repos.filter((x) => !x.private && !x.fork)) {
    for (const t of r.topics || []) freq[t] = (freq[t] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map((e) => e[0]);
}

export function languageShares(totals, top = 6) {
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const sum = entries.reduce((a, e) => a + e[1], 0);
  if (!sum) return [];
  const shown = entries.slice(0, top).map(([name, bytes]) => ({ name, pct: (bytes / sum) * 100 }));
  const other = entries.slice(top).reduce((a, e) => a + e[1], 0);
  if (other) shown.push({ name: 'Other', pct: (other / sum) * 100 });
  return shown.map((s, i) => ({
    ...s,
    color: LANG_COLORS[s.name] || (s.name === 'Other' ? '#64748b' : PALETTE[i % PALETTE.length]),
  }));
}

const DESCRIBE = {
  WatchEvent: () => 'Starred a repository',
  ForkEvent: () => 'Forked a repository',
  ReleaseEvent: () => 'Published a release',
};

export function describeEvent(ev) {
  const p = ev.payload || {};
  if (ev.type === 'PushEvent') {
    const count = p.size || (p.commits || []).length || 0;
    return `Cast ${count} commit${count === 1 ? '' : 's'}`;
  }
  if (ev.type === 'CreateEvent') {
    return p.ref ? `Created ${p.ref_type || 'item'} \`${p.ref}\`` : `Created ${p.ref_type || 'item'}`;
  }
  if (ev.type === 'PullRequestEvent') return `${(p.action || 'updated')[0].toUpperCase()}${(p.action || 'updated').slice(1)} a pull request`;
  if (ev.type === 'IssuesEvent') return `${(p.action || 'updated')[0].toUpperCase()}${(p.action || 'updated').slice(1)} an issue`;
  return DESCRIBE[ev.type] ? DESCRIBE[ev.type]() : null;
}

export function activityLines(events, limit = 5) {
  const out = [];
  const seen = new Set();
  for (const ev of events) {
    const repo = ev.repo && ev.repo.name;
    const day = (ev.created_at || '').slice(0, 10);
    const text = describeEvent(ev);
    if (!repo || !text) continue;
    const key = `${ev.type}|${repo}|${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`- \`${day}\` · ${text} in [${repo}](https://github.com/${repo})`);
    if (out.length === limit) break;
  }
  return out;
}

/* --------------------------------------------------------------- avatar */

// The header is an SVG shown through <img>, so it cannot load external images.
// The picture is embedded as a data URI: live GitHub avatar first, then a local file.
export async function fetchAvatar(login, root = process.cwd()) {
  try {
    const res = await fetch(`https://github.com/${encodeURIComponent(login)}.png?size=240`, {
      headers: { 'User-Agent': UA },
    });
    if (res.ok) {
      const type = (res.headers.get('content-type') || 'image/png').split(';')[0];
      if (type.startsWith('image/')) {
        return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
      }
    }
  } catch {
    /* fall through to local files */
  }
  const candidates = [
    ['assets/images/shana.png', 'image/png'],
    ['assets/logo.jpg', 'image/jpeg'],
  ];
  for (const [file, mime] of candidates) {
    try {
      return `data:${mime};base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`;
    } catch {
      /* try next */
    }
  }
  return null;
}

/* ------------------------------------------------------------ SVG: header */

// Four-point sparkle centred on (x, y) with radius r.
const sparkle = (x, y, r, fill) => {
  const k = r * 0.22;
  return `<path d="M${x},${y - r} L${x + k},${y - k} L${x + r},${y} L${x + k},${y + k} L${x},${y + r} L${x - k},${y + k} L${x - r},${y} L${x - k},${y - k} Z" fill="${fill}"/>`;
};

// Circular orbit path starting at the left side of the circle, clockwise or counter-clockwise.
const orbit = (cx, cy, r, clockwise = true) =>
  clockwise
    ? `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`
    : `M${cx + r},${cy} a${r},${r} 0 1,0 ${-2 * r},0 a${r},${r} 0 1,0 ${2 * r},0`;

export function headerSvg({ headline, name, roles, avatar = null }) {
  const W = 900;
  const H = 300;
  const cx = 150;
  const cy = 150;
  const list = roles.length ? roles : ['Developer'];
  const n = list.length;
  const D = 3; // seconds each role stays on screen
  const T = n * D;
  const vis = 100 / n;
  const animated = n > 1;

  const rnd = seeded(11);
  const stars = Array.from({ length: 60 }, () => {
    const x = (rnd() * W).toFixed(1);
    const y = (rnd() * H).toFixed(1);
    const r = (0.6 + rnd() * 1.6).toFixed(2);
    const dur = (2.5 + rnd() * 3).toFixed(2);
    const delay = (rnd() * 4).toFixed(2);
    return `<circle class="tw" cx="${x}" cy="${y}" r="${r}" fill="#ffffff" style="animation-duration:${dur}s;animation-delay:-${delay}s"/>`;
  }).join('');

  const roleEls = list
    .map((r, i) => {
      const cls = animated ? `role${i === 0 ? ' role0' : ''}` : 'role role0';
      const style = animated ? ` style="animation-delay:${i * D}s"` : '';
      return `<text class="${cls}" x="318" y="206"${style}>${esc(r)}</text>`;
    })
    .join('\n  ');

  const css = `<style>
  .tw{animation:tw 3s ease-in-out infinite}
  @keyframes tw{0%,100%{opacity:.15}50%{opacity:1}}
  .role{font-size:22px;fill:#e9d5ff;opacity:${animated ? 0 : 1};${animated ? `animation:cyc ${T}s infinite` : ''}}
  ${animated ? `@keyframes cyc{0%{opacity:0;transform:translateY(8px)}3%{opacity:1;transform:translateY(0)}${(vis - 3).toFixed(2)}%{opacity:1;transform:translateY(0)}${vis.toFixed(2)}%{opacity:0;transform:translateY(-8px)}100%{opacity:0}}` : ''}
  @media (prefers-reduced-motion: reduce){.tw,.role{animation:none}.role{opacity:0}.role0{opacity:1}}
</style>`;

  const avatarEl = avatar
    ? `<image href="${avatar}" x="${cx - 80}" y="${cy - 80}" width="160" height="160" clip-path="url(#avclip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${cx}" cy="${cy}" r="80" fill="#1e1b4b"/>
  <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="56" font-weight="700" fill="#ffffff">${esc(
      name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    )}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t" font-family="${FONT}">
<title id="t">${esc(name)} - ${esc(headline)}</title>
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0b0720"/>
    <stop offset="0.55" stop-color="#1e1048"/>
    <stop offset="1" stop-color="#06202e"/>
  </linearGradient>
  <linearGradient id="aur1" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#7c3aed" stop-opacity="0"/>
    <stop offset="0.5" stop-color="#22d3ee" stop-opacity="0.9"/>
    <stop offset="1" stop-color="#f472b6" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="aur2" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#f472b6" stop-opacity="0"/>
    <stop offset="0.5" stop-color="#a78bfa" stop-opacity="0.85"/>
    <stop offset="1" stop-color="#facc15" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#facc15"/>
    <stop offset="0.5" stop-color="#f472b6"/>
    <stop offset="1" stop-color="#22d3ee"/>
  </linearGradient>
  <linearGradient id="titleGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#facc15"/>
    <stop offset="0.5" stop-color="#f472b6"/>
    <stop offset="1" stop-color="#22d3ee"/>
  </linearGradient>
  <linearGradient id="comet" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
    <stop offset="1" stop-color="#facc15" stop-opacity="1"/>
  </linearGradient>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#a78bfa" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#a78bfa" stop-opacity="0"/>
  </radialGradient>
  <clipPath id="avclip"><circle cx="${cx}" cy="${cy}" r="80"/></clipPath>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>
</defs>
${css}

<rect width="${W}" height="${H}" rx="24" fill="url(#sky)"/>

<g filter="url(#blur)" opacity="0.6">
  <ellipse cx="200" cy="40" rx="280" ry="60" fill="url(#aur1)">
    <animateTransform attributeName="transform" type="translate" values="0 0;70 12;0 0" dur="12s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="720" cy="270" rx="320" ry="70" fill="url(#aur2)">
    <animateTransform attributeName="transform" type="translate" values="0 0;-60 -14;0 0" dur="15s" repeatCount="indefinite"/>
  </ellipse>
</g>

${stars}

<g>
  <animateTransform attributeName="transform" type="translate" values="-160,20;960,140;960,140" keyTimes="0;0.2;1" dur="9s" repeatCount="indefinite"/>
  <line x1="0" y1="0" x2="-110" y2="-18" stroke="url(#comet)" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="0" cy="0" r="2" fill="#ffffff"/>
</g>

<circle cx="${cx}" cy="${cy}" r="124" fill="url(#halo)"/>
<circle cx="${cx}" cy="${cy}" r="112" fill="none" stroke="#a78bfa" stroke-opacity="0.25" stroke-width="1"/>
<circle cx="${cx}" cy="${cy}" r="132" fill="none" stroke="#22d3ee" stroke-opacity="0.15" stroke-width="1" stroke-dasharray="2 6"/>
<circle r="5" fill="#facc15"><animateMotion dur="10s" repeatCount="indefinite" path="${orbit(cx, cy, 112, true)}"/></circle>
<circle r="3.5" fill="#22d3ee"><animateMotion dur="16s" repeatCount="indefinite" path="${orbit(cx, cy, 132, false)}"/></circle>

<g>
  <animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="18s" repeatCount="indefinite"/>
  <circle cx="${cx}" cy="${cy}" r="96" fill="none" stroke="url(#ringGrad)" stroke-width="3" stroke-linecap="round" stroke-dasharray="6 10"/>
</g>
${avatarEl}
<circle cx="${cx}" cy="${cy}" r="82" fill="none" stroke="url(#ringGrad)" stroke-width="2"/>

${sparkle(300, 84, 9, '#facc15')}
<text x="318" y="90" font-size="15" font-weight="700" letter-spacing="4" fill="#facc15">${esc(headline.toUpperCase())}</text>
<text x="300" y="150" font-size="50" font-weight="700" fill="url(#titleGrad)">${esc(name)}</text>
${roleEls}
<rect x="300" y="226" width="150" height="3" rx="1.5" fill="url(#titleGrad)"/>
<text x="300" y="262" font-size="13" letter-spacing="3" fill="#c4b5fd">CODE · CREATE · CONJURE</text>
${sparkle(860, 60, 6, '#f472b6')}
${sparkle(820, 250, 4, '#22d3ee')}
</svg>`;
}

/* ------------------------------------------------------------- SVG: stats */

export function statsSvg(tiles, updated) {
  const cols = 4;
  const tw = 204;
  const th = 92;
  const gap = 16;
  const x0 = 18;
  const y0 = 84;
  const rows = Math.ceil(tiles.length / cols);
  const H = y0 + rows * th + (rows - 1) * gap + 42;
  const cells = tiles
    .map((t, i) => {
      const x = x0 + (i % cols) * (tw + gap);
      const y = y0 + Math.floor(i / cols) * (th + gap);
      return `<g>
  <rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="16" fill="#ffffff" fill-opacity="0.05" stroke="${t.color}" stroke-opacity="0.55"/>
  <rect x="${x + 16}" y="${y}" width="40" height="4" rx="2" fill="${t.color}"/>
  <text x="${x + 18}" y="${y + 52}" font-size="30" font-weight="700" fill="#ffffff">${esc(t.value)}</text>
  <text x="${x + 18}" y="${y + 74}" font-size="13" fill="#c4b5fd">${esc(t.label)}</text>
</g>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 ${H}" width="900" height="${H}" role="img" aria-labelledby="t" font-family="${FONT}">
<title id="t">Repository and contribution statistics</title>
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0b0720"/>
    <stop offset="1" stop-color="#1e1048"/>
  </linearGradient>
  <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#facc15"/>
    <stop offset="0.5" stop-color="#f472b6"/>
    <stop offset="1" stop-color="#22d3ee"/>
  </linearGradient>
</defs>
<rect width="900" height="${H}" rx="24" fill="url(#sky)"/>
<text x="24" y="44" font-size="22" font-weight="700" fill="#ffffff">✦ Magic metrics</text>
<text x="24" y="66" font-size="12.5" fill="#c4b5fd">Contributions cover the last 12 months. Private repositories are counted only.</text>
<rect x="${900 - 24 - 140}" y="34" width="140" height="3" rx="1.5" fill="url(#bar)"/>
${cells}
<text x="24" y="${H - 16}" font-size="11.5" fill="#8b7fb8">Updated ${esc(updated)} UTC</text>
</svg>`;
}

/* -------------------------------------------------------- SVG: languages */

export function languagesSvg(shares) {
  const W = 900;
  const barX = 24;
  const barW = W - 48;
  const rows = Math.ceil(shares.length / 3);
  const H = shares.length ? 112 + rows * 30 + 20 : 120;
  let bar = '';
  let legend = '';
  if (shares.length) {
    let x = barX;
    shares.forEach((s, i) => {
      const w = Math.max(2, (s.pct / 100) * barW);
      const first = i === 0;
      const last = i === shares.length - 1;
      bar += `<rect x="${x.toFixed(1)}" y="72" width="${w.toFixed(1)}" height="14" fill="${s.color}" rx="${first || last ? 7 : 0}"/>`;
      x += w;
      const lx = barX + (i % 3) * 288;
      const ly = 118 + Math.floor(i / 3) * 30;
      legend += `<circle cx="${lx + 6}" cy="${ly - 4}" r="6" fill="${s.color}"/>
<text x="${lx + 20}" y="${ly}" font-size="14" fill="#f5f3ff">${esc(s.name)}</text>
<text x="${lx + 250}" y="${ly}" font-size="14" fill="#c4b5fd" text-anchor="end">${s.pct.toFixed(1)}%</text>`;
    });
  } else {
    legend = `<text x="24" y="90" font-size="14" fill="#c4b5fd">No language data yet.</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t" font-family="${FONT}">
<title id="t">Most used languages</title>
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0b0720"/>
    <stop offset="1" stop-color="#06202e"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" rx="24" fill="url(#sky)"/>
<text x="24" y="44" font-size="22" font-weight="700" fill="#ffffff">✦ Favourite spells</text>
<text x="24" y="62" font-size="12.5" fill="#c4b5fd">Share of code across owned repositories, forks excluded.</text>
${bar}
${legend}
</svg>`;
}

/* -------------------------------------------------------- README helpers */

export function renderFeatured(list) {
  if (!list.length) return '<sub>No public projects yet. Something magical is brewing ✨</sub>';
  const cell = (r) => {
    const meta = [r.language, r.stargazers_count ? `${r.stargazers_count} star${r.stargazers_count === 1 ? '' : 's'}` : null]
      .filter(Boolean)
      .map(esc)
      .join(' &middot; ');
    return `  <td width="50%" valign="top">
    <a href="${r.html_url}"><b>${esc(r.name)}</b></a><br/>
    <sub>${esc(r.description || 'No description yet.')}</sub><br/>
    <sub>${meta}</sub>
  </td>`;
  };
  const rows = [];
  for (let i = 0; i < list.length; i += 2) {
    rows.push(`<tr>\n${cell(list[i])}\n${list[i + 1] ? cell(list[i + 1]) : '  <td width="50%"></td>'}\n</tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>`;
}

export function renderTemplate(tpl, vars, links) {
  // Conditional blocks are kept only when their link value is set.
  let out = tpl.replace(/<!--IF:(\w+)-->([\s\S]*?)<!--\/IF:\1-->/g, (_, key, body) =>
    isSet(links[key]) ? body : ''
  );
  // Placeholders: value from vars, else from links, else empty (never leaves raw {{tokens}}).
  out = out.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (k in vars) return vars[k];
    if (isSet(links[k])) return links[k];
    return '';
  });
  return out.replace(/\n[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

/* ------------------------------------------------------------------ main */

export async function main() {
  const root = process.cwd();
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'profile.config.json'), 'utf8'));
  const tpl = fs.readFileSync(path.join(root, 'README.template.md'), 'utf8');
  const login = process.env.GITHUB_REPOSITORY_OWNER || cfg.username;
  const pat = process.env.PROFILE_TOKEN || '';
  const hasPat = Boolean(pat);
  const api = makeClient(pat || process.env.GITHUB_TOKEN || '');

  const repos = await fetchRepos(api, login, hasPat);
  const rs = repoStats(repos, hasPat);
  const langTotals = await fetchLanguages(api, repos, cfg.languages?.exclude);
  const shares = languageShares(langTotals, cfg.languages?.top || 6);

  let contrib = null;
  try {
    contrib = await fetchContributions(api, login);
  } catch (e) {
    console.warn('Contribution data unavailable:', e.message);
  }
  const st = contrib ? streaks(contrib.days) : null;
  const events = await fetchEvents(api, login);
  let followers = 0;
  try {
    followers = (await api.rest(`/users/${login}`)).followers || 0;
  } catch (e) {
    console.warn('User data unavailable:', e.message);
  }

  const updated = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const dash = 'n/a';
  const tiles = [
    { label: 'Public repositories', value: num(rs.publicCount), color: '#a78bfa' },
    { label: 'Private repositories', value: rs.privateCount === null ? dash : num(rs.privateCount), color: '#c084fc' },
    { label: 'Stars earned', value: num(rs.stars), color: '#facc15' },
    { label: 'Forks of my repos', value: num(rs.forks), color: '#22d3ee' },
    { label: 'Contributions (1 year)', value: contrib ? num(contrib.total) : dash, color: '#34d399' },
    { label: 'Pull requests', value: contrib ? num(contrib.prs) : dash, color: '#fb923c' },
    { label: 'Issues opened', value: contrib ? num(contrib.issues) : dash, color: '#f472b6' },
    { label: 'Streak (now / best)', value: st ? `${st.current} / ${st.longest}` : dash, color: '#60a5fa' },
  ];

  const avatar = await fetchAvatar(login, root);
  const outDir = path.join(root, 'assets', 'generated');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'header.svg'),
    headerSvg({
      headline: cfg.headline || 'Welcome',
      name: cfg.name || login,
      roles: cfg.roles?.length ? cfg.roles : ['Developer'],
      avatar,
    })
  );
  fs.writeFileSync(path.join(outDir, 'stats.svg'), statsSvg(tiles, updated));
  fs.writeFileSync(path.join(outDir, 'languages.svg'), languagesSvg(shares));

  const contributions = contrib ? contrib.total : 0;
  const prs = contrib ? contrib.prs : 0;
  const issues = contrib ? contrib.issues : 0;
  const longestStreak = st ? st.longest : 0;
  const game = {
    contributions,
    prs,
    issues,
    longestStreak,
    stars: rs.stars,
    followers,
    repos: rs.publicCount + (rs.privateCount || 0),
    languageCount: Object.keys(langTotals).length,
    topLang: shares[0] ? shares[0].name : '',
  };
  const rpg = computeRpg({ ...game, contributions });
  game.level = rpg.level;
  fs.writeFileSync(
    path.join(outDir, 'level.svg'),
    levelSvg({
      name: cfg.name || login,
      rpg,
      avatar,
      topLang: game.topLang,
      stats: { contributions: contributions, streak: st ? st.current : 0, stars: rs.stars, repos: game.repos },
    })
  );
  fs.writeFileSync(path.join(outDir, 'achievements.svg'), achievementsSvg(game));

  const topLangs = shares.filter((s) => s.name !== 'Other').slice(0, 3).map((s) => s.name);
  const total = rs.publicCount + (rs.privateCount || 0);
  const autoLine =
    `**${total}** repositories (**${rs.publicCount}** public` +
    (rs.privateCount === null ? '' : `, **${rs.privateCount}** private`) +
    ')' +
    (topLangs.length ? `. Most used: ${topLangs.join(', ')}.` : '.');

  const activity = activityLines(events);
  const topics = topTopics(repos);
  const links = cfg.links || {};

  const vars = {
    username: login,
    name: cfg.name || login,
    headline: cfg.headline || '',
    bio: cfg.bio || '',
    overview: (cfg.overview || []).map((l) => `- ${l}`).join('\n'),
    now: (cfg.now || []).map((l) => `- ${l}`).join('\n'),
    auto_line: autoLine,
    activity: activity.length ? activity.join('\n') : '- No recent public spells yet. Stay tuned ✨',
    stack: (cfg.stack || []).join(','),
    topics: topics.length ? topics.map((t) => `\`${t}\``).join(' ') : '',
    featured: renderFeatured(pickFeatured(repos, cfg.featured, login)),
    updated,
  };

  fs.writeFileSync(path.join(root, 'README.md'), renderTemplate(tpl, vars, links));
  console.log(`Done: ${rs.publicCount} public, ${rs.privateCount ?? 'n/a'} private, ${shares.length} languages, ${activity.length} recent events.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
