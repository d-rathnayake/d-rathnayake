// Premium animated SVG scenes for the profile README.
// Pure functions, no side effects: they take data and return SVG strings.
//
// Techniques used (all work inside <img> on GitHub, no JavaScript needed):
//   - feTurbulence nebula clouds with colour matrices and screen blending
//   - three-layer parallax star field with seamless looping drift
//   - magic circle with rotating rune ring, hexagram and tick marks
//   - gradient shimmer sweeping across text (animated gradient stops)
//   - comet of light travelling around the card border (stroke-dashoffset)
//   - 3D-looking elliptical orbits (scale and opacity follow orbit phase)
//   - data driven contribution sky with streak constellations
//   - animated "draw-in" project constellation
//   - layered sine waves morphing with SMIL path animation

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const FONT = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

export function seeded(seed = 7) {
  let s = seed;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

const r1 = (n) => Number(n.toFixed(1));
const r2 = (n) => Number(n.toFixed(2));

// Four-point sparkle centred on (x, y).
export const sparkle = (x, y, r, fill, extra = '') => {
  const k = r * 0.2;
  return `<path d="M${x},${y - r} L${x + k},${y - k} L${x + r},${y} L${x + k},${y + k} L${x},${y + r} L${x - k},${y + k} L${x - r},${y} L${x - k},${y - k} Z" fill="${fill}"${extra}/>`;
};

// Full circle path starting on the left; clockwise or counter-clockwise on screen.
const ellipsePath = (cx, cy, rx, ry, clockwise = false) =>
  clockwise
    ? `M${cx - rx},${cy} a${rx},${ry} 0 1,1 ${2 * rx},0 a${rx},${ry} 0 1,1 ${-2 * rx},0`
    : `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0`;

const REDUCE = '@media (prefers-reduced-motion: reduce){*{animation:none!important}}';

// Shared nebula filter definitions (fractal noise coloured via feColorMatrix).
export const nebulaFilter = (id, seed, freq, rgb, k = 2.4, off = -0.95) => `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${seed}" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 ${rgb[0]}  0 0 0 0 ${rgb[1]}  0 0 0 0 ${rgb[2]}  ${k} 0 0 0 ${off}"/>
  </filter>`;

// Parallax star layer: 2 copies side by side so the drift loops seamlessly.
export function starLayer(W, H, count, rMin, rMax, dur, seed, opacity, twinkleShare = 0.3) {
  const rnd = seeded(seed);
  const stars = Array.from({ length: count }, () => {
    const x = r1(rnd() * W);
    const y = r1(rnd() * H);
    const r = r2(rMin + rnd() * (rMax - rMin));
    const tw = rnd() < twinkleShare;
    const style = tw ? ` class="tw" style="animation-duration:${r1(2 + rnd() * 3)}s;animation-delay:-${r1(rnd() * 4)}s"` : '';
    return `<circle cx="${x}" cy="${y}" r="${r}"${style}/>`;
  }).join('');
  return `<g fill="#ffffff" opacity="${opacity}">
  <g>
    <animateTransform attributeName="transform" type="translate" from="0 0" to="${-W} 0" dur="${dur}s" repeatCount="indefinite"/>
    <g>${stars}</g>
    <g transform="translate(${W} 0)">${stars}</g>
  </g>
</g>`;
}

export function shootingStar(id, x0, y0, dx, dy, period, delay) {
  const len = 90;
  const ang = Math.atan2(dy, dx);
  const tx = -Math.cos(ang) * len;
  const ty = -Math.sin(ang) * len;
  return `<g opacity="0">
  <animateTransform attributeName="transform" type="translate" values="${x0} ${y0};${x0 + dx} ${y0 + dy};${x0 + dx} ${y0 + dy}" keyTimes="0;0.13;1" dur="${period}s" begin="${delay}s" repeatCount="indefinite"/>
  <animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.03;0.13;1" dur="${period}s" begin="${delay}s" repeatCount="indefinite"/>
  <line x1="0" y1="0" x2="${r1(tx)}" y2="${r1(ty)}" stroke="url(#${id})" stroke-width="2" stroke-linecap="round"/>
  <circle r="2.2" fill="#ffffff"/>
</g>`;
}

/* ================================================================ HEADER */

export function headerSvg({
  headline = 'Welcome To Magical World',
  name = 'Dilshan Rathnayake',
  roles = ['Web Developer', 'App Developer'],
  avatar = null,
  chips = ['WEB', 'ANDROID', 'UI/UX', 'FIREBASE'],
  tagline = 'CODE · CREATE · CONJURE',
  location = 'SRI LANKA',
} = {}) {
  const W = 900;
  const H = 400;
  const cx = 190;
  const cy = 192;
  const list = roles.length ? roles : ['Developer'];
  const n = list.length;
  const D = 3;
  const T = n * D;
  const vis = 100 / n;
  const animated = n > 1;

  // Name layout
  const parts = name.trim().split(/\s+/);
  const line1 = parts[0] || name;
  const line2 = parts.slice(1).join(' ');
  const maxLen = Math.max(line1.length, line2.length, 6);
  const size = Math.min(66, Math.floor(500 / (maxLen * 0.6)));

  // Rune ring: characters placed by angle so spacing never depends on the font.
  const runeText = 'WEB · APP · UI · MAGIC · CODE · CREATE · DESIGN · ';
  const steps = runeText.length * 2;
  const ring = Array.from({ length: steps }, (_, i) => runeText[i % runeText.length]);
  const runes = ring
    .map((ch, i) => {
      if (ch === ' ') return '';
      return `<text transform="rotate(${r2((360 / steps) * i)} ${cx} ${cy})" x="${cx}" y="${cy - 138}" text-anchor="middle">${esc(ch)}</text>`;
    })
    .join('');

  // Hexagram (two triangles)
  const tri = (rot) =>
    Array.from({ length: 3 }, (_, i) => {
      const a = ((rot + i * 120) * Math.PI) / 180;
      return `${r2(cx + 116 * Math.cos(a))},${r2(cy + 116 * Math.sin(a))}`;
    }).join(' ');

  // 72 tick marks on a circle (dash pattern tuned to circumference)
  const tickR = 124;
  const circ = 2 * Math.PI * tickR;
  const tickDash = `1.4 ${r2(circ / 90 - 1.4)}`;

  // God rays
  const rays = Array.from({ length: 14 }, (_, i) => {
    const w = i % 2 ? 10 : 18;
    return `<polygon points="${cx},${cy} ${cx - w},${cy - 360} ${cx + w},${cy - 360}" transform="rotate(${r2((360 / 14) * i)} ${cx} ${cy})" fill="url(#rayGrad)"/>`;
  }).join('');

  // Fireflies
  const rnd = seeded(23);
  const fireflies = Array.from({ length: 16 }, () => {
    const x = r1(40 + rnd() * 820);
    const y = r1(40 + rnd() * 300);
    const dx = r1((rnd() - 0.5) * 70);
    const dy = r1((rnd() - 0.5) * 50);
    const dur = r1(9 + rnd() * 9);
    const col = ['#fde68a', '#a5f3fc', '#f9a8d4', '#c4b5fd'][Math.floor(rnd() * 4)];
    const rr = r1(3 + rnd() * 3);
    return `<g>
  <circle r="${rr}" fill="${col}" opacity="0.9"/>
  <circle r="${r1(rr * 3)}" fill="url(#ffGlow)" opacity="0.55"/>
  <animateMotion dur="${dur}s" begin="-${r1(rnd() * dur)}s" repeatCount="indefinite" path="M${x},${y} q${dx},${-Math.abs(dy)} ${r1(dx * 1.6)},${dy} t${r1(-dx * 1.6)},${r1(-dy)}"/>
  <animate attributeName="opacity" values="0.25;1;0.25" dur="${r1(3 + rnd() * 3)}s" repeatCount="indefinite"/>
</g>`;
  }).join('');

  const avatarEl = avatar
    ? `<image href="${avatar}" x="${cx - 84}" y="${cy - 84}" width="168" height="168" clip-path="url(#avclip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${cx}" cy="${cy}" r="84" fill="#1e1b4b"/>
  <text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="58" font-weight="700" fill="#ffffff">${esc(
      name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    )}</text>`;

  // Role pill text, cycling
  const roleEls = list
    .map((r, i) => {
      const cls = animated ? `role${i === 0 ? ' role0' : ''}` : 'role role0';
      const style = animated ? ` style="animation-delay:${i * D}s"` : '';
      return `<text class="${cls}" x="424" y="283"${style}>${esc(r)}</text>`;
    })
    .join('\n  ');

  // Chips
  const chipColors = ['#a78bfa', '#34d399', '#f472b6', '#fbbf24', '#22d3ee', '#fb923c'];
  let chipX = 380;
  const chipEls = chips
    .map((c, i) => {
      const w = Math.round(40 + c.length * 9);
      const col = chipColors[i % chipColors.length];
      const el = `<g>
  <rect x="${chipX}" y="304" width="${w}" height="28" rx="14" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-opacity="0.65"/>
  <circle cx="${chipX + 14}" cy="318" r="3" fill="${col}"><animate attributeName="opacity" values="0.4;1;0.4" dur="${r1(2 + i * 0.4)}s" repeatCount="indefinite"/></circle>
  <text x="${chipX + 24}" y="322.5" font-size="11.5" font-weight="700" letter-spacing="1.4" fill="#ffffff">${esc(c)}</text>
</g>`;
      chipX += w + 10;
      return el;
    })
    .join('\n');

  const css = `<style>
  .tw{animation:tw 3s ease-in-out infinite}
  @keyframes tw{0%,100%{opacity:.2}50%{opacity:1}}
  .role{font-size:18px;font-weight:600;fill:#f5f3ff;opacity:${animated ? 0 : 1};${animated ? `animation:cyc ${T}s infinite` : ''}}
  ${animated ? `@keyframes cyc{0%{opacity:0;transform:translateY(8px)}3%{opacity:1;transform:translateY(0)}${r2(vis - 3)}%{opacity:1;transform:translateY(0)}${r2(vis)}%{opacity:0;transform:translateY(-8px)}100%{opacity:0}}` : ''}
  .rune{font:700 11px ${MONO};fill:#c4b5fd;letter-spacing:0}
  ${REDUCE}
  @media (prefers-reduced-motion: reduce){.role{opacity:0}.role0{opacity:1}}
</style>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d" font-family="${FONT}">
<title id="t">${esc(name)} - ${esc(headline)}</title>
<desc id="d">Animated header: a magic circle around the profile picture, drifting stars, and ${esc(list.join(', '))}.</desc>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#05030f"/><stop offset="0.5" stop-color="#150a36"/><stop offset="1" stop-color="#04141f"/>
  </linearGradient>
  ${nebulaFilter('nebA', 4, '0.006 0.011', [0.52, 0.25, 1.0])}
  ${nebulaFilter('nebB', 9, '0.008 0.006', [0.1, 0.78, 0.85], 2.3, -0.98)}
  ${nebulaFilter('nebC', 17, '0.007 0.009', [1.0, 0.3, 0.62], 2.2, -1.0)}
  <radialGradient id="ffGlow"><stop offset="0" stop-color="#ffffff" stop-opacity="0.8"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  <radialGradient id="aura" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.75"/><stop offset="0.6" stop-color="#6d28d9" stop-opacity="0.25"/><stop offset="1" stop-color="#6d28d9" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="rayGrad" gradientUnits="userSpaceOnUse" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 360}">
    <stop offset="0" stop-color="#c4b5fd" stop-opacity="0.35"/><stop offset="1" stop-color="#c4b5fd" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fbbf24"/><stop offset="0.5" stop-color="#f472b6"/><stop offset="1" stop-color="#22d3ee"/>
  </linearGradient>
  <linearGradient id="hex" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#f472b6"/>
  </linearGradient>
  <linearGradient id="shimGold" x1="-1" y1="0" x2="0" y2="0">
    <animate attributeName="x1" values="-1;1.2" dur="4.5s" repeatCount="indefinite"/>
    <animate attributeName="x2" values="0;2.2" dur="4.5s" repeatCount="indefinite"/>
    <stop offset="0" stop-color="#fbbf24"/><stop offset="0.44" stop-color="#fbbf24"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="0.56" stop-color="#fbbf24"/><stop offset="1" stop-color="#fbbf24"/>
  </linearGradient>
  <linearGradient id="shimName1" x1="-1" y1="0" x2="0" y2="0">
    <animate attributeName="x1" values="-1;1.2" dur="5.5s" begin="0.6s" repeatCount="indefinite"/>
    <animate attributeName="x2" values="0;2.2" dur="5.5s" begin="0.6s" repeatCount="indefinite"/>
    <stop offset="0" stop-color="#f5f3ff"/><stop offset="0.45" stop-color="#e9d5ff"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="0.55" stop-color="#e9d5ff"/><stop offset="1" stop-color="#f5f3ff"/>
  </linearGradient>
  <linearGradient id="shimName2" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#fbbf24"/><stop offset="0.45" stop-color="#f472b6"/><stop offset="1" stop-color="#22d3ee"/>
  </linearGradient>
  <linearGradient id="shine" x1="-1" y1="0" x2="0" y2="0">
    <animate attributeName="x1" values="-1;1.2" dur="5.5s" begin="0.6s" repeatCount="indefinite"/>
    <animate attributeName="x2" values="0;2.2" dur="5.5s" begin="0.6s" repeatCount="indefinite"/>
    <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.85"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="tail" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity="1"/>
  </linearGradient>
  <linearGradient id="comet" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#22d3ee"/><stop offset="0.5" stop-color="#f472b6"/><stop offset="1" stop-color="#fbbf24"/>
  </linearGradient>
  <linearGradient id="wave1" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#7c3aed" stop-opacity="0.55"/><stop offset="0.5" stop-color="#22d3ee" stop-opacity="0.45"/><stop offset="1" stop-color="#f472b6" stop-opacity="0.55"/>
  </linearGradient>
  <clipPath id="card"><rect width="${W}" height="${H}" rx="28"/></clipPath>
  <clipPath id="avclip"><circle cx="${cx}" cy="${cy}" r="84"/></clipPath>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter>
</defs>
${css}

<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <g style="mix-blend-mode:screen">
    <g opacity="0.55"><animateTransform attributeName="transform" type="translate" values="0 0;-60 10;0 0" dur="40s" repeatCount="indefinite"/><rect x="-120" y="-60" width="1140" height="520" filter="url(#nebA)"/></g>
    <g opacity="0.38"><animateTransform attributeName="transform" type="translate" values="0 0;50 -14;0 0" dur="55s" repeatCount="indefinite"/><rect x="-120" y="-60" width="1140" height="520" filter="url(#nebB)"/></g>
    <g opacity="0.3"><animateTransform attributeName="transform" type="translate" values="0 0;-30 18;0 0" dur="70s" repeatCount="indefinite"/><rect x="-120" y="-60" width="1140" height="520" filter="url(#nebC)"/></g>
  </g>

  ${starLayer(W, H, 70, 0.4, 0.9, 120, 3, 0.7)}
  ${starLayer(W, H, 34, 0.8, 1.4, 70, 5, 0.85)}
  ${starLayer(W, H, 14, 1.3, 2.1, 38, 8, 1, 0.5)}

  <g opacity="0.4">
    <animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="150s" repeatCount="indefinite"/>
    ${rays}
  </g>

  ${shootingStar('tail', 520, 30, 330, 120, 9, 1.5)}
  ${shootingStar('tail', 820, 60, -300, 150, 13, 6)}

  ${fireflies}

  <!-- Magic circle -->
  <circle cx="${cx}" cy="${cy}" r="170" fill="url(#aura)">
    <animate attributeName="r" values="162;178;162" dur="5s" repeatCount="indefinite"/>
  </circle>
  <circle cx="${cx}" cy="${cy}" r="152" fill="none" stroke="#c4b5fd" stroke-opacity="0.22"/>
  <circle cx="${cx}" cy="${cy}" r="${tickR}" fill="none" stroke="#e9d5ff" stroke-opacity="0.55" stroke-width="7" stroke-dasharray="${tickDash}"/>
  <g class="rune" fill="#c4b5fd">
    <animateTransform attributeName="transform" type="rotate" from="360 ${cx} ${cy}" to="0 ${cx} ${cy}" dur="90s" repeatCount="indefinite"/>
    ${runes}
  </g>
  <g>
    <animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="48s" repeatCount="indefinite"/>
    <polygon points="${tri(-90)}" fill="none" stroke="url(#hex)" stroke-width="1.2" stroke-opacity="0.55" stroke-linejoin="round"/>
    <polygon points="${tri(90)}" fill="none" stroke="url(#hex)" stroke-width="1.2" stroke-opacity="0.55" stroke-linejoin="round"/>
  </g>
  <g>
    <animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="-360 ${cx} ${cy}" dur="26s" repeatCount="indefinite"/>
    <circle cx="${cx}" cy="${cy}" r="98" fill="none" stroke="url(#rim)" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3 9"/>
  </g>
  <circle r="5" fill="#fbbf24"><animateMotion dur="11s" repeatCount="indefinite" path="${ellipsePath(cx, cy, 152, 152, true)}"/></circle>
  <circle r="3.4" fill="#22d3ee"><animateMotion dur="17s" repeatCount="indefinite" path="${ellipsePath(cx, cy, 152, 152, false)}"/></circle>
  <circle r="3" fill="#f472b6"><animateMotion dur="23s" begin="-7s" repeatCount="indefinite" path="${ellipsePath(cx, cy, 152, 152, true)}"/></circle>

  ${avatarEl}
  <circle cx="${cx}" cy="${cy}" r="86" fill="none" stroke="url(#rim)" stroke-width="3.5"/>
  <circle cx="${cx}" cy="${cy}" r="90" fill="none" stroke="#ffffff" stroke-opacity="0.12"/>

  <!-- Glass panel -->
  <rect x="362" y="52" width="506" height="296" rx="26" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.1"/>
  <rect x="362" y="52" width="506" height="296" rx="26" fill="none" stroke="url(#rim)" stroke-opacity="0.18"/>

  <!-- Kicker -->
  ${sparkle(386, 87, 7, '#fbbf24')}
  <text x="402" y="92" font-size="13" font-weight="700" letter-spacing="4.5" fill="url(#shimGold)">${esc(headline.toUpperCase())}</text>

  <!-- Name -->
  <text x="380" y="${line2 ? 160 : 175}" font-size="${size}" font-weight="800" fill="#c026d3" opacity="0.55" filter="url(#glow)">${esc(line1)}</text>
  <text x="380" y="${line2 ? 160 : 175}" font-size="${size}" font-weight="800" fill="url(#shimName1)">${esc(line1)}</text>
  ${
    line2
      ? `<text x="380" y="${160 + Math.round(size * 0.98)}" font-size="${size}" font-weight="800" fill="#22d3ee" opacity="0.4" filter="url(#glow)">${esc(line2)}</text>
  <text x="380" y="${160 + Math.round(size * 0.98)}" font-size="${size}" font-weight="800" fill="url(#shimName2)">${esc(line2)}</text>`
      : ''
  }

  <!-- Role pill -->
  <rect x="380" y="256" width="360" height="38" rx="19" fill="#0b0720" fill-opacity="0.55" stroke="url(#rim)" stroke-opacity="0.55"/>
  <circle cx="404" cy="275" r="4.5" fill="#34d399"><animate attributeName="opacity" values="1;0.35;1" dur="1.8s" repeatCount="indefinite"/></circle>
  ${roleEls}

  <!-- Chips -->
  ${chipEls}

  <text x="380" y="372" font-size="11" letter-spacing="5" fill="#a5b4fc" fill-opacity="0.85">${esc(tagline)}</text>
  ${location ? `<text x="${W - 32}" y="${H - 22}" font-size="10.5" letter-spacing="3" text-anchor="end" fill="#c4b5fd" fill-opacity="0.8">${esc(location)}</text>` : ''}

  <!-- Waves -->
  <path fill="url(#wave1)" opacity="0.5">
    <animate attributeName="d" dur="9s" repeatCount="indefinite" values="M0,386 C150,372 300,400 450,386 C600,372 750,400 900,386 L900,400 L0,400 Z;M0,386 C150,400 300,372 450,386 C600,400 750,372 900,386 L900,400 L0,400 Z;M0,386 C150,372 300,400 450,386 C600,372 750,400 900,386 L900,400 L0,400 Z"/>
  </path>
  <path fill="url(#wave1)" opacity="0.35">
    <animate attributeName="d" dur="13s" repeatCount="indefinite" values="M0,392 C200,380 350,402 520,392 C680,382 800,402 900,392 L900,400 L0,400 Z;M0,392 C200,404 350,382 520,392 C680,402 800,382 900,392 L900,400 L0,400 Z;M0,392 C200,380 350,402 520,392 C680,382 800,402 900,392 L900,400 L0,400 Z"/>
  </path>
</g>

<!-- Border + travelling comet -->
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="27" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1.5"/>
<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="27" fill="none" stroke="url(#comet)" stroke-width="5" stroke-linecap="round" pathLength="1000" stroke-dasharray="110 890" opacity="0.55" filter="url(#softGlow)">
  <animate attributeName="stroke-dashoffset" from="0" to="-1000" dur="8s" repeatCount="indefinite"/>
</rect>
<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="27" fill="none" stroke="url(#comet)" stroke-width="2.4" stroke-linecap="round" pathLength="1000" stroke-dasharray="110 890">
  <animate attributeName="stroke-dashoffset" from="0" to="-1000" dur="8s" repeatCount="indefinite"/>
</rect>
</svg>`;
}

/* =================================================================== utils */

export const hex2rgb = (h) => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};
export const mixHex = (a, b, t) => {
  const A = hex2rgb(a);
  const B = hex2rgb(b);
  return '#' + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, '0')).join('');
};

