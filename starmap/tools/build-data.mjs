// 이 PC에 설치된 Stellarium 25.x의 데이터 파일에서 3D 성도용 자료를 뽑는다.
//   node tools/build-data.mjs ["C:/.../Stellarium"]
// 만드는 것
//   data/stars.bin  — 별마다 20바이트: x,y,z(float32, 광년, J2000 적도 직교좌표·태양 중심) + 겉보기등급·B−V(int16, 1/1000등급) + HIP(uint32, 맨 윗비트 = 거리 불확실)
//   data/sky.json   — 별자리 선(별 번호), 별자리 경계(J2000 단위벡터), 별 이름(바이어 기호·고유명)
//
// Stellarium 별 카탈로그(stars/hip_gaia3/stars_N_0v0_M.cat) 형식 — 파일을 직접 뜯어 확인한 것:
//   머리: magic(0x835f040a) type major minor level magMin(1/1000등급) epochJD(float32) = 28바이트
//         + 구역별 별 개수 uint32 × (20·4^level + 1)
//   별 1개 = 48바이트: gaia_id(int64) x0 x1 x2(int32, ÷2e9 = ICRS 단위벡터) dx0 dx1 dx2(int32, 고유운동)
//         b_v(int16) vmag(int16) plx(uint16, 0.02 mas) plx_err(uint16, 0.01 mas) rv(int16) spInt(uint16) objtype(uint8) hip(3바이트, >>5 = HIP 번호)
//   검산: 첫 별 = HIP 3419(고래자리 β, 2.01등급, 시차 33.86 mas) — 문헌값과 일치.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'data');
const STEL = process.argv[2] || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Stellarium');
const LY_PER_PC = 3.261563777;
const UNCERTAIN_LY = 6500;   // 시차를 믿기 어려운 별을 놓는 거리(2 kpc)

function readCat(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x835f040a) throw new Error('magic 불일치: ' + file);
  const level = b.readUInt32LE(16);
  const zones = 20 * Math.pow(4, level) + 1;
  const head = 28 + zones * 4;
  let total = 0;
  for (let i = 0; i < zones; i++) total += b.readUInt32LE(28 + i * 4);
  if (head + total * 48 !== b.length) throw new Error('크기 불일치: ' + file);
  const out = [];
  for (let i = 0; i < total; i++) {
    const o = head + i * 48;
    const x = b.readInt32LE(o + 8) / 2e9, y = b.readInt32LE(o + 12) / 2e9, z = b.readInt32LE(o + 16) / 2e9;
    const n = Math.hypot(x, y, z) || 1;
    out.push({
      x: x / n, y: y / n, z: z / n,
      bv: b.readInt16LE(o + 32), mag: b.readInt16LE(o + 34),
      plx: b.readUInt16LE(o + 36) * 0.02, plxErr: b.readUInt16LE(o + 38) * 0.01,
      hip: (b.readUInt8(o + 45) | (b.readUInt8(o + 46) << 8) | (b.readUInt8(o + 47) << 16)) >> 5,
    });
  }
  return out;
}

const dir = path.join(STEL, 'stars', 'hip_gaia3');
const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'defaultStarsConfig.json'), 'utf8'));
let stars = [];
for (const c of cfg.catalogs.slice(0, 2)) stars = stars.concat(readCat(path.join(dir, c.fileName)));   // 6.0등급까지 + 7.5등급까지
stars.sort((a, b) => a.mag - b.mag);

// 같은 HIP 번호가 겹치면(쌍성 성분) 밝은 쪽만 별자리 선·이름에 쓴다
const hipIdx = new Map();
let uncertain = 0;
const buf = Buffer.alloc(stars.length * 20);
stars.forEach((s, i) => {
  let ly, bad = false;
  if (s.plx > 0.5 && s.plxErr < s.plx * 0.5) ly = 1000 / s.plx * LY_PER_PC;
  else { bad = true; ly = s.plx > 0.5 ? Math.min(1000 / s.plx * LY_PER_PC, UNCERTAIN_LY) : UNCERTAIN_LY; uncertain++; }
  s.ly = ly;
  buf.writeFloatLE(s.x * ly, i * 20); buf.writeFloatLE(s.y * ly, i * 20 + 4); buf.writeFloatLE(s.z * ly, i * 20 + 8);
  buf.writeInt16LE(s.mag, i * 20 + 12); buf.writeInt16LE(s.bv, i * 20 + 14);
  buf.writeUInt32LE((s.hip | (bad ? 0x80000000 : 0)) >>> 0, i * 20 + 16);
  if (s.hip && !hipIdx.has(s.hip)) hipIdx.set(s.hip, i);
});
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'stars.bin'), buf);

