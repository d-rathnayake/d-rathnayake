// Gamified layer for the profile: XP, level, class and achievements,
// all computed from real GitHub data. Produces two SVG cards:
//   assets/generated/level.svg         player card with XP bar
//   assets/generated/achievements.svg  achievement wall (locked + unlocked)
// This file has no side effects, so it can be imported safely.

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const num = (n) => Number(n).toLocaleString('en-US');

const FONT = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/* ------------------------------------------------------------ progression */

// XP is earned from real activity. Level L starts at 40 * (L - 1)^2 XP,
// so early levels come quickly and later ones take real effort.
export const xpFor = (level) => 40 * (level - 1) ** 2;

const TITLES = [
  [1, 'Apprentice'],
  [5, 'Journeyman'],
  [10, 'Artisan'],
  [15, 'Wizard'],
  [20, 'Archmage'],
  [30, 'Grand Sorcerer'],
];

const CLASSES = {
  JavaScript: 'Web Sorcerer',
  TypeScript: 'Web Sorcerer',
  HTML: 'Web Sorcerer',
  CSS: 'Web Sorcerer',
  Kotlin: 'Android Mage',
  Java: 'Android Mage',
  Python: 'Data Alchemist',
  Lua: 'Scripting Shaman',
  Go: 'Cloud Warden',
  Rust: 'Systems Smith',
};

export function computeRpg(d) {
  const xp = d.contributions + d.stars * 5 + d.repos * 10 + d.followers * 3 + d.languageCount * 15;
  const level = Math.floor(Math.sqrt(xp / 40)) + 1;
  const floor = xpFor(level);
  const next = xpFor(level + 1);
  const progress = Math.min(1, Math.max(0, (xp - floor) / (next - floor)));
  const title = TITLES.filter(([min]) => level >= min).pop()[1];
  const klass = CLASSES[d.topLang] || 'Code Wanderer';
  return { xp, level, progress, nextXp: next, title, klass };
}

/* ----------------------------------------------------------- achievements */

export const ACHIEVEMENTS = [
  { name: 'First Spark', desc: 'First repo published', shape: 'sparkle', ok: (d) => d.repos >= 1 },
  { name: 'Polyglot', desc: 'Spells in 5+ languages', shape: 'hex', ok: (d) => d.languageCount >= 5 },
  { name: 'Star Collector', desc: '10+ stars earned', shape: 'star', ok: (d) => d.stars >= 10 },
  { name: 'Century Caster', desc: '100+ contributions/yr', shape: 'bolt', ok: (d) => d.contributions >= 100 },
  { name: 'Ember Keeper', desc: '7-day streak', shape: 'flame', ok: (d) => d.longestStreak >= 7 },
  { name: 'Eternal Flame', desc: '30-day streak', shape: 'flame', ok: (d) => d.longestStreak >= 30 },
  { name: 'Open Hand', desc: '10+ pull requests', shape: 'hand', ok: (d) => d.prs >= 10 },
  { name: 'Bug Slayer', desc: '5+ issues opened', shape: 'sword', ok: (d) => d.issues >= 5 },
  { name: 'Community Voice', desc: '10+ followers', shape: 'crown', ok: (d) => d.followers >= 10 },
  { name: 'Archmage', desc: 'Reached level 20', shape: 'orb', ok: (d) => d.level >= 20 },
];

/* ----------------------------------------------------------------- shapes */

// Normalised points in [-1, 1]; the icon is scaled and centred by the caller.
const SHAPE_POINTS = {
  sparkle: [[0, -1], [0.2, -0.2], [1, 0], [0.2, 0.2], [0, 1], [-0.2, 0.2], [-1, 0], [-0.2, -0.2]],
  hex: [[0, -1], [0.87, -0.5], [0.87, 0.5], [0, 1], [-0.87, 0.5], [-0.87, -0.5]],
  star: Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 1 : 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }),
  bolt: [[0.2, -1], [-0.6, 0.15], [-0.05, 0.15], [-0.25, 1], [0.6, -0.2], [0.05, -0.2]],
  flame: [[0, -1], [0.45, -0.25], [0.6, 0.3], [0.3, 0.85], [0, 1], [-0.3, 0.85], [-0.6, 0.3], [-0.45, -0.25]],
  hand: [[-0.7, 0.8], [-0.7, -0.1], [-0.3, -0.1], [-0.3, -0.8], [0, -0.8], [0, -0.1], [0.3, -0.1], [0.3, -0.6], [0.7, -0.6], [0.7, 0.8]],
  sword: [[0, -1], [0.2, 0.2], [0.5, 0.25], [0.5, 0.45], [0.15, 0.45], [0.15, 1], [-0.15, 1], [-0.15, 0.45], [-0.5, 0.45], [-0.5, 0.25], [-0.2, 0.2]],
  crown: [[-1, 0.6], [-0.8, -0.6], [-0.4, 0.1], [0, -0.8], [0.4, 0.1], [0.8, -0.6], [1, 0.6]],
  orb: null, // drawn as a circle
};