// Lift very dark colours (e.g. Lua navy) so text and glows stay readable on dark cards.
export function brighten(hex, minLum = 0.42) {
  let c = hex;
  for (let i = 0; i < 6; i++) {
    const [r, g, b] = hex2rgb(c);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum >= minLum) break;
    c = mixHex(c, '#ffffff', 0.22);
  }
  return c;
}

export function wrapText(text, max, maxLines = 2) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim();
    else {
      if (cur) lines.push(cur);
      cur = w.length > max ? w.slice(0, max - 1) + '…' : w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    kept[maxLines - 1] = (last.length > max - 1 ? last.slice(0, max - 1) : last).replace(/[ ,.;:]+$/, '') + '…';
    return kept;
  }
  return lines;
}

// Shared header block for the section cards (title + subtitle + accent bar).
const cardTitle = (W, title, subtitle) => `<text x="28" y="46" font-size="22" font-weight="700" fill="#ffffff">${esc(title)}</text>
<text x="28" y="68" font-size="12.5" fill="#c4b5fd">${esc(subtitle)}</text>
<rect x="${W - 28 - 150}" y="38" width="150" height="3" rx="1.5" fill="url(#bar)"/>`;

const commonDefs = (W, H) => `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#05030f"/><stop offset="0.55" stop-color="#150a36"/><stop offset="1" stop-color="#04141f"/>
  </linearGradient>
  <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#fbbf24"/><stop offset="0.5" stop-color="#f472b6"/><stop offset="1" stop-color="#22d3ee"/>
  </linearGradient>
  <linearGradient id="tail" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity="1"/>
  </linearGradient>
  <clipPath id="card"><rect width="${W}" height="${H}" rx="28"/></clipPath>`;