// ---- 별자리 선·경계 (skycultures/modern/index.json) ----
const sc = JSON.parse(fs.readFileSync(path.join(STEL, 'skycultures', 'modern', 'index.json'), 'utf8'));
let missing = 0;
const constellations = sc.constellations.map(c => ({
  abbr: c.id.split(' ').pop(),
  lines: c.lines.map(l => l.map(h => { const i = hipIdx.get(h); if (i === undefined) { missing++; return -1; } return i; }).filter(i => i >= 0)).filter(l => l.length > 1),
}));

// 경계는 B1875.0 적도좌표의 자오선(M)·평행선(P) 조각 → 잘게 나눈 뒤 J2000으로 세차 보정
const T = (2405889.25855 - 2451545.0) / 36525;
const as = Math.PI / 648000;
const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * as;
const zz = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * as;
const th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * as;
// P(J2000→그때) = Rz(−z)·Ry(θ)·Rz(−ζ); 여기선 그 역(전치)을 쓴다
const cz = Math.cos(zeta), sz = Math.sin(zeta), cZ = Math.cos(zz), sZ = Math.sin(zz), ct = Math.cos(th), st = Math.sin(th);
const P = [
  [cz * ct * cZ - sz * sZ, -sz * ct * cZ - cz * sZ, -st * cZ],
  [cz * ct * sZ + sz * cZ, -sz * ct * sZ + cz * cZ, -st * sZ],
  [cz * st, -sz * st, ct],
];
const toJ2000 = v => [P[0][0] * v[0] + P[1][0] * v[1] + P[2][0] * v[2], P[0][1] * v[0] + P[1][1] * v[1] + P[2][1] * v[2], P[0][2] * v[0] + P[1][2] * v[1] + P[2][2] * v[2]];
const hms = s => { const p = s.split(':').map(Number); return (p[0] + p[1] / 60 + p[2] / 3600) * 15; };
const dms = s => { const sg = s[0] === '-' ? -1 : 1; const p = s.replace(/^[+-]/, '').split(':').map(Number); return sg * (p[0] + p[1] / 60 + p[2] / 3600); };
const r4 = x => Math.round(x * 1e4) / 1e4;
const boundaries = [];
for (const e of sc.edges) {
  const f = e.trim().split(/\s+/);
  let ra1 = hms(f[2]), d1 = dms(f[3]), ra2 = hms(f[4]), d2 = dms(f[5]);
  let dra = ra2 - ra1; if (dra > 180) dra -= 360; if (dra < -180) dra += 360;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dra) * Math.cos(d1 * Math.PI / 180), Math.abs(d2 - d1)) / 1.5));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const ra = (ra1 + dra * i / n) * Math.PI / 180, de = (d1 + (d2 - d1) * i / n) * Math.PI / 180;
    pts.push(...toJ2000([Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de)]).map(r4));
  }
  boundaries.push(pts);
}

// ---- 별 이름: 바이어·플램스티드 기호(name.fab) + 고유명(common_names) ----
const GREEK = { alf: 'α', bet: 'β', gam: 'γ', del: 'δ', eps: 'ε', zet: 'ζ', eta: 'η', the: 'θ', iot: 'ι', kap: 'κ', lam: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omi: 'ο', pi: 'π', rho: 'ρ', sig: 'σ', tau: 'τ', ups: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', ome: 'ω' };
const names = {};
for (const line of fs.readFileSync(path.join(dir, 'name.fab'), 'utf8').split(/\r?\n/)) {
  if (!line || line[0] === '#') continue;
  const [h, n] = line.split('|');
  const hip = Number(h);
  if (!hipIdx.has(hip) || !n) continue;
  const label = n.trim().replace(/_/g, ' ').replace(/^([a-z]{2,3})(?=\d|\s)/, (m) => GREEK[m] || m);
  (names[hip] = names[hip] || [null, null]);
  if (!names[hip][0] || /^\d/.test(names[hip][0])) names[hip][0] = label;   // 숫자(플램스티드)보다 그리스 문자를 우선
}
for (const k of Object.keys(sc.common_names || {})) {
  const m = /^HIP (\d+)$/.exec(k); if (!m) continue;
  const hip = Number(m[1]); if (!hipIdx.has(hip)) continue;
  const first = sc.common_names[k][0]; if (!first || !first.english) continue;
  (names[hip] = names[hip] || [null, null])[1] = first.english;
}

fs.writeFileSync(path.join(OUT, 'sky.json'), JSON.stringify({
  source: 'Stellarium 25.x — stars/hip_gaia3(Hipparcos·Gaia DR3), skycultures/modern(CC BY-SA 4.0)',
  starCount: stars.length, constellations, boundaries, names,
}));
console.log('별', stars.length, '· 거리 불확실', uncertain, '· 별자리', constellations.length, '· 선에서 빠진 별', missing, '· 경계 조각', boundaries.length, '· 이름', Object.keys(names).length);
console.log('가장 밝은 별 5개:', stars.slice(0, 5).map(s => 'HIP' + s.hip + ' ' + s.mag / 1000 + '등급 ' + Math.round(s.ly) + '광년').join(' / '));