function shape(name, cx, cy, s, fill, extra = '') {
  if (name === 'orb') {
    return `<circle cx="${cx}" cy="${cy}" r="${s * 0.95}" fill="${fill}"${extra}/>`;
  }
  const pts = SHAPE_POINTS[name] || SHAPE_POINTS.sparkle;
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(cx + x * s).toFixed(2)},${(cy + y * s).toFixed(2)}`).join(' ') + 'Z';
  return `<path d="${d}" fill="${fill}"${extra}/>`;
}

/* ---------------------------------------------------------- SVG: player */

export function levelSvg({ name, rpg, avatar, topLang, stats }) {
  const W = 900;
  const H = 250;
  const cx = 130;
  const cy = 118;
  const R = 72;
  // Pointy-top hexagon around the avatar.
  const hexPts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + R * Math.cos(a)).toFixed(2)},${(cy + R * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
  const barX = 250;
  const barW = 600;
  const barY = 166;
  const fillW = Math.max(4, barW * rpg.progress);
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const avatarEl = avatar
    ? `<image href="${avatar}" x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" clip-path="url(#hexclip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<polygon points="${hexPts}" fill="#1e1b4b"/><text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="36" font-weight="700" fill="#fff">${esc(initials)}</text>`;

  const chips = [
    ['Contributions', num(stats.contributions)],
    ['Streak', `${stats.streak} d`],
    ['Stars', num(stats.stars)],
    ['Repos', num(stats.repos)],
  ];
  const chipEls = chips
    .map(([label, value], i) => {
      const x = barX + i * 150;
      return `<text x="${x}" y="214" font-size="11" letter-spacing="1.5" fill="#a5b4fc">${esc(label.toUpperCase())}</text>
<text x="${x}" y="234" font-size="17" font-weight="700" fill="#ffffff">${esc(value)}</text>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t" font-family="${FONT}">
<title id="t">Player card for ${esc(name)}: level ${rpg.level}, ${esc(rpg.title)}</title>
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0b0720"/>
    <stop offset="0.6" stop-color="#1e1048"/>
    <stop offset="1" stop-color="#06202e"/>
  </linearGradient>
  <linearGradient id="xp" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#7c3aed"/>
    <stop offset="0.5" stop-color="#f472b6"/>
    <stop offset="1" stop-color="#facc15"/>
  </linearGradient>
  <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
    <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="nameGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#facc15"/>
    <stop offset="1" stop-color="#22d3ee"/>
  </linearGradient>
  <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#facc15"/>
    <stop offset="0.5" stop-color="#f472b6"/>
    <stop offset="1" stop-color="#22d3ee"/>
  </linearGradient>
  <radialGradient id="aura" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#a78bfa" stop-opacity="0.6"/>
    <stop offset="1" stop-color="#a78bfa" stop-opacity="0"/>
  </radialGradient>
  <clipPath id="hexclip"><polygon points="${hexPts}"/></clipPath>
  <clipPath id="barclip"><rect x="${barX}" y="${barY}" width="${fillW.toFixed(1)}" height="18" rx="9"/></clipPath>
</defs>
<style>
  .pulse{animation:pulse 3s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:.45}50%{opacity:1}}
  @media (prefers-reduced-motion: reduce){.pulse{animation:none}}
</style>

<rect width="${W}" height="${H}" rx="24" fill="url(#sky)"/>
<circle cx="${cx}" cy="${cy}" r="120" fill="url(#aura)" class="pulse"/>
<polygon points="${hexPts}" fill="none" stroke="url(#frame)" stroke-width="4" stroke-linejoin="round" transform="translate(${cx} ${cy}) scale(1.08) translate(${-cx} ${-cy})"/>
${avatarEl}
<polygon points="${hexPts}" fill="none" stroke="url(#frame)" stroke-width="3" stroke-linejoin="round"/>

<g>
  <circle cx="${cx + 58}" cy="${cy + 62}" r="22" fill="#0b0720" stroke="url(#frame)" stroke-width="3"/>
  <text x="${cx + 58}" y="${cy + 68}" text-anchor="middle" font-size="18" font-weight="700" fill="#ffffff">${rpg.level}</text>
</g>

<text x="${barX}" y="72" font-size="32" font-weight="700" fill="url(#nameGrad)">${esc(name)}</text>
<text x="${barX}" y="100" font-size="16" font-weight="700" fill="#facc15">${esc(rpg.title)} · ${esc(rpg.klass)}</text>
<text x="${barX}" y="146" font-size="13" fill="#c4b5fd">XP ${num(rpg.xp)} / ${num(rpg.nextXp)} to Level ${rpg.level + 1}  ·  ${Math.round(rpg.progress * 100)}%</text>

<rect x="${barX}" y="${barY}" width="${barW}" height="18" rx="9" fill="#1e1b4b"/>
<rect x="${barX}" y="${barY}" width="${fillW.toFixed(1)}" height="18" rx="9" fill="url(#xp)"/>
<g clip-path="url(#barclip)">
  <rect x="${barX - 300}" y="${barY}" width="${barW + 600}" height="18" fill="url(#shine)">
    <animateTransform attributeName="transform" type="translate" values="0 0;${barW + 300} 0" dur="2.6s" repeatCount="indefinite"/>
  </rect>
</g>

${chipEls}
${shape('sparkle', 860, 44, 10, '#f472b6')}
${shape('sparkle', 840, 200, 6, '#22d3ee')}
</svg>`;
}

/* ---------------------------------------------------- SVG: achievements */

export function achievementsSvg(d) {
  const cols = 5;
  const tw = 164;
  const th = 112;
  const gap = 12;
  const x0 = (900 - (cols * tw + (cols - 1) * gap)) / 2;
  const y0 = 84;
  const rows = Math.ceil(ACHIEVEMENTS.length / cols);
  const H = y0 + rows * th + (rows - 1) * gap + 30;
  const unlocked = ACHIEVEMENTS.filter((a) => a.ok(d)).length;

  const tiles = ACHIEVEMENTS.map((a, i) => {
    const x = x0 + (i % cols) * (tw + gap);
    const y = y0 + Math.floor(i / cols) * (th + gap);
    const ok = a.ok(d);
    const iconColor = ok ? 'url(#unlock)' : '#475569';
    const border = ok ? '#f472b6' : '#334155';
    const lock = ok
      ? ''
      : `<rect x="${x + tw / 2 - 5}" y="${y + 54}" width="10" height="8" rx="2" fill="#64748b"/>
<path d="M${x + tw / 2 - 3},${y + 54} v-3 a3,3 0 0 1 6,0 v3" fill="none" stroke="#64748b" stroke-width="1.5"/>`;
    return `<g${ok ? '' : ' opacity="0.55"'}>
  <rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="16" fill="#ffffff" fill-opacity="${ok ? 0.07 : 0.03}" stroke="${border}" stroke-opacity="${ok ? 0.8 : 0.4}"/>
  ${shape(a.shape, x + tw / 2, y + 36, 15, iconColor)}
  ${ok ? '' : lock}
  <text x="${x + tw / 2}" y="${y + 80}" text-anchor="middle" font-size="13" font-weight="700" fill="#ffffff">${esc(a.name)}</text>
  <text x="${x + tw / 2}" y="${y + 98}" text-anchor="middle" font-size="10.5" fill="#c4b5fd">${esc(a.desc)}</text>
</g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 ${H}" width="900" height="${H}" role="img" aria-labelledby="t" font-family="${FONT}">
<title id="t">Achievements: ${unlocked} of ${ACHIEVEMENTS.length} unlocked</title>
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0b0720"/>
    <stop offset="1" stop-color="#1e1048"/>
  </linearGradient>
  <linearGradient id="unlock" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#facc15"/>
    <stop offset="0.5" stop-color="#f472b6"/>
    <stop offset="1" stop-color="#22d3ee"/>
  </linearGradient>
</defs>
<rect width="900" height="${H}" rx="24" fill="url(#sky)"/>
<text x="24" y="44" font-size="22" font-weight="700" fill="#ffffff">✦ Achievements</text>
<text x="24" y="66" font-size="12.5" fill="#c4b5fd">${unlocked} of ${ACHIEVEMENTS.length} unlocked. Every achievement is earned from real activity.</text>
<text x="${900 - 24}" y="44" font-size="22" font-weight="700" text-anchor="end" fill="#facc15">${unlocked}/${ACHIEVEMENTS.length}</text>
${tiles.join('\n')}
</svg>`;
}