const baseCss = `<style>
  .tw{animation:tw 3s ease-in-out infinite}
  @keyframes tw{0%,100%{opacity:.2}50%{opacity:1}}
  ${REDUCE}
</style>`;

const borderRect = (W, H) => `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="27" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1.5"/>`;

/* ========================================================== SKILL UNIVERSE */

const SKILLS = {
  html: ['HTML', '#e34c26', 'H5'], css: ['CSS', '#2965f1', 'C3'], js: ['JavaScript', '#f7df1e', 'JS', true],
  ts: ['TypeScript', '#3178c6', 'TS'], react: ['React', '#61dafb', 'Re', true], nextjs: ['Next.js', '#9ca3af', 'Nx'],
  tailwind: ['Tailwind', '#38bdf8', 'Tw', true], kotlin: ['Kotlin', '#a97bff', 'Kt'], android: ['Android', '#3ddc84', 'An', true],
  firebase: ['Firebase', '#ffca28', 'Fb', true], github: ['GitHub', '#8b949e', 'GH'], git: ['Git', '#f05032', 'Git'],
  vscode: ['VS Code', '#007acc', 'VS'], figma: ['Figma', '#f24e1e', 'Fg'], python: ['Python', '#3776ab', 'Py'],
  nodejs: ['Node.js', '#6cc24a', 'Nd', true], java: ['Java', '#e76f00', 'Jv'], php: ['PHP', '#777bb4', 'PHP'],
  lua: ['Lua', '#2c2d72', 'Lua'], mysql: ['MySQL', '#4479a1', 'SQL'], mongodb: ['MongoDB', '#47a248', 'Mg'],
  docker: ['Docker', '#2496ed', 'Dk'], linux: ['Linux', '#fcc624', 'Lx', true], flutter: ['Flutter', '#02569b', 'Fl'],
  dart: ['Dart', '#00b4ab', 'Da', true], vue: ['Vue', '#41b883', 'Vu', true], svelte: ['Svelte', '#ff3e00', 'Sv'],
  cloudflare: ['Cloudflare', '#f38020', 'CF', true], vercel: ['Vercel', '#6b7280', 'Vc'], npm: ['npm', '#cb3837', 'npm'],
};
const FALLBACK = ['#a78bfa', '#22d3ee', '#f472b6', '#fbbf24', '#34d399', '#fb923c'];

