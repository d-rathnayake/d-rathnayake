#!/usr/bin/env node
// Generates the magical profile SVGs and README.md from GitHub data.
// Uses premium animated scenes from scenes.mjs + RPG layer from magic.mjs.
// Private repositories are only counted or aggregated. Their names,
// descriptions and links are never written to any output file.
import fs from 'node:fs';
import path from 'node:path';
import { computeRpg, levelSvg, achievementsSvg } from './magic.mjs';
import {
  headerSvg,
  skillsSvg,
  skySvg,
  constellationSvg,
  footerSvg,
} from './scenes.mjs';

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

export function seeded(seed = 7) {
  let s = seed;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

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
  const avatar = await fetchAvatar(login, root);
  const outDir = path.join(root, 'assets', 'generated');
  fs.mkdirSync(outDir, { recursive: true });

  // ---------- Premium scenes from scenes.mjs ----------
  const chips = (cfg.chips || cfg.stack || ['WEB', 'ANDROID', 'UI/UX', 'FIREBASE'])
    .slice(0, 6)
    .map((s) => String(s).toUpperCase());

  fs.writeFileSync(
    path.join(outDir, 'header.svg'),
    headerSvg({
      headline: cfg.headline || 'Welcome To Magical World',
      name: cfg.name || login,
      roles: cfg.roles?.length ? cfg.roles : ['Developer'],
      avatar,
      chips,
      tagline: cfg.tagline || 'CODE · CREATE · CONJURE',
      location: cfg.location || 'SRI LANKA',
    })
  );

  fs.writeFileSync(
    path.join(outDir, 'skills.svg'),
    skillsSvg({
      skills: cfg.stack || [],
      avatar,
      name: cfg.nickname || cfg.name || login,
    })
  );

  fs.writeFileSync(
    path.join(outDir, 'sky.svg'),
    skySvg({
      days: contrib ? contrib.days : [],
      total: contrib ? contrib.total : 0,
      longest: st ? st.longest : 0,
      current: st ? st.current : 0,
      updated,
    })
  );

  const featuredRepos = pickFeatured(repos, cfg.featured, login);
  const nodes = featuredRepos.map((r) => ({
    name: r.name,
    description: r.description || '',
    language: r.language || '',
    stars: r.stargazers_count || 0,
    color: LANG_COLORS[r.language] || PALETTE[0],
  }));

  fs.writeFileSync(
    path.join(outDir, 'constellation.svg'),
    constellationSvg({ nodes })
  );

  fs.writeFileSync(
    path.join(outDir, 'footer.svg'),
    footerSvg({
      text: cfg.footer || 'Thanks for visiting the magical world',
      updated,
    })
  );

  // ---------- RPG layer from magic.mjs ----------
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
      stats: {
        contributions,
        streak: st ? st.current : 0,
        stars: rs.stars,
        repos: game.repos,
      },
    })
  );
  fs.writeFileSync(path.join(outDir, 'achievements.svg'), achievementsSvg(game));

  // ---------- README ----------
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
    featured: renderFeatured(featuredRepos),
    updated,
  };

  fs.writeFileSync(path.join(root, 'README.md'), renderTemplate(tpl, vars, links));
  console.log(
    `Done: ${rs.publicCount} public, ${rs.privateCount ?? 'n/a'} private, ` +
      `${shares.length} languages, ${activity.length} recent events, ` +
      `level ${rpg.level} (${rpg.title}).`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
