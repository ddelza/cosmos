// js/astro.js 단위 테스트:  node tools/test-astro.cjs
// astronomy-engine 경로: 환경변수 ASTRONOMY_ENGINE_PATH 또는 기본 스크래치 설치 위치
const path = require('path');
const enginePath = process.env.ASTRONOMY_ENGINE_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'Temp/claude/C--Users-user-Downloads/9e73272e-3b49-49d6-b1d9-f3a6538e841c/scratchpad/astro/node_modules/astronomy-engine');
global.Astronomy = require(enginePath);
const Astro = require('../js/astro.js');

let fail = 0;
function near(label, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${got.toFixed(2)} (기대 ${want} ±${tol})`);
}
function eq(label, got, want) {
  const ok = got === want; if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${got} (기대 ${want})`);
}

const D = '2026-11-03';
const t2030 = Astro.kst(D, '20:30');
const sat = Astro.body('Saturn', t2030);
near('토성 20:30 고도', sat.alt, 46.1, 0.3);
near('토성 20:30 방위', sat.az, 139.4, 0.5);
eq('토성 20:30 8방위', Astro.dir8(sat.az), '남동');

const polaris = Astro.fixed(2.5303, 89.2641, t2030);
near('북극성 고도 ≈ 위도', polaris.alt, 37.8, 0.6);
eq('북극성 방위', Astro.dir8(polaris.az), '북');

// 베가: astronomy-engine 결과 vs 항성시 공식(독립 계산, 세차 간이 보정)
function independent(raH, decDeg, date) {
  const jd = date.getTime() / 864e5 + 2440587.5, d = jd - 2451545.0, T = d / 36525;
  // 세차(적경·적위 일차 근사)
  const m = (3.07496 + 0.00186 * T) * 15 / 3600, n = (1.33621 - 0.00057 * T) * 15 / 3600; // deg/yr
  const yrs = d / 365.25, ra = raH * 15, dec = decDeg;
  const ra2 = ra + (m + n * Math.sin(ra * Math.PI / 180) * Math.tan(dec * Math.PI / 180)) * yrs;
  const dec2 = dec + n * 15 * Math.cos(ra * Math.PI / 180) * yrs / 15;
  const gmst = (280.46061837 + 360.98564736629 * d) % 360;
  const lst = (gmst + Astro.observer.longitude + 360) % 360;
  const H = (lst - ra2) * Math.PI / 180, φ = Astro.observer.latitude * Math.PI / 180, δ = dec2 * Math.PI / 180;
  const sinAlt = Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(H);
  const alt = Math.asin(sinAlt);
  let az = Math.atan2(-Math.sin(H) * Math.cos(δ), Math.cos(φ) * Math.sin(δ) - Math.sin(φ) * Math.cos(δ) * Math.cos(H));
  return { alt: alt * 180 / Math.PI, az: (az * 180 / Math.PI + 360) % 360 };
}
for (const [name, ra, dec] of [['베가', 18.61565, 38.7837], ['M31', 0.71231, 41.2692], ['플레이아데스', 3.7911, 24.1053], ['포말하우트', 22.9608, -29.6222]]) {
  for (const hm of ['18:30', '21:30']) {
    const t = Astro.kst(D, hm), a = Astro.fixed(ra, dec, t), b = independent(ra, dec, t);
    // 대기굴절(고도 높을수록 작음) 차이 감안해 0.5°
    near(`${name} ${hm} 고도 (독립 계산 ${b.alt.toFixed(2)})`, a.alt, +b.alt.toFixed(2), 0.5);
    near(`${name} ${hm} 방위 (독립 계산 ${b.az.toFixed(2)})`, a.az, +b.az.toFixed(2), 0.5);
  }
}
near('베가 18:30 고도(계획 단계 값)', Astro.fixed(18.61565, 38.7837, Astro.kst(D, '18:30')).alt, 64, 1.5);

