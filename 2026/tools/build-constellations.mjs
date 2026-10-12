// IAU 88 별자리 → data/constellations.json (서울 기준 주극·계절·전몰 분류)
// 사용: node tools/constellation-stats.mjs && node tools/build-constellations.mjs
// 분류 기준 (2026-10-13 지도교사와 합의)
//  - 별자리 넓이의 80% 이상이 서울에서 지지 않으면 → 주극성(항상 보임)
//  - 별자리 북쪽 끝이 서울에서 가장 높이 떠도 10° 미만이면 → 전몰성(한국에서 안 보임)
//  - 나머지는 중심 적경으로 계절: 3~9시 겨울, 9~15시 봄, 15~21시 여름, 21~3시 가을
//    (경계 별자리는 우리나라에서 흔히 쓰는 분류로 조정: SEASON_FIX)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const stats = JSON.parse(readFileSync(path.join(here, 'constellation-stats.json'), 'utf8'));
const SEOUL = 37.5665;

// 약자: [한국어 이름(한국천문학회), 라틴어 이름, 위키백과 제목]
const NAMES = {
  And: ['안드로메다자리', 'Andromeda', 'Andromeda (constellation)'], Ant: ['공기펌프자리', 'Antlia', 'Antlia'],
  Aps: ['극락조자리', 'Apus', 'Apus'], Aqr: ['물병자리', 'Aquarius', 'Aquarius (constellation)'],
  Aql: ['독수리자리', 'Aquila', 'Aquila (constellation)'], Ara: ['제단자리', 'Ara', 'Ara (constellation)'],
  Ari: ['양자리', 'Aries', 'Aries (constellation)'], Aur: ['마차부자리', 'Auriga', 'Auriga'],
  Boo: ['목동자리', 'Boötes', 'Boötes'], Cae: ['조각칼자리', 'Caelum', 'Caelum'],
  Cam: ['기린자리', 'Camelopardalis', 'Camelopardalis'], Cnc: ['게자리', 'Cancer', 'Cancer (constellation)'],
  CVn: ['사냥개자리', 'Canes Venatici', 'Canes Venatici'], CMa: ['큰개자리', 'Canis Major', 'Canis Major'],
  CMi: ['작은개자리', 'Canis Minor', 'Canis Minor'], Cap: ['염소자리', 'Capricornus', 'Capricornus'],
  Car: ['용골자리', 'Carina', 'Carina (constellation)'], Cas: ['카시오페이아자리', 'Cassiopeia', 'Cassiopeia (constellation)'],
  Cen: ['켄타우루스자리', 'Centaurus', 'Centaurus'], Cep: ['케페우스자리', 'Cepheus', 'Cepheus (constellation)'],
  Cet: ['고래자리', 'Cetus', 'Cetus'], Cha: ['카멜레온자리', 'Chamaeleon', 'Chamaeleon'],
  Cir: ['컴퍼스자리', 'Circinus', 'Circinus'], Col: ['비둘기자리', 'Columba', 'Columba (constellation)'],
  Com: ['머리털자리', 'Coma Berenices', 'Coma Berenices'], CrA: ['남쪽왕관자리', 'Corona Australis', 'Corona Australis'],
  CrB: ['북쪽왕관자리', 'Corona Borealis', 'Corona Borealis'], Crv: ['까마귀자리', 'Corvus', 'Corvus (constellation)'],
  Crt: ['컵자리', 'Crater', 'Crater (constellation)'], Cru: ['남십자자리', 'Crux', 'Crux'],
  Cyg: ['백조자리', 'Cygnus', 'Cygnus (constellation)'], Del: ['돌고래자리', 'Delphinus', 'Delphinus'],
  Dor: ['황새치자리', 'Dorado', 'Dorado'], Dra: ['용자리', 'Draco', 'Draco (constellation)'],
  Equ: ['조랑말자리', 'Equuleus', 'Equuleus'], Eri: ['에리다누스자리', 'Eridanus', 'Eridanus (constellation)'],
  For: ['화로자리', 'Fornax', 'Fornax'], Gem: ['쌍둥이자리', 'Gemini', 'Gemini (constellation)'],
  Gru: ['두루미자리', 'Grus', 'Grus (constellation)'], Her: ['헤르쿨레스자리', 'Hercules', 'Hercules (constellation)'],
  Hor: ['시계자리', 'Horologium', 'Horologium (constellation)'], Hya: ['바다뱀자리', 'Hydra', 'Hydra (constellation)'],
  Hyi: ['물뱀자리', 'Hydrus', 'Hydrus'], Ind: ['인디언자리', 'Indus', 'Indus (constellation)'],
  Lac: ['도마뱀자리', 'Lacerta', 'Lacerta'], Leo: ['사자자리', 'Leo', 'Leo (constellation)'],
  LMi: ['작은사자자리', 'Leo Minor', 'Leo Minor'], Lep: ['토끼자리', 'Lepus', 'Lepus (constellation)'],
  Lib: ['천칭자리', 'Libra', 'Libra (constellation)'], Lup: ['이리자리', 'Lupus', 'Lupus (constellation)'],
  Lyn: ['살쾡이자리', 'Lynx', 'Lynx (constellation)'], Lyr: ['거문고자리', 'Lyra', 'Lyra'],
  Men: ['테이블산자리', 'Mensa', 'Mensa (constellation)'], Mic: ['현미경자리', 'Microscopium', 'Microscopium'],
  Mon: ['외뿔소자리', 'Monoceros', 'Monoceros'], Mus: ['파리자리', 'Musca', 'Musca'],
  Nor: ['직각자자리', 'Norma', 'Norma (constellation)'], Oct: ['팔분의자리', 'Octans', 'Octans'],
  Oph: ['뱀주인자리', 'Ophiuchus', 'Ophiuchus'], Ori: ['오리온자리', 'Orion', 'Orion (constellation)'],
  Pav: ['공작자리', 'Pavo', 'Pavo (constellation)'], Peg: ['페가수스자리', 'Pegasus', 'Pegasus (constellation)'],
  Per: ['페르세우스자리', 'Perseus', 'Perseus (constellation)'], Phe: ['봉황새자리', 'Phoenix', 'Phoenix (constellation)'],
  Pic: ['화가자리', 'Pictor', 'Pictor'], Psc: ['물고기자리', 'Pisces', 'Pisces (constellation)'],
  PsA: ['남쪽물고기자리', 'Piscis Austrinus', 'Piscis Austrinus'], Pup: ['고물자리', 'Puppis', 'Puppis'],
  Pyx: ['나침반자리', 'Pyxis', 'Pyxis'], Ret: ['그물자리', 'Reticulum', 'Reticulum'],
  Sge: ['화살자리', 'Sagitta', 'Sagitta'], Sgr: ['궁수자리', 'Sagittarius', 'Sagittarius (constellation)'],
  Sco: ['전갈자리', 'Scorpius', 'Scorpius'], Scl: ['조각가자리', 'Sculptor', 'Sculptor (constellation)'],
  Sct: ['방패자리', 'Scutum', 'Scutum (constellation)'], Ser: ['뱀자리', 'Serpens', 'Serpens'],
  Sex: ['육분의자리', 'Sextans', 'Sextans'], Tau: ['황소자리', 'Taurus', 'Taurus (constellation)'],
  Tel: ['망원경자리', 'Telescopium', 'Telescopium'], Tri: ['삼각형자리', 'Triangulum', 'Triangulum'],
  TrA: ['남쪽삼각형자리', 'Triangulum Australe', 'Triangulum Australe'], Tuc: ['큰부리새자리', 'Tucana', 'Tucana'],
  UMa: ['큰곰자리', 'Ursa Major', 'Ursa Major'], UMi: ['작은곰자리', 'Ursa Minor', 'Ursa Minor'],
  Vel: ['돛자리', 'Vela', 'Vela (constellation)'], Vir: ['처녀자리', 'Virgo', 'Virgo (constellation)'],
  Vol: ['날치자리', 'Volans', 'Volans'], Vul: ['여우자리', 'Vulpecula', 'Vulpecula'],
};
const SEASON_FIX = { Per: '가을', Cnc: '봄' }; // 경계 별자리 — 흔히 쓰는 분류