export function skillsSvg({ skills = [], avatar = null, name = 'Shana' } = {}) {
  const W = 900;
  const H = 460;
  const cx = 450;
  const cy = 256;

  const items = skills.map((id, i) => {
    const k = SKILLS[id.toLowerCase()];
    return k
      ? { id, name: k[0], color: k[1], tag: k[2], dark: Boolean(k[3]) }
      : { id, name: id.charAt(0).toUpperCase() + id.slice(1), color: FALLBACK[i % FALLBACK.length], tag: id.slice(0, 2).toUpperCase(), dark: false };
  });

  // Split planets across three orbits.
  const rings = [
    { rx: 150, ry: 52, dur: 28, dir: 1 },
    { rx: 272, ry: 92, dur: 44, dir: -1 },
    { rx: 392, ry: 130, dur: 64, dir: 1 },
  ];
  const n = items.length;
  let counts;
  if (n <= 3) counts = [0, n, 0];
  else {
    const a = Math.max(1, Math.round(n * 0.25));
    const b = Math.max(1, Math.round(n * 0.35));
    counts = [a, b, Math.max(0, n - a - b)];
  }
  let cursor = 0;
  const planets = [];
  const grads = [];
  rings.forEach((ring, ri) => {
    const c = counts[ri];
    for (let k = 0; k < c; k++) {
      const it = items[cursor++];
      const gid = `pl${cursor}`;
      grads.push(`<radialGradient id="${gid}" cx="34%" cy="28%" r="78%">
    <stop offset="0" stop-color="${mixHex(it.color, '#ffffff', 0.55)}"/>
    <stop offset="0.5" stop-color="${it.color}"/>
    <stop offset="1" stop-color="${mixHex(it.color, '#000000', 0.55)}"/>
  </radialGradient>`);
      const begin = `-${r1((ring.dur * k) / c)}s`;
      const cw = ring.dir === -1; // clockwise path passes the back first
      const path = ellipsePath(cx, cy, ring.rx, ring.ry, cw);
      const scale = cw ? '1;0.72;1;1.22;1' : '1;1.22;1;0.72;1';
      const opac = cw ? '0.95;0.6;0.95;1;0.95' : '0.95;1;0.95;0.6;0.95';
      const spl = 'calcMode="spline" keySplines="0.37 0 0.63 1;0.37 0 0.63 1;0.37 0 0.63 1;0.37 0 0.63 1" keyTimes="0;0.25;0.5;0.75;1"';
      planets.push(`<g>
  <animateMotion dur="${ring.dur}s" begin="${begin}" repeatCount="indefinite" path="${path}"/>
  <g>
    <animateTransform attributeName="transform" type="scale" values="${scale}" ${spl} dur="${ring.dur}s" begin="${begin}" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="${opac}" ${spl} dur="${ring.dur}s" begin="${begin}" repeatCount="indefinite"/>
    <circle r="27" fill="${it.color}" opacity="0.18"/>
    <circle r="21" fill="url(#${gid})"/>
    <circle r="21" fill="none" stroke="#ffffff" stroke-opacity="0.28"/>
    <text y="4.5" text-anchor="middle" font-size="${it.tag.length > 2 ? 10 : 12}" font-weight="800" fill="${it.dark ? '#0b0720' : '#ffffff'}">${esc(it.tag)}</text>
    <text y="40" text-anchor="middle" font-size="10.5" font-weight="600" fill="#f5f3ff" stroke="#0b0720" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${esc(it.name)}</text>
  </g>
</g>`);
    }
  });

  const orbitEls = rings
    .map(
      (r, i) => `<ellipse cx="${cx}" cy="${cy}" rx="${r.rx}" ry="${r.ry}" fill="none" stroke="#c4b5fd" stroke-opacity="0.07" stroke-width="6"/>
<ellipse cx="${cx}" cy="${cy}" rx="${r.rx}" ry="${r.ry}" fill="none" stroke="#c4b5fd" stroke-opacity="0.4" stroke-dasharray="2 8">
  <animate attributeName="stroke-dashoffset" from="0" to="${i % 2 ? 40 : -40}" dur="${6 + i * 2}s" repeatCount="indefinite"/>
</ellipse>`
    )
    .join('\n');

  const burst = Array.from({ length: 8 }, (_, i) => `<polygon points="${cx},${cy - 78} ${cx + 6},${cy - 30} ${cx - 6},${cy - 30}" transform="rotate(${i * 45} ${cx} ${cy})" fill="#fbbf24" opacity="${i % 2 ? 0.35 : 0.6}"/>`).join('');

  const core = avatar
    ? `<image href="${avatar}" x="${cx - 40}" y="${cy - 40}" width="80" height="80" clip-path="url(#coreclip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${cx}" cy="${cy}" r="40" fill="#1e1b4b"/><text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="28" font-weight="800" fill="#ffffff">${esc(name.slice(0, 2).toUpperCase())}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t" font-family="${FONT}">
<title id="t">Skill universe: ${esc(items.map((i) => i.name).join(', '))}</title>
<defs>
  ${commonDefs(W, H)}
  ${nebulaFilter('nebA', 6, '0.006 0.01', [0.45, 0.22, 0.95])}
  ${nebulaFilter('nebB', 13, '0.008 0.007', [0.1, 0.7, 0.8], 2.3, -0.98)}
  <radialGradient id="sun" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#fbbf24" stop-opacity="0.85"/><stop offset="0.45" stop-color="#f472b6" stop-opacity="0.35"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fbbf24"/><stop offset="0.5" stop-color="#f472b6"/><stop offset="1" stop-color="#22d3ee"/>
  </linearGradient>
  <clipPath id="coreclip"><circle cx="${cx}" cy="${cy}" r="40"/></clipPath>
  ${grads.join('\n  ')}
</defs>
${baseCss}
<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g style="mix-blend-mode:screen">
    <g opacity="0.5"><animateTransform attributeName="transform" type="translate" values="0 0;-50 8;0 0" dur="45s" repeatCount="indefinite"/><rect x="-120" y="-60" width="1140" height="580" filter="url(#nebA)"/></g>
    <g opacity="0.32"><animateTransform attributeName="transform" type="translate" values="0 0;40 -10;0 0" dur="60s" repeatCount="indefinite"/><rect x="-120" y="-60" width="1140" height="580" filter="url(#nebB)"/></g>
  </g>
  ${starLayer(W, H, 70, 0.4, 0.9, 130, 31, 0.7)}
  ${starLayer(W, H, 26, 0.8, 1.5, 75, 37, 0.9, 0.5)}
  ${cardTitle(W, '✦ Skill Universe', 'The tools I use to build magic. Each planet orbits the core.')}
  ${orbitEls}
  <circle cx="${cx}" cy="${cy}" r="96" fill="url(#sun)"><animate attributeName="r" values="88;104;88" dur="4.5s" repeatCount="indefinite"/></circle>
  <g><animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="40s" repeatCount="indefinite"/>${burst}</g>
  ${core}
  <circle cx="${cx}" cy="${cy}" r="42" fill="none" stroke="url(#rim)" stroke-width="3"/>
  ${planets.join('\n')}
  ${shootingStar('tail', 120, 90, 300, 110, 11, 2)}
</g>
${borderRect(W, H)}
</svg>`;
}

