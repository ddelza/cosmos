// IAU 88 별자리 경계(astronomy-engine Constellation)로 서울 기준 보임 정도를 계산
// 사용: node tools/constellation-stats.mjs  → tools/constellation-stats.json
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const A = require(process.env.ASTRONOMY_ENGINE ||
  'C:/Users/user/AppData/Local/Temp/claude/C--Users-user-Downloads/9e73272e-3b49-49d6-b1d9-f3a6538e841c/scratchpad/astro/node_modules/astronomy-engine');

const SEOUL = 37.5665;
const LIMIT = 90 - SEOUL; // 52.43°: 이보다 북쪽은 주극, 이보다 남쪽(−)은 전몰
const STEP = 0.25;
const S = {};
for (let dec = -90 + STEP / 2; dec < 90; dec += STEP) {
  const w = Math.cos(dec * Math.PI / 180);
  for (let ra = STEP / 2; ra < 360; ra += STEP) {
    const c = A.Constellation(ra / 15, dec).symbol;
    const s = S[c] || (S[c] = { area: 0, circ: 0, never: 0, x: 0, y: 0, z: 0, decMin: 99, decMax: -99 });
    s.area += w;
    if (dec > LIMIT) s.circ += w;
    if (dec < -LIMIT) s.never += w;
    const r = ra * Math.PI / 180, d = dec * Math.PI / 180;
    s.x += w * Math.cos(d) * Math.cos(r); s.y += w * Math.cos(d) * Math.sin(r); s.z += w * Math.sin(d);
    if (dec < s.decMin) s.decMin = dec; if (dec > s.decMax) s.decMax = dec;
  }
}
const deg2 = (STEP * STEP);
const out = Object.entries(S).map(([abbr, s]) => {
  let raC = Math.atan2(s.y, s.x) * 180 / Math.PI; if (raC < 0) raC += 360;
  const decC = Math.atan2(s.z, Math.hypot(s.x, s.y)) * 180 / Math.PI;
  return {
    abbr, areaDeg2: Math.round(s.area * deg2), circPct: Math.round(s.circ / s.area * 100), neverPct: Math.round(s.never / s.area * 100),
    raCenterH: +(raC / 15).toFixed(2), decCenter: +decC.toFixed(1), decMin: +(s.decMin - STEP / 2).toFixed(1), decMax: +(s.decMax + STEP / 2).toFixed(1),
  };
}).sort((a, b) => a.raCenterH - b.raCenterH);
const here = path.dirname(fileURLToPath(import.meta.url));
writeFileSync(path.join(here, 'constellation-stats.json'), JSON.stringify(out, null, 1));
console.log(out.length, '개');
for (const o of out) console.log([o.abbr, o.raCenterH + 'h', o.decCenter + '°', `${o.decMin}~${o.decMax}`, `주극 ${o.circPct}%`, `전몰 ${o.neverPct}%`, o.areaDeg2 + '㎡°'].join('\t'));