// 별자리 안의 유명한 별 무리(성군) 설명 + 검색용 다른 이름
const EXTRA = {
  UMa: {
    aliasesKo: ['북두칠성', '큰곰'],
    asterisms: [{
      name: '북두칠성',
      text: '큰곰자리의 엉덩이와 꼬리를 이루는 밝은 별 일곱 개로, 국자 모양으로 보여요. 국자 쪽부터 두베·메라크·페크다·메그레즈, 손잡이 쪽으로 알리오트·미자르·알카이드예요. '
        + '북두칠성은 국제천문연맹의 88개 별자리가 아니라 큰곰자리의 일부인 「별 무리(성군)」예요.'
        + '국자 끝의 두 별(메라크 → 두베)을 이은 선을 그 간격의 약 5배만큼 늘이면 북극성을 찾을 수 있어요. '
        + '서울에서는 손잡이 끝 별 알카이드만 북쪽 지평선 아래로 잠깐 내려가고, 나머지 여섯 별은 항상 지평선 위에 있어요. 다만 가을·겨울 초저녁에는 북쪽 지평선 가까이 낮게 떠 있어 건물이나 산에 가리기 쉬워요(봄 저녁에 가장 높이 보여요). '
        + '손잡이 두 번째 별 미자르 옆의 어두운 별 알코르가 눈에 보이는지로 옛날에 시력을 시험했다는 이야기도 있어요.',
    }],
  },
};