/* ============================================================ CONTRIBUTION SKY */

export function skySvg({ days = [], total = 0, longest = 0, current = 0, updated = '' } = {}) {
  const W = 900;
  const H = 296;
  const left = 30;
  const top = 100;
  const pitch = (W - left * 2) / 53;

  const max = days.reduce((m, d) => Math.max(m, d.count), 0);
  const level = (c) => {
    if (c <= 0) return 0;
    if (max <= 4) return Math.min(4, c);
    const q = c / max;
    return q <= 0.25 ? 1 : q <= 0.5 ? 2 : q <= 0.75 ? 3 : 4;
  };
  const COLORS = ['#ffffff', '#8b5cf6', '#e879f9', '#fbbf24', '#fff7d6'];

  // Map each day to a grid position (column = week, row = weekday).
  const pos = [];
  let col = 0;
  days.forEach((d, i) => {
    const dow = new Date(d.date + 'T00:00:00Z').getUTCDay();
    if (i > 0 && dow === 0) col++;
    pos.push({ col, row: dow, lvl: level(d.count), count: d.count, date: d.date });
  });
  const px = (p) => r1(left + p.col * pitch + pitch / 2);
  const py = (p) => r1(top + p.row * pitch + pitch / 2);

  const dots = [];
  const links = [];
  const rnd = seeded(5);
  pos.forEach((p, i) => {
    const x = px(p);
    const y = py(p);
    const tw = p.lvl >= 3 ? ` class="tw" style="animation-duration:${r1(2.2 + rnd() * 3)}s;animation-delay:-${r1(rnd() * 4)}s"` : '';
    if (p.lvl === 0) dots.push(`<circle cx="${x}" cy="${y}" r="1.1" fill="#ffffff" opacity="0.13"/>`);
    else if (p.lvl === 1) dots.push(`<circle cx="${x}" cy="${y}" r="2" fill="${COLORS[1]}" opacity="0.85"/>`);
    else if (p.lvl === 2) dots.push(`<circle cx="${x}" cy="${y}" r="2.9" fill="${COLORS[2]}"${tw}/>`);
    else if (p.lvl === 3) dots.push(`<g${tw}><circle cx="${x}" cy="${y}" r="7" fill="url(#starGlow)"/>${sparkle(x, y, 4.6, COLORS[3])}</g>`);
    else dots.push(`<g${tw}><circle cx="${x}" cy="${y}" r="10" fill="url(#starGlow)"/>${sparkle(x, y, 7, COLORS[4])}</g>`);

    const nx = pos[i + 1];
    if (nx && p.lvl > 0 && nx.lvl > 0 && nx.col === p.col) links.push(`M${x},${y} L${px(nx)},${py(nx)}`);
    const right = pos[i + 7];
    if (right && p.lvl >= 2 && right.lvl >= 2 && right.row === p.row) links.push(`M${x},${y} L${px(right)},${py(right)}`);
  });

  // Month labels
  const months = [];
  let lastMonth = -1;
  let lastCol = -10;
  pos.forEach((p) => {
    const m = Number(p.date.slice(5, 7));
    if (m !== lastMonth && p.col - lastCol >= 3 && p.row <= 3) {
      months.push(`<text x="${r1(left + p.col * pitch)}" y="92" font-size="10.5" fill="#a5b4fc">${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}</text>`);
      lastMonth = m;
      lastCol = p.col;
    }
  });

  const empty = !days.length;
  const footerY = top + 7 * pitch + 30;
  const stat = (label, value, x) => `<text x="${x}" y="${footerY}" font-size="10.5" letter-spacing="1.4" fill="#a5b4fc">${esc(label.toUpperCase())}</text>
<text x="${x}" y="${footerY + 22}" font-size="18" font-weight="700" fill="#ffffff">${esc(value)}</text>`;

  const legend = [0, 1, 2, 3, 4]
    .map((l, i) => {
      const x = W - 28 - 130 + i * 24;
      return l === 0
        ? `<circle cx="${x}" cy="${footerY + 14}" r="1.6" fill="#ffffff" opacity="0.3"/>`
        : l <= 2
          ? `<circle cx="${x}" cy="${footerY + 14}" r="${l === 1 ? 2.2 : 3.2}" fill="${COLORS[l]}"/>`
          : sparkle(x, footerY + 14, l === 3 ? 5 : 7, COLORS[l]);
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t" font-family="${FONT}">
<title id="t">Contribution sky: ${esc(total)} contributions in the last year</title>
<defs>
  ${commonDefs(W, H)}
  <radialGradient id="starGlow"><stop offset="0" stop-color="#fde68a" stop-opacity="0.75"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></radialGradient>
  <radialGradient id="moonGlow"><stop offset="0" stop-color="#e0e7ff" stop-opacity="0.5"/><stop offset="1" stop-color="#e0e7ff" stop-opacity="0"/></radialGradient>
  <mask id="crescent"><rect width="100" height="100" x="-50" y="-50" fill="#ffffff"/><circle cx="7" cy="-4" r="13" fill="#000000"/></mask>
  ${nebulaFilter('nebA', 21, '0.005 0.012', [0.4, 0.25, 0.9], 2.2, -0.9)}
</defs>
${baseCss}
<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g style="mix-blend-mode:screen" opacity="0.45"><rect x="-60" y="-40" width="1020" height="340" filter="url(#nebA)"/></g>
  ${starLayer(W, H, 40, 0.4, 0.8, 140, 41, 0.55)}
  ${cardTitle(W, '✦ Contribution Sky', 'Every day of the last year is a star. Busier days shine brighter and form constellations.')}
  <g transform="translate(${W - 70} 34)">
    <circle r="26" fill="url(#moonGlow)"/>
    <circle r="14" fill="#e0e7ff" mask="url(#crescent)"/>
  </g>
  ${months.join('')}
  <g stroke="#c4b5fd" stroke-width="1" stroke-opacity="0.3" fill="none" stroke-linecap="round">
    <path d="${links.join(' ')}"><animate attributeName="stroke-opacity" values="0.18;0.45;0.18" dur="6s" repeatCount="indefinite"/></path>
  </g>
  ${dots.join('')}
  ${empty ? `<text x="${W / 2}" y="${top + 62}" text-anchor="middle" font-size="14" fill="#c4b5fd">The sky is waiting for its first stars. It fills in after the first refresh.</text>` : ''}
  ${shootingStar('tail', 80, 84, 420, 90, 10, 3)}
  ${stat('Contributions', total.toLocaleString('en-US'), 30)}
  ${stat('Longest streak', `${longest} days`, 230)}
  ${stat('Current streak', `${current} days`, 400)}
  ${updated ? `<text x="${W - 28}" y="${H - 14}" font-size="10.5" text-anchor="end" fill="#8b7fb8">Updated ${esc(updated)} UTC</text>` : ''}
  ${legend}
  <text x="${W - 28 - 130 - 10}" y="${footerY + 18}" font-size="10.5" text-anchor="end" fill="#a5b4fc">Less</text>
  <text x="${W - 28 - 130 + 4 * 24 + 18}" y="${footerY + 18}" font-size="10.5" fill="#a5b4fc">More</text>
</g>
${borderRect(W, H)}
</svg>`;
}

/* ====================================================== PROJECT CONSTELLATION */

export function constellationSvg({ nodes = [] } = {}) {
  const W = 900;
  const H = 310;
  const n = nodes.length;
  const ys = [158, 122, 168, 130, 164, 126];
  const marginX = n > 4 ? 100 : 130;
  const step = n > 1 ? (W - marginX * 2) / (n - 1) : 0;
  const pts = nodes.map((nd, i) => ({
    ...nd,
    color: brighten(nd.color || '#a78bfa'),
    x: r1(n > 1 ? marginX + step * i : W / 2),
    y: ys[i % ys.length],
    r: 10 + Math.min(Number(nd.stars) || 0, 60) * 0.13,
  }));
  const wrapMax = n > 1 ? Math.max(18, Math.min(30, Math.floor((step - 16) / 6.1))) : 40;

  // Smooth path through all nodes.
  let d = '';
  pts.forEach((p, i) => {
    if (i === 0) d = `M${p.x},${p.y}`;
    else {
      const q = pts[i - 1];
      const mx = r1((p.x + q.x) / 2);
      d += ` Q${mx},${r1((p.y + q.y) / 2 + (i % 2 ? -28 : 28))} ${p.x},${p.y}`;
    }
  });

  // Decorative faint constellation behind.
  const rnd = seeded(77);
  const deco = Array.from({ length: 9 }, () => ({ x: r1(30 + rnd() * 840), y: r1(80 + rnd() * 270) }));
  const decoPath = deco.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  const decoDots = deco.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="1.6" fill="#c4b5fd" opacity="0.4"/>`).join('');

  const defs = pts
    .map(
      (p, i) => `<radialGradient id="ng${i}"><stop offset="0" stop-color="${p.color}" stop-opacity="0.75"/><stop offset="1" stop-color="${p.color}" stop-opacity="0"/></radialGradient>`
    )
    .join('\n  ');

  const nodeEls = pts
    .map((p, i) => {
      const lines = wrapText(p.description || 'No description yet.', wrapMax, 2);
      const meta = [p.language, p.stars ? `${p.stars} star${p.stars === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
      const ly = p.y + p.r + 30;
      const anchor = 'middle';
      return `<g>
  <circle cx="${p.x}" cy="${p.y}" r="${r1(p.r * 3.2)}" fill="url(#ng${i})"><animate attributeName="r" values="${r1(p.r * 2.8)};${r1(p.r * 3.6)};${r1(p.r * 2.8)}" dur="${r1(3.5 + i * 0.6)}s" repeatCount="indefinite"/></circle>
  <g>
    <animateTransform attributeName="transform" type="rotate" from="0 ${p.x} ${p.y}" to="360 ${p.x} ${p.y}" dur="${30 + i * 6}s" repeatCount="indefinite"/>
    ${sparkle(p.x, p.y, r1(p.r * 1.5), p.color, ' opacity="0.55"')}
  </g>
  ${sparkle(p.x, p.y, r1(p.r * 1.2), '#ffffff')}
  <circle cx="${p.x}" cy="${p.y}" r="${r1(p.r * 0.35)}" fill="${p.color}"/>
  <text x="${p.x}" y="${ly}" text-anchor="${anchor}" font-size="15" font-weight="700" fill="#ffffff">${esc(p.name)}</text>
  <text x="${p.x}" y="${ly + 18}" text-anchor="${anchor}" font-size="11" font-weight="600" fill="${p.color}">${esc(meta)}</text>
  ${lines.map((ln, k) => `<text x="${p.x}" y="${ly + 36 + k * 15}" text-anchor="${anchor}" font-size="11.5" fill="#c4b5fd">${esc(ln)}</text>`).join('\n  ')}
</g>`;
    })
    .join('\n');

  const empty = !n;
  const empty0 = empty ? '<radialGradient id="ng0"><stop offset="0" stop-color="#fbbf24" stop-opacity="0.75"/><stop offset="1" stop-color="#fbbf24" stop-opacity="0"/></radialGradient>' : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t" font-family="${FONT}">
<title id="t">Project constellation: ${esc(pts.map((p) => p.name).join(', ') || 'projects coming soon')}</title>
<defs>
  ${commonDefs(W, H)}
  ${nebulaFilter('nebA', 33, '0.006 0.01', [0.5, 0.2, 0.9], 2.3, -0.95)}
  <linearGradient id="path" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#fbbf24"/><stop offset="0.5" stop-color="#f472b6"/><stop offset="1" stop-color="#22d3ee"/>
  </linearGradient>
  ${defs}
  ${empty0}
</defs>
${baseCss}
<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g style="mix-blend-mode:screen" opacity="0.5"><rect x="-60" y="-40" width="1020" height="460" filter="url(#nebA)"/></g>
  ${starLayer(W, H, 60, 0.4, 0.9, 130, 51, 0.65)}
  ${starLayer(W, H, 20, 0.9, 1.6, 80, 53, 0.9, 0.5)}
  ${cardTitle(W, '✦ Project Constellation', 'Each star is a public repository. Bigger stars have more GitHub stars.')}
  <path d="${decoPath}" fill="none" stroke="#c4b5fd" stroke-opacity="0.12" stroke-dasharray="3 7"/>
  ${decoDots}
  ${
    empty
      ? `<g><circle cx="${W / 2}" cy="170" r="46" fill="url(#ng0)"/>${sparkle(W / 2, 170, 22, '#fbbf24')}<text x="${W / 2}" y="250" text-anchor="middle" font-size="15" fill="#c4b5fd">Something magical is brewing. Public projects will appear here as stars.</text></g>`
      : `<path d="${d}" fill="none" stroke="#c4b5fd" stroke-opacity="0.18" stroke-width="1.5"/>
  ${
    n > 1
      ? `<path d="${d}" fill="none" stroke="url(#path)" stroke-width="2.2" stroke-linecap="round" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="1000">
    <animate attributeName="stroke-dashoffset" values="1000;0;0;1000" keyTimes="0;0.4;0.85;1" dur="10s" repeatCount="indefinite"/>
  </path>
  <circle r="3.6" fill="#ffffff"><animateMotion dur="10s" repeatCount="indefinite" path="${d}" keyPoints="0;1;1" keyTimes="0;0.4;1" calcMode="linear"/></circle>`
      : ''
  }`
  }
  ${nodeEls}
</g>
${borderRect(W, H)}
</svg>`;
}

/* ==================================================================== FOOTER */

export function footerSvg({ text = 'Thanks for visiting the magical world', updated = '' } = {}) {
  const W = 900;
  const H = 150;
  const rnd = seeded(91);
  const rising = Array.from({ length: 14 }, () => {
    const x = r1(30 + rnd() * 840);
    const rise = r1(50 + rnd() * 70);
    const dur = r1(5 + rnd() * 6);
    const col = ['#fde68a', '#a5f3fc', '#f9a8d4', '#c4b5fd'][Math.floor(rnd() * 4)];
    return `<g opacity="0">
  <animateTransform attributeName="transform" type="translate" values="${x} 130;${r1(x + (rnd() - 0.5) * 40)} ${130 - rise}" dur="${dur}s" begin="-${r1(rnd() * dur)}s" repeatCount="indefinite"/>
  <animate attributeName="opacity" values="0;0.9;0" dur="${dur}s" begin="-${r1(rnd() * dur)}s" repeatCount="indefinite"/>
  ${sparkle(0, 0, r1(3 + rnd() * 4), col)}
</g>`;
  }).join('\n');

  const wavePath = (amp, yBase, phase) => {
    const a = (phase ? -amp : amp);
    return `M0,${yBase} C150,${yBase - a} 300,${yBase + a} 450,${yBase} C600,${yBase - a} 750,${yBase + a} 900,${yBase} L900,${H} L0,${H} Z`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t" font-family="${FONT}">
<title id="t">${esc(text)}</title>
<defs>
  ${commonDefs(W, H)}
  <linearGradient id="w1" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#7c3aed" stop-opacity="0.6"/><stop offset="0.5" stop-color="#22d3ee" stop-opacity="0.5"/><stop offset="1" stop-color="#f472b6" stop-opacity="0.6"/>
  </linearGradient>
  <linearGradient id="txt" x1="-1" y1="0" x2="0" y2="0">
    <animate attributeName="x1" values="-1;1.2" dur="5s" repeatCount="indefinite"/>
    <animate attributeName="x2" values="0;2.2" dur="5s" repeatCount="indefinite"/>
    <stop offset="0" stop-color="#e9d5ff"/><stop offset="0.45" stop-color="#e9d5ff"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="0.55" stop-color="#e9d5ff"/><stop offset="1" stop-color="#e9d5ff"/>
  </linearGradient>
</defs>
${baseCss}
<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${starLayer(W, H, 36, 0.4, 0.9, 120, 61, 0.6)}
  ${rising}
  <path fill="url(#w1)" opacity="0.55">
    <animate attributeName="d" dur="8s" repeatCount="indefinite" values="${wavePath(22, 100, 0)};${wavePath(22, 100, 1)};${wavePath(22, 100, 0)}"/>
  </path>
  <path fill="url(#w1)" opacity="0.4">
    <animate attributeName="d" dur="12s" repeatCount="indefinite" values="${wavePath(17, 116, 1)};${wavePath(17, 116, 0)};${wavePath(17, 116, 1)}"/>
  </path>
  <path fill="url(#w1)" opacity="0.3">
    <animate attributeName="d" dur="16s" repeatCount="indefinite" values="${wavePath(12, 130, 0)};${wavePath(12, 130, 1)};${wavePath(12, 130, 0)}"/>
  </path>
  ${sparkle(W / 2 - 230, 56, 8, '#fbbf24')}
  ${sparkle(W / 2 + 230, 56, 8, '#22d3ee')}
  <text x="${W / 2}" y="62" text-anchor="middle" font-size="22" font-weight="700" fill="url(#txt)">${esc(text)}</text>
  <text x="${W / 2}" y="86" text-anchor="middle" font-size="11" letter-spacing="4" fill="#a5b4fc">KEEP BUILDING · KEEP DREAMING</text>
  ${updated ? `<text x="${W / 2}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#c4b5fd" fill-opacity="0.8">Refreshed automatically every 12 hours · ${esc(updated)} UTC</text>` : ''}
</g>
${borderRect(W, H)}
</svg>`;
}