const moon = Astro.moonInfo(t2030);
console.log('달:', moon.name, '조명', Math.round(moon.illum * 100) + '%', '월출', Astro.hhmm(moon.rise), '월몰', Astro.hhmm(moon.set));
near('달 20:30 고도(지평선 아래)', Astro.body('Moon', t2030).alt, -41.7, 1);
const st = Astro.sunTimes(D);
console.log('일몰', Astro.hhmm(st.sunset), '/ 천문박명 끝', Astro.hhmm(st.dark));
eq('18:30 하늘', Astro.sky(Astro.kst(D, '18:30')).key, 'nautical');
eq('19:30 하늘', Astro.sky(Astro.kst(D, '19:30')).key, 'night');
eq('8방위 0°', Astro.dir8(0), '북'); eq('8방위 22°', Astro.dir8(22), '북'); eq('8방위 23°', Astro.dir8(23), '북동');
eq('8방위 359°', Astro.dir8(359), '북'); eq('8방위 180°', Astro.dir8(180), '남'); eq('8방위 292°', Astro.dir8(292), '서'); eq('8방위 293°', Astro.dir8(293), '북서');
eq('주먹 46°', Astro.fists(46), '주먹 4개 반'); eq('주먹 7°', Astro.fists(7), '주먹 반 개'); eq('주먹 20°', Astro.fists(20), '주먹 2개');
const p = Astro.planetNow('Saturn', t2030);
console.log('토성 밝기', p.mag.toFixed(2), '지구로부터', p.geoAU.toFixed(2), 'AU');

// nightly.html용: 밤 구간(일몰~일출)과 위치 바꾸기
const nw1 = Astro.nightWindow(new Date('2026-11-03T20:30:00+09:00'));
const nw2 = Astro.nightWindow(new Date('2026-11-04T02:00:00+09:00'));
eq('밤 구간 일몰 17:30', Astro.hhmm(nw1.sunset), '17:30');
eq('새벽 2시도 같은 밤', Astro.hhmm(nw2.sunset), '17:30');
console.log('일출', Astro.hhmm(nw1.sunrise), '/ 천문박명', Astro.hhmm(nw1.dark), '~', Astro.hhmm(nw1.dawn));
eq('일출은 다음 날 아침', nw1.sunrise > nw1.sunset && nw1.sunrise - nw1.sunset < 16 * 3600e3, true);
Astro.setLocation(-33.87, 151.21, 30, '시드니');
const crux = Astro.fixed(12.4433, -63.0991, new Date('2026-11-04T04:00:00+09:00')); // 아크룩스
console.log('시드니 아크룩스 고도', crux.alt.toFixed(1));
eq('시드니에서 남쪽 천체 maxAlt>0', Astro.maxAlt(-63.1) > 0, true);
Astro.setLocation(37.47304, 127.3196, 50, '광수중학교');
eq('광수중 복귀 후 아크룩스 maxAlt<0', Astro.maxAlt(-63.1) < 0, true);
near('광수중 복귀 후 토성 다시 46.1°', Astro.body('Saturn', t2030).alt, 46.1, 0.3);

// 천정 근처(70° 이상), 방향순 정렬(남서→서→북서→북→북동→동→남동→남)
eq('주먹 69°', Astro.fists(69), '주먹 7개');
eq('주먹 70°', Astro.fists(70), '천정 근처');
eq('주먹 88°', Astro.fists(88), '천정 근처');
const order = [225, 270, 315, 0, 45, 90, 135, 180].map((az) => Astro.dirKey(az));
eq('방향순 키가 남서→…→남 순서로 증가', order.every((v, i) => i === 0 || v > order[i - 1]), true);
eq('남서 구간 시작(203°)이 맨 앞', Astro.dirKey(203) < Astro.dirKey(250), true);
eq('남 구간 끝(202°)이 맨 뒤', Astro.dirKey(202) > Astro.dirKey(180), true);
console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