function seasonOf(raH) {
  if (raH >= 3 && raH < 9) return '겨울';
  if (raH >= 9 && raH < 15) return '봄';
  if (raH >= 15 && raH < 21) return '여름';
  return '가을';
}

const out = stats.map((s) => {
  const n = NAMES[s.abbr];
  if (!n) throw new Error('이름 없음: ' + s.abbr);
  const maxAlt = +(90 - SEOUL + s.decMax).toFixed(1); // 북쪽 끝이 남중할 때 고도 (남쪽 별자리용)
  let kind, subtype, note = '';
  if (s.circPct >= 80) { kind = 'circumpolar'; subtype = '주극성(항상 보임)'; if (s.circPct < 100) note = `별자리 대부분(${s.circPct}%)이 서울에서 지지 않아요. 남쪽 끝 일부는 지평선 아래로 내려가기도 해요.`; }
  else if (maxAlt < 10) { kind = 'never'; subtype = '전몰성(한국에서 안 보임)'; if (s.neverPct < 100) note = `북쪽 끝이 서울에서 가장 높이 떠도 ${Math.max(0, maxAlt)}° 정도라 사실상 보이지 않아요.`; }
  else {
    const season = SEASON_FIX[s.abbr] || seasonOf(s.raCenterH);
    kind = 'season'; subtype = season + '철 별자리';
    if (s.circPct > 0) note = `북쪽 일부(${s.circPct}%)는 서울에서 항상 보여요.`;
    if (s.neverPct > 0) note = `남쪽 지평선 낮게 일부만 보여요(별자리의 ${100 - s.neverPct}%만 떠오름, 가장 높을 때 약 ${maxAlt}°).`;
    if (SEASON_FIX[s.abbr]) note = (note ? note + ' ' : '') + `초저녁 기준 계산으로는 ${seasonOf(s.raCenterH)}철과 경계에 있지만 흔히 ${season}철 별자리로 불러요.`;
  }
  const o = {
    id: 'con-' + s.abbr.toLowerCase(), nameKo: n[0], nameEn: n[1], catalog: s.abbr, type: 'constellation', subtype,
    constellationKo: n[0], ra: s.raCenterH, dec: s.decCenter, visibility: kind,
    seoul: { circPct: s.circPct, neverPct: s.neverPct, decMin: s.decMin, decMax: s.decMax, areaDeg2: s.areaDeg2 },
    wikiTitleEn: n[2],
  };
  if (note) o.visNote = note;
  if (EXTRA[s.abbr]) Object.assign(o, EXTRA[s.abbr]);
  return o;
}).sort((a, b) => a.nameKo.localeCompare(b.nameKo, 'ko'));

writeFileSync(path.join(here, '..', 'data', 'constellations.json'), JSON.stringify(out));
const by = {};
out.forEach((o) => { (by[o.subtype] = by[o.subtype] || []).push(o.nameKo.replace('자리', '')); });
for (const k of Object.keys(by)) console.log(`${k} (${by[k].length}): ${by[k].join(', ')}`);
console.log('합계', out.length);
