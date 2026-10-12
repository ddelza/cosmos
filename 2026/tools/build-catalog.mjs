#!/usr/bin/env node
/**
 * build-catalog.mjs — data/catalog.json 생성기 (형식: tools/CATALOG_SPEC.md v1)
 *
 * 실행
 *   node tools/build-catalog.mjs --opendata <폴더>   # 공개 카탈로그 원본에서 읽고 tools/opendata-snapshot.json 갱신
 *   node tools/build-catalog.mjs                     # 원본 없이 스냅숏(지난 실행 때 뽑아 둔 값)만으로 재생성
 *
 *   <폴더>에 둘 파일 (저장소에 넣지 말 것)
 *     NGC.csv, addendum.csv  — OpenNGC  https://github.com/mattiaverga/OpenNGC (database_files/)
 *     mwgc.dat               — Harris(2010) 구상성단 목록  https://physics.mcmaster.ca/~harris/mwgc.dat
 *     hygdata_v41.csv        — HYG v4.1 항성 DB  https://github.com/astronexus/HYG-Database (hyg/CURRENT/)
 *   astronomy-engine 위치: 환경변수 ASTRONOMY_ENGINE (기본값은 아래 DEFAULT_ASTRO)
 *
 * 천체 추가 방법 — 아래 「행(ROWS)」 섹션
 *   딥스카이  DSO   에 { id, ngc:'NGC1234', en, wiki, dist, wmag, wsize, ... }   (ngc = OpenNGC Name 열 값)
 *   별        STARS 에 { id, hyg:'HIP 12345', ko, en, cat, wiki, wabs, ... }
 *   새 ngc/hyg 키를 쓰면 한 번은 --opendata 로 실행해야 스냅숏에 들어간다.
 *   id 규칙은 CATALOG_SPEC.md. id는 한 번 정하면 바꾸지 않는다.
 *
 * 수치 규칙 (source 필드에 출처가 자동으로 적힌다)
 *   좌표  : OpenNGC(딥스카이) / HYG(별). 둘 다 J2000.
 *   등급  : 구상성단 = Harris 2010 V_t. 그 밖 = OpenNGC V → 없으면 B(표시).
 *           은하 B−V<0.4, 성단 B−V<−0.4 처럼 물리적으로 불가능한 V는 버리고 Wikipedia 값(wmag).
 *           별 = HYG V.
 *   크기  : OpenNGC 장축. Wikipedia 시직경(wsize)과 1.5배 넘게 다르면 Wikipedia 값(OpenNGC는 성단 핵 크기 등을 담는 경우가 많음).
 *   거리  : 딥스카이 = 문헌값(시제품 값을 Wikipedia infobox와 대조, 20% 넘게 다르면 Wikipedia 값으로 교체).
 *           별 = HYG(파섹×3.26156), 먼 초거성처럼 Hipparcos 시차가 믿기 어려운 경우만 Wikipedia 값.
 *   절대등급: HYG(또는 거리지수로 재계산). Wikipedia 값(wabs)과 0.5등 넘게 다르면 Wikipedia 값 (SPEC 규칙).
 *   은하 세부분류: Wikipedia/NED 형태(morph) — OpenNGC Hubble 열은 막대(SB) 정보가 빠진 경우가 있어 보조로만 사용.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'data', 'catalog.json');
const SNAPSHOT = path.join(HERE, 'opendata-snapshot.json');
const DEFAULT_ASTRO = 'C:/Users/user/AppData/Local/Temp/claude/C--Users-user-Downloads/9e73272e-3b49-49d6-b1d9-f3a6538e841c/scratchpad/astro/node_modules/astronomy-engine';
const A = createRequire(import.meta.url)(process.env.ASTRONOMY_ENGINE || DEFAULT_ASTRO);
const LY_PER_PC = 3.26156;

// ───────────────────────── 별자리 한글 이름 (88개, 한국천문학회 표기) ─────────────────────────
export const CON_KO = {
  And: '안드로메다자리', Ant: '공기펌프자리', Aps: '극락조자리', Aqr: '물병자리', Aql: '독수리자리', Ara: '제단자리', Ari: '양자리',
  Aur: '마차부자리', Boo: '목동자리', Cae: '조각칼자리', Cam: '기린자리', Cnc: '게자리', CVn: '사냥개자리', CMa: '큰개자리',
  CMi: '작은개자리', Cap: '염소자리', Car: '용골자리', Cas: '카시오페이아자리', Cen: '켄타우루스자리', Cep: '케페우스자리',
  Cet: '고래자리', Cha: '카멜레온자리', Cir: '컴퍼스자리', Col: '비둘기자리', Com: '머리털자리', CrA: '남쪽왕관자리',
  CrB: '북쪽왕관자리', Crv: '까마귀자리', Crt: '컵자리', Cru: '남십자자리', Cyg: '백조자리', Del: '돌고래자리', Dor: '황새치자리',
  Dra: '용자리', Equ: '조랑말자리', Eri: '에리다누스자리', For: '화로자리', Gem: '쌍둥이자리', Gru: '두루미자리', Her: '헤르쿨레스자리',
  Hor: '시계자리', Hya: '바다뱀자리', Hyi: '물뱀자리', Ind: '인디언자리', Lac: '도마뱀자리', Leo: '사자자리', LMi: '작은사자자리',
  Lep: '토끼자리', Lib: '천칭자리', Lup: '이리자리', Lyn: '살쾡이자리', Lyr: '거문고자리', Men: '테이블산자리', Mic: '현미경자리',
  Mon: '외뿔소자리', Mus: '파리자리', Nor: '직각자자리', Oct: '팔분의자리', Oph: '뱀주인자리', Ori: '오리온자리', Pav: '공작자리',
  Peg: '페가수스자리', Per: '페르세우스자리', Phe: '봉황새자리', Pic: '화가자리', Psc: '물고기자리', PsA: '남쪽물고기자리',
  Pup: '고물자리', Pyx: '나침반자리', Ret: '그물자리', Sge: '화살자리', Sgr: '궁수자리', Sco: '전갈자리', Scl: '조각가자리',
  Sct: '방패자리', Ser: '뱀자리', Sex: '육분의자리', Tau: '황소자리', Tel: '망원경자리', Tri: '삼각형자리', TrA: '남쪽삼각형자리',
  Tuc: '큰부리새자리', UMa: '큰곰자리', UMi: '작은곰자리', Vel: '돛자리', Vir: '처녀자리', Vol: '날치자리', Vul: '여우자리',
};

// ───────────────────────── 「관측회 추천」 초기값 후보 ─────────────────────────
// 2026-11-03 18:30–21:30 KST, 광수중(37.47304N, 127.3196E) 최대 고도 20° 이상인 것만 featured:true
const EVENT = { date: '2026-11-03', from: '18:30', to: '21:30', lat: 37.47304, lon: 127.3196, height: 60, minAlt: 20 };
const FEATURED_CANDIDATES = ['saturn', 'neptune', 'vega', 'deneb', 'altair', 'albireo', 'mizar', 'mirfak', 'polaris', 'capella', 'aldebaran',
  'm45', 'mel25', 'ngc869', 'ngc457', 'm52', 'm13', 'm57', 'm27', 'm31', 'm33', 'm15', 'm2', 'ngc253', 'ic1805', 'ngc7000', 'mel20'];

// ═════════════════════════════════════ 행(ROWS) ═════════════════════════════════════
// 딥스카이 행 필드
//   id, ngc(OpenNGC Name; 없으면 ra/dec/mag/size 직접), ko(생략 시 "M13 구상성단"처럼 자동), en, al(aliasesKo), cat/alt(생략 시 자동)
//   type/sub(생략 시 OpenNGC Type에서 자동), morph(은하 형태, Wikipedia/NED), dist(광년)+distSrc('Wikipedia'|기본 '문헌')
//   wmag/wsize(Wikipedia infobox 값 — 이상치 판정·대체용), mag/magSrc, size/sizeSrc, ra/dec/posSrc/con(직접 지정)
//   noDist(성군 등 거리 생략), note(source 끝에 덧붙임), wiki(영어 위키백과 제목), extra(그 밖의 필드 그대로)
const W = 'Wikipedia';
const DSO = [
  // ── 메시에 ──
  { id: 'm1', ngc: 'NGC1952', ko: '게 성운', en: 'Crab Nebula', wiki: 'Crab Nebula', dist: 6500, wmag: 8.4, wsize: 7 },
  { id: 'm2', ngc: 'NGC7089', en: 'Messier 2', wiki: 'Messier 2', dist: 37500, wmag: 6.5, wsize: 16 },
  { id: 'm3', ngc: 'NGC5272', en: 'Messier 3', wiki: 'Messier 3', dist: 33900, wmag: 6.39, wsize: 18 },
  { id: 'm4', ngc: 'NGC6121', en: 'Messier 4', wiki: 'Messier 4', dist: 7200, wmag: 5.6, wsize: 26 },
  { id: 'm5', ngc: 'NGC5904', en: 'Messier 5', wiki: 'Messier 5', dist: 24500, wmag: 5.6, wsize: 23 },
  { id: 'm6', ngc: 'NGC6405', ko: '나비 성단', en: 'Butterfly Cluster', wiki: 'Butterfly Cluster', dist: 1600, wmag: 4.2, wsize: 25 },
  { id: 'm7', ngc: 'NGC6475', ko: '프톨레마이오스 성단', en: 'Ptolemy Cluster', wiki: 'Messier 7', dist: 980, wmag: 3.3, wsize: 80 },
  { id: 'm8', ngc: 'NGC6523', ko: '석호 성운', al: ['라군 성운'], en: 'Lagoon Nebula', wiki: 'Lagoon Nebula', dist: 4100, wmag: 4.6, wsize: 90,
    magReviewed: 'OpenNGC 5.8은 SEDS 6.0과 일치, Wikipedia 4.6만 동떨어짐' },
  { id: 'm9', ngc: 'NGC6333', en: 'Messier 9', wiki: 'Messier 9', dist: 25800, wmag: 7.7, wsize: 9.3 },
  { id: 'm10', ngc: 'NGC6254', en: 'Messier 10', wiki: 'Messier 10', dist: 14300, wmag: 6.6, wsize: 20 },
  { id: 'm11', ngc: 'NGC6705', ko: '야생오리 성단', en: 'Wild Duck Cluster', wiki: 'Wild Duck Cluster', dist: 6200, wmag: 5.8, wsize: 22.8 },
  { id: 'm12', ngc: 'NGC6218', en: 'Messier 12', wiki: 'Messier 12', dist: 15700, wmag: 6.7, wsize: 16 },
  { id: 'm13', ngc: 'NGC6205', ko: '헤라클레스 대성단', al: ['허큘리스 대성단', '헤르쿨레스자리 대성단'], en: 'Hercules Globular Cluster', wiki: 'Messier 13', dist: 22200, wmag: 5.8, wsize: 20 },
  { id: 'm14', ngc: 'NGC6402', en: 'Messier 14', wiki: 'Messier 14', dist: 30300, wmag: 7.6, wsize: 11 },
  { id: 'm15', ngc: 'NGC7078', en: 'Messier 15', wiki: 'Messier 15', dist: 33600, wmag: 6.2, wsize: 18 },
  { id: 'm16', ngc: 'NGC6611', ko: '독수리 성운', en: 'Eagle Nebula', wiki: 'Eagle Nebula', dist: 5700, wmag: 6.4, wsize: 70 },
  { id: 'm17', ngc: 'NGC6618', ko: '오메가 성운', al: ['백조 성운', '말굽 성운'], en: 'Omega Nebula', wiki: 'Omega Nebula', dist: 5500, wmag: 6, wsize: 11,
    mag: 6.0, magSrc: 'Wikipedia(OpenNGC V 7.0은 문헌값과 1등 차이)' },
  { id: 'm18', ngc: 'NGC6613', en: 'Messier 18', wiki: 'Messier 18', dist: 4900, wmag: 7.5, wsize: 9.8 },
  { id: 'm19', ngc: 'NGC6273', en: 'Messier 19', wiki: 'Messier 19', dist: 28700, wmag: 6.8, wsize: 17 },
  { id: 'm20', ngc: 'NGC6514', ko: '삼렬 성운', al: ['트리피드 성운'], en: 'Trifid Nebula', wiki: 'Trifid Nebula', dist: 4100, distSrc: W, wmag: 6.3, wsize: 28,
    mag: 6.3, magSrc: 'Wikipedia(OpenNGC V 8.5는 문헌값과 2등 차이)' },
  { id: 'm21', ngc: 'NGC6531', en: 'Messier 21', wiki: 'Messier 21', dist: 4250, wmag: 6.5, wsize: 14 },
  { id: 'm22', ngc: 'NGC6656', al: ['궁수자리 구상성단'], en: 'Messier 22', wiki: 'Messier 22', dist: 10600, wmag: 5.1, wsize: 32 },
  { id: 'm23', ngc: 'NGC6494', en: 'Messier 23', wiki: 'Messier 23', dist: 2150, wmag: 5.5, wsize: 35 },
  { id: 'm24', ngc: 'IC4715', ko: '궁수자리 작은 별구름', al: ['M24 별구름'], en: 'Small Sagittarius Star Cloud', wiki: 'Small Sagittarius Star Cloud',
    type: 'other', sub: '별구름', dist: 10000, wmag: 2.5, wsize: 120, magReviewed: 'OpenNGC 4.5는 SEDS 4.6과 일치', note: '물리적 성단이 아닌 은하수 별구름' },
  { id: 'm25', ngc: 'IC4725', en: 'Messier 25', wiki: 'Messier 25', dist: 2000, wmag: 4.6, wsize: 36 },
  { id: 'm26', ngc: 'NGC6694', en: 'Messier 26', wiki: 'Messier 26', dist: 5000, wmag: 8.0, wsize: 14 },
  { id: 'm27', ngc: 'NGC6853', ko: '아령 성운', en: 'Dumbbell Nebula', wiki: 'Dumbbell Nebula', dist: 1360, wmag: 7.4, wsize: 8 },
  { id: 'm28', ngc: 'NGC6626', en: 'Messier 28', wiki: 'Messier 28', dist: 17900, wmag: 6.8, wsize: 11.2 },
  { id: 'm29', ngc: 'NGC6913', en: 'Messier 29', wiki: 'Messier 29', dist: 5250, distSrc: W, wmag: 7.1, wsize: 7 },
  { id: 'm30', ngc: 'NGC7099', en: 'Messier 30', wiki: 'Messier 30', dist: 26100, wmag: 7.2, wsize: 12 },
  { id: 'm31', ngc: 'NGC0224', ko: '안드로메다 은하', al: ['안드로메다 대은하'], en: 'Andromeda Galaxy', wiki: 'Andromeda Galaxy', dist: 2537000, morph: 'SA(s)b', wmag: 3.44, wsize: 190 },
  { id: 'm32', ngc: 'NGC0221', al: ['안드로메다 위성은하'], en: 'Messier 32', wiki: 'Messier 32', dist: 2490000, morph: 'cE2', wmag: 8.08, wsize: 8.7 },
  { id: 'm33', ngc: 'NGC0598', ko: '삼각형자리 은하', en: 'Triangulum Galaxy', wiki: 'Triangulum Galaxy', dist: 2730000, morph: 'SA(s)cd', wmag: 5.72, wsize: 70.8 },
  { id: 'm34', ngc: 'NGC1039', en: 'Messier 34', wiki: 'Messier 34', dist: 1500, wmag: 5.5, wsize: 35 },
  { id: 'm35', ngc: 'NGC2168', en: 'Messier 35', wiki: 'Messier 35', dist: 2800, wmag: 5.3, wsize: 28 },
  { id: 'm36', ngc: 'NGC1960', en: 'Messier 36', wiki: 'Messier 36', dist: 4100, wmag: 6.3, wsize: 12 },
  { id: 'm37', ngc: 'NGC2099', al: ['소금과 후추 성단'], en: 'Messier 37', wiki: 'Messier 37', dist: 4500, wmag: 6.2, wsize: 24 },
  { id: 'm38', ngc: 'NGC1912', en: 'Messier 38', wiki: 'Messier 38', dist: 3480, distSrc: W, wmag: 7.4, wsize: 21, magReviewed: 'OpenNGC 산개성단 적분등급(다른 성단과 같은 출처) 유지' },
  { id: 'm39', ngc: 'NGC7092', en: 'Messier 39', wiki: 'Messier 39', dist: 1010, distSrc: W, wmag: 4.6, wsize: 29 },
  { id: 'm40', ngc: 'M040', ko: '윈네케 4', al: ['M40 이중성'], en: 'Winnecke 4', alt: 'WNC 4', wiki: 'Winnecke 4', type: 'star', sub: '이중성',
    dist: 1010, distSrc: 'Wikipedia(Gaia 시차, A성)', mag: 9.1, magSrc: '두 성분 9.64+10.11의 합성(Wikipedia) — OpenNGC 8.0은 과대',
    extra: { absMag: 2.18, spectral: 'K0III + G0V', bv: 1.0,
      components: [{ nameKo: '윈네케 4 A', mag: 9.64, distanceLy: 1010 }, { nameKo: '윈네케 4 B', mag: 10.11, distanceLy: 470 }] },
    note: '절대등급은 A성 거리지수; B−V는 분광형(K0III) 기준 추정; 두 별은 거리가 다른 겉보기 이중성' },
  { id: 'm41', ngc: 'NGC2287', en: 'Messier 41', wiki: 'Messier 41', dist: 2300, wmag: 4.5, wsize: 38 },
  { id: 'm42', ngc: 'NGC1976', ko: '오리온 대성운', al: ['오리온 성운'], en: 'Orion Nebula', wiki: 'Orion Nebula', dist: 1344, wmag: 4, wsize: 65 },
  { id: 'm43', ngc: 'NGC1982', ko: '드 메랑 성운', al: ['드 모이란 성운'], en: "De Mairan's Nebula", wiki: 'Messier 43', dist: 1300, distSrc: W, wmag: 9, wsize: 20 },
  { id: 'm44', ngc: 'NGC2632', ko: '프레세페 성단', al: ['벌집 성단'], en: 'Beehive Cluster', wiki: 'Beehive Cluster', dist: 577, wmag: 3.7, wsize: 95 },
  { id: 'm45', ngc: 'Mel022', ko: '플레이아데스 성단', al: ['좀생이별', '묘성'], en: 'Pleiades', alt: 'Melotte 22', wiki: 'Pleiades', dist: 444, wmag: 1.6, wsize: 120 },
  { id: 'm46', ngc: 'NGC2437', en: 'Messier 46', wiki: 'Messier 46', dist: 5500, wmag: 6, wsize: 22.8 },
  { id: 'm47', ngc: 'NGC2422', en: 'Messier 47', wiki: 'Messier 47', dist: 1600, wmag: 4.4, wsize: 30 },
  { id: 'm48', ngc: 'NGC2548', al: ['바다뱀자리 산개성단'], en: 'Messier 48', wiki: 'Messier 48', dist: 2510, distSrc: W, wmag: 5.8, wsize: 30 },
  { id: 'm49', ngc: 'NGC4472', en: 'Messier 49', wiki: 'Messier 49', dist: 56000000, morph: 'E2', wmag: 8.4, wsize: 10.2 },
  { id: 'm50', ngc: 'NGC2323', en: 'Messier 50', wiki: 'Messier 50', dist: 3200, wmag: 5.9, wsize: 16 },
  { id: 'm51', ngc: 'NGC5194', ko: '소용돌이 은하', al: ['부자 은하'], en: 'Whirlpool Galaxy', wiki: 'Whirlpool Galaxy', dist: 23500000, distSrc: W, morph: 'SA(s)bc pec', wmag: 8.4, wsize: 11.2 },
  { id: 'm52', ngc: 'NGC7654', al: ['소금과 후추 성단'], en: 'Messier 52', wiki: 'Messier 52', dist: 5000, wmag: 7.3, wsize: 13 },
  { id: 'm53', ngc: 'NGC5024', en: 'Messier 53', wiki: 'Messier 53', dist: 58000, wmag: 7.6, wsize: 13 },
  { id: 'm54', ngc: 'NGC6715', en: 'Messier 54', wiki: 'Messier 54', dist: 87400, wmag: 7.6 },
  { id: 'm55', ngc: 'NGC6809', al: ['여름 장미별'], en: 'Messier 55', wiki: 'Messier 55', dist: 17600, wmag: 6.3, wsize: 19 },
  { id: 'm56', ngc: 'NGC6779', en: 'Messier 56', wiki: 'Messier 56', dist: 32900, wmag: 8.3, wsize: 8.8 },
  { id: 'm57', ngc: 'NGC6720', ko: '고리 성운', al: ['가락지 성운'], en: 'Ring Nebula', wiki: 'Ring Nebula', dist: 2570, wmag: 8.8, wsize: 0.98 },
  { id: 'm58', ngc: 'NGC4579', en: 'Messier 58', wiki: 'Messier 58', dist: 62000000, morph: 'SAB(rs)b', wmag: 9.7, wsize: 5.9 },
  { id: 'm59', ngc: 'NGC4621', en: 'Messier 59', wiki: 'Messier 59', dist: 60000000, morph: 'E5', wmag: 9.6, wsize: 5.4 },
  { id: 'm60', ngc: 'NGC4649', en: 'Messier 60', wiki: 'Messier 60', dist: 55000000, morph: 'E1.5', wmag: 8.8, wsize: 7.4 },
  { id: 'm61', ngc: 'NGC4303', en: 'Messier 61', wiki: 'Messier 61', dist: 52500000, morph: 'SAB(rs)bc', wmag: 9.7, wsize: 6.5 },
  { id: 'm62', ngc: 'NGC6266', en: 'Messier 62', wiki: 'Messier 62', dist: 22200, wmag: 6.5, wsize: 15 },
  { id: 'm63', ngc: 'NGC5055', ko: '해바라기 은하', en: 'Sunflower Galaxy', wiki: 'Messier 63', dist: 29300000, morph: 'SA(rs)bc', wmag: 9.3, wsize: 12.6 },
  { id: 'm64', ngc: 'NGC4826', ko: '검은 눈 은하', al: ['검은눈 은하'], en: 'Black Eye Galaxy', wiki: 'Black Eye Galaxy', dist: 17300000, morph: '(R)SA(rs)ab', wmag: 8.52, wsize: 10.71 },
  { id: 'm65', ngc: 'NGC3623', al: ['사자자리 삼중주'], en: 'Messier 65', wiki: 'Messier 65', dist: 35000000, morph: 'SAB(rs)a', wmag: 9.3, wsize: 8.7 },
  { id: 'm66', ngc: 'NGC3627', al: ['사자자리 삼중주'], en: 'Messier 66', wiki: 'Messier 66', dist: 31000000, morph: 'SAB(s)b', wmag: 8.9, wsize: 9.1 },
  { id: 'm67', ngc: 'NGC2682', en: 'Messier 67', wiki: 'Messier 67', dist: 2700, wmag: 6.1, wsize: 30 },
  { id: 'm68', ngc: 'NGC4590', en: 'Messier 68', wiki: 'Messier 68', dist: 33600, wmag: 7.8, wsize: 11 },
  { id: 'm69', ngc: 'NGC6637', en: 'Messier 69', wiki: 'Messier 69', dist: 29700, wmag: 7.6, wsize: 10.8 },
  { id: 'm70', ngc: 'NGC6681', en: 'Messier 70', wiki: 'Messier 70', dist: 29300, wmag: 7.9, wsize: 8 },
  { id: 'm71', ngc: 'NGC6838', en: 'Messier 71', wiki: 'Messier 71', dist: 13000, wmag: 8.2, wsize: 7.2 },
  { id: 'm72', ngc: 'NGC6981', en: 'Messier 72', wiki: 'Messier 72', dist: 54600, wmag: 9.3, wsize: 6.6 },
  { id: 'm73', ngc: 'NGC6994', en: 'Messier 73', wiki: 'Messier 73', type: 'other', sub: '성군', noDist: true, wmag: 9, wsize: 2.8,
    note: '물리적 성단이 아닌 4개 별의 우연한 배열 — 별마다 거리가 달라 거리 생략' },
  { id: 'm74', ngc: 'NGC0628', ko: '유령 은하', en: 'Phantom Galaxy', wiki: 'Messier 74', dist: 32000000, morph: 'SA(s)c', wmag: 9.4, wsize: 10.5 },
  { id: 'm75', ngc: 'NGC6864', en: 'Messier 75', wiki: 'Messier 75', dist: 67500, wmag: 8.5, wsize: 6.8 },
  { id: 'm76', ngc: 'NGC0650', ko: '작은 아령 성운', en: 'Little Dumbbell Nebula', alt: 'NGC 650·651', wiki: 'Little Dumbbell Nebula', dist: 2500, wmag: 10.1, wsize: 2.7 },
  { id: 'm77', ngc: 'NGC1068', al: ['고래자리 A'], en: 'Messier 77', wiki: 'Messier 77', dist: 35000000, distSrc: W, morph: '(R)SA(rs)b', wmag: 8.9, wsize: 7.1 },
  { id: 'm78', ngc: 'NGC2068', al: ['오리온자리 반사성운'], en: 'Messier 78', wiki: 'Messier 78', dist: 1350, wmag: 8.3, wsize: 8 },
  { id: 'm79', ngc: 'NGC1904', en: 'Messier 79', wiki: 'Messier 79', dist: 41000, wmag: 7.7, wsize: 8.7 },
  { id: 'm80', ngc: 'NGC6093', en: 'Messier 80', wiki: 'Messier 80', dist: 32600, wmag: 7.3, wsize: 10 },
  { id: 'm81', ngc: 'NGC3031', ko: '보데 은하', en: "Bode's Galaxy", wiki: 'Messier 81', dist: 11800000, morph: 'SA(s)ab', wmag: 6.94, wsize: 26.9 },
  { id: 'm82', ngc: 'NGC3034', ko: '시가 은하', en: 'Cigar Galaxy', wiki: 'Messier 82', dist: 11400000, morph: 'I0', wmag: 8.41, wsize: 11.2 },
  { id: 'm83', ngc: 'NGC5236', ko: '남쪽 바람개비 은하', en: 'Southern Pinwheel Galaxy', wiki: 'Messier 83', dist: 15000000, morph: 'SAB(s)c', wmag: 7.6, wsize: 12.9 },
  { id: 'm84', ngc: 'NGC4374', en: 'Messier 84', wiki: 'Messier 84', dist: 60000000, morph: 'E1', wmag: 9.1, wsize: 6.5 },
  { id: 'm85', ngc: 'NGC4382', en: 'Messier 85', wiki: 'Messier 85', dist: 60000000, morph: 'SA(s)0+ pec', wmag: 9.1, wsize: 7.1 },
  { id: 'm86', ngc: 'NGC4406', en: 'Messier 86', wiki: 'Messier 86', dist: 52000000, morph: 'S0(3)/E3', wmag: 8.9, wsize: 8.9 },
  { id: 'm87', ngc: 'NGC4486', al: ['처녀자리 A', '처녀자리 A 은하'], en: 'Messier 87 (Virgo A)', wiki: 'Messier 87', dist: 53500000, morph: 'E+0-1 pec', wmag: 8.6, wsize: 7.2 },
  { id: 'm88', ngc: 'NGC4501', en: 'Messier 88', wiki: 'Messier 88', dist: 58700000, distSrc: W, morph: 'SA(rs)b', wmag: 9.6, wsize: 6.9 },
  { id: 'm89', ngc: 'NGC4552', en: 'Messier 89', wiki: 'Messier 89', dist: 50000000, morph: 'E', wmag: 9.8, wsize: 5.1 },
  { id: 'm90', ngc: 'NGC4569', en: 'Messier 90', wiki: 'Messier 90', dist: 58700000, morph: 'SAB(rs)ab', wmag: 9.5, wsize: 9.5 },
  { id: 'm91', ngc: 'NGC4548', en: 'Messier 91', wiki: 'Messier 91', dist: 63000000, morph: 'SBb(rs)', wmag: 10.2, wsize: 5.4 },
  { id: 'm92', ngc: 'NGC6341', en: 'Messier 92', wiki: 'Messier 92', dist: 26700, wmag: 6.4, wsize: 14 },
  { id: 'm93', ngc: 'NGC2447', en: 'Messier 93', wiki: 'Messier 93', dist: 3600, wmag: 6, wsize: 10 },
  { id: 'm94', ngc: 'NGC4736', al: ['악어눈 은하', '고양이 눈 은하'], en: 'Messier 94', wiki: 'Messier 94', dist: 16000000, morph: '(R)SA(r)ab', wmag: 8.2, wsize: 11.2 },
  { id: 'm95', ngc: 'NGC3351', en: 'Messier 95', wiki: 'Messier 95', dist: 33000000, morph: 'SB(r)b', wmag: 9.7, wsize: 3.1 },
  { id: 'm96', ngc: 'NGC3368', en: 'Messier 96', wiki: 'Messier 96', dist: 31000000, morph: 'SAB(rs)ab', wmag: 9.2, wsize: 7.6 },
  { id: 'm97', ngc: 'NGC3587', ko: '올빼미 성운', en: 'Owl Nebula', wiki: 'Owl Nebula', dist: 2030, wmag: 9.9, wsize: 3.4 },
  { id: 'm98', ngc: 'NGC4192', en: 'Messier 98', wiki: 'Messier 98', dist: 44400000, morph: 'SAB(s)ab', wmag: 10.1, wsize: 9.8 },
  { id: 'm99', ngc: 'NGC4254', al: ['머리털 바람개비 은하'], en: 'Messier 99', wiki: 'Messier 99', dist: 50200000, morph: 'SA(s)c', wmag: 9.9, wsize: 5.4 },
  { id: 'm100', ngc: 'NGC4321', en: 'Messier 100', wiki: 'Messier 100', dist: 55000000, morph: 'SAB(s)bc', wmag: 9.3, wsize: 7.4 },
  { id: 'm101', ngc: 'NGC5457', ko: '바람개비 은하', en: 'Pinwheel Galaxy', wiki: 'Pinwheel Galaxy', dist: 20900000, morph: 'SAB(rs)cd', wmag: 7.9, wsize: 28.8 },
  { id: 'm102', ngc: 'NGC5866', ko: '방추 은하', en: 'Spindle Galaxy (NGC 5866)', wiki: 'NGC 5866', dist: 50000000, morph: 'SA0+', wmag: 9.9, wsize: 4.7,
    note: 'M102의 정체는 논란(M101을 중복 기록했다는 설도 있음) — 통상 NGC 5866으로 봄' },
  { id: 'm103', ngc: 'NGC0581', en: 'Messier 103', wiki: 'Messier 103', dist: 10000, wmag: 7.4, wsize: 6 },
  { id: 'm104', ngc: 'NGC4594', ko: '솜브레로 은하', en: 'Sombrero Galaxy', wiki: 'Sombrero Galaxy', dist: 31100000, morph: 'SA(s)a', wmag: 8, wsize: 9 },
  { id: 'm105', ngc: 'NGC3379', en: 'Messier 105', wiki: 'Messier 105', dist: 32000000, morph: 'E1', wmag: 9.3, wsize: 5.4 },
  { id: 'm106', ngc: 'NGC4258', en: 'Messier 106', wiki: 'Messier 106', dist: 23700000, morph: 'SAB(s)bc', wmag: 8.4, wsize: 18.6 },
  { id: 'm107', ngc: 'NGC6171', en: 'Messier 107', wiki: 'Messier 107', dist: 20900, wmag: 7.9, wsize: 10 },
  { id: 'm108', ngc: 'NGC3556', ko: '서프보드 은하', al: ['서핑보드 은하'], en: 'Surfboard Galaxy', wiki: 'Messier 108', dist: 46000000, morph: 'SB(s)cd', wmag: 10.0, wsize: 8.7 },
  { id: 'm109', ngc: 'NGC3992', en: 'Messier 109', wiki: 'Messier 109', dist: 67200000, distSrc: W, morph: 'SB(rs)bc', wmag: 9.8, wsize: 7.6 },
  { id: 'm110', ngc: 'NGC0205', al: ['안드로메다 위성은하'], en: 'Messier 110', wiki: 'Messier 110', dist: 2690000, morph: 'E5 pec', wmag: 8.5, wsize: 21 },

  // ── NGC / IC / 기타 ──
  { id: 'ngc869', ngc: 'C014', ko: '이중성단', al: ['페르세우스자리 이중성단', 'h·χ 페르세이'], en: 'Double Cluster', cat: 'NGC 869 · NGC 884', alt: 'Caldwell 14',
    type: 'cluster', sub: '산개성단', wiki: 'Double Cluster', dist: 7500, wmag: 3.7, wsize: 60,
    mag: 3.7, magSrc: 'OpenNGC NGC 869 V(NGC 884는 3.8)', note: '좌표는 두 성단의 중간점' },
  { id: 'ngc457', ngc: 'NGC0457', ko: '올빼미 성단', al: ['ET 성단', '잠자리 성단'], en: 'Owl Cluster', wiki: 'NGC 457', dist: 7900, wmag: 6.4, wsize: 20 },
  { id: 'mel25', ngc: 'C041', ko: '히아데스 성단', en: 'Hyades', cat: 'Melotte 25', alt: 'Caldwell 41', wiki: 'Hyades (star cluster)', dist: 153, wmag: 0.5, wsize: 330,
    note: '알데바란은 성단 구성원이 아니라 앞쪽에 겹쳐 보이는 별' },
  { id: 'mel20', ko: '페르세우스자리 알파 성단', al: ['알파 페르세이 성단', '멜로트 20'], en: 'Alpha Persei Cluster', cat: 'Melotte 20', alt: 'Collinder 39',
    type: 'cluster', sub: '산개성단', ra: '03:26:42', dec: '+48:48:00', con: 'Per', posSrc: 'Wikipedia(OpenNGC 미수록)', mag: 1.2, magSrc: W, size: 366, sizeSrc: W,
    wiki: 'Alpha Persei Cluster', dist: 577, wmag: 1.2, wsize: 366 },
  { id: 'ngc2477', ngc: 'NGC2477', en: 'NGC 2477', wiki: 'NGC 2477', dist: 3600, distSrc: W, wmag: 5.8, wsize: 20 },
  { id: 'ngc6530', ngc: 'NGC6530', al: ['석호 성운 속 산개성단'], en: 'NGC 6530', type: 'cluster', sub: '산개성단', wiki: 'NGC 6530', dist: 4360, distSrc: W, wmag: 4.6, wsize: 14 },
  { id: 'ngc7789', ngc: 'NGC7789', ko: '캐롤라인의 장미 성단', al: ['캐롤라인의 장미'], en: "Caroline's Rose Cluster", wiki: 'NGC 7789', dist: 7600, wmag: 6.7, wsize: 16 },
  { id: 'ngc663', ngc: 'NGC0663', en: 'NGC 663', wiki: 'NGC 663', dist: 8800, distSrc: W, wmag: 7.1, wsize: 15 },
  { id: 'ngc752', ngc: 'NGC0752', en: 'NGC 752', wiki: 'NGC 752', dist: 1430, wmag: 5.7, wsize: 75 },
  { id: 'ngc5139', ngc: 'NGC5139', ko: '오메가 센타우리', al: ['센타우루스자리 오메가 성단'], en: 'Omega Centauri', wiki: 'Omega Centauri', dist: 17090, wmag: 3.9, wsize: 36.3 },
  { id: 'cr399', ngc: 'Cl399', ko: '옷걸이 성군', al: ['브로키 성단', '코트걸이 성군'], en: "Coathanger (Brocchi's Cluster)", type: 'other', sub: '성군',
    wiki: "Brocchi's Cluster", noDist: true, wmag: 3.6, wsize: 60, note: '물리적 성단이 아닌 성군 — 별마다 거리가 달라 거리 생략' },
  { id: 'kemble1', ko: '켐블의 폭포', al: ['켐블의 캐스케이드'], en: "Kemble's Cascade", cat: 'Kemble 1', type: 'other', sub: '성군', posHyg: 'HIP 18505',
    posSrc: 'HYG(사슬 가운데 가장 밝은 별 HD 24479)', magSrc: 'HYG(가장 밝은 별 HD 24479 등급)', size: 180, sizeSrc: W, wiki: "Kemble's Cascade", noDist: true,
    wsize: 180, note: '약 20개 별이 3°로 늘어선 성군, 남동쪽 끝에 NGC 1502' },
  { id: 'ic1805', ngc: 'IC1805', ko: '하트 성운', al: ['심장 성운'], en: 'Heart Nebula', wiki: 'Heart Nebula', dist: 7500, wmag: 6.5, wsize: 150, note: '등급은 중심 성단(Mel 15)을 포함한 값' },
  { id: 'ic1848', ngc: 'IC1848', ko: '소울 성운', al: ['영혼 성운'], en: 'Soul Nebula', wiki: 'Westerhout 5', dist: 7500, wsize: 150, note: '등급은 중심 성단을 포함한 값' },
  { id: 'ngc7000', ngc: 'NGC7000', ko: '북아메리카 성운', en: 'North America Nebula', wiki: 'North America Nebula', dist: 2590, wmag: 4, wsize: 120 },
  { id: 'ic5070', ngc: 'IC5070', ko: '펠리컨 성운', al: ['펠리칸 성운'], en: 'Pelican Nebula', wiki: 'Pelican Nebula', dist: 1800, distSrc: W, wmag: 8, wsize: 60 },
  { id: 'ngc6960', ngc: 'NGC6960', ko: '베일 성운', al: ['면사포 성운', '마녀의 빗자루 성운', '백조자리 루프'], en: 'Veil Nebula', cat: 'NGC 6960 · NGC 6992',
    alt: 'Caldwell 34 · Caldwell 33', wiki: 'Veil Nebula', dist: 2400, wmag: 7, wsize: 180,
    note: '좌표는 서쪽 베일(NGC 6960, 백조자리 52번 별 옆); 동쪽 베일 NGC 6992는 20h56m +31°44′; 크기는 백조자리 루프 전체' },
  { id: 'ngc7293', ngc: 'NGC7293', ko: '나선 성운', al: ['헬릭스 성운'], en: 'Helix Nebula', wiki: 'Helix Nebula', dist: 655, wmag: 7.6, wsize: 25 },
  { id: 'ngc7662', ngc: 'NGC7662', ko: '푸른 눈덩이 성운', en: 'Blue Snowball Nebula', wiki: 'NGC 7662', dist: 5600, wmag: 8.3, wsize: 0.53 },
  { id: 'ngc6543', ngc: 'NGC6543', ko: '고양이 눈 성운', en: "Cat's Eye Nebula", wiki: "Cat's Eye Nebula", dist: 3300, wmag: 9.8, wsize: 0.33, note: '크기는 밝은 중심부(20″) 기준' },
  { id: 'ngc7009', ngc: 'NGC7009', ko: '토성상 성운', al: ['토성 성운'], en: 'Saturn Nebula', wiki: 'Saturn Nebula', dist: 5200, distSrc: 'Sabbadin 외 2004(Wikipedia 본문)', wmag: 8, wsize: 0.68,
    note: '거리는 문헌마다 2,000~5,200광년' },
  { id: 'ngc6826', ngc: 'NGC6826', ko: '깜박이 성운', al: ['깜박이 행성상 성운'], en: 'Blinking Planetary', wiki: 'NGC 6826', dist: 2000, distSrc: 'Wikipedia(약 2,000광년, 불확실)', wmag: 8.8, wsize: 0.45 },
  { id: 'ngc2392', ngc: 'NGC2392', ko: '에스키모 성운', al: ['광대 얼굴 성운'], en: 'Eskimo Nebula', wiki: 'Eskimo Nebula', dist: 6500, wmag: 9.1, wsize: 0.8 },
  { id: 'ngc2244', ngc: 'NGC2239', ko: '장미 성운', al: ['로제트 성운', 'NGC 2244 성단'], en: 'Rosette Nebula', cat: 'NGC 2244', alt: 'NGC 2237 · Caldwell 49',
    wiki: 'Rosette Nebula', dist: 5200, wmag: 9.0, size: 80, sizeSrc: 'OpenNGC NGC 2237(성운)', magReviewed: '카드 기준 중심 성단 등급 사용',
    note: '좌표·등급은 성운 한가운데의 산개성단 NGC 2244 값(성운 자체 적분등급은 약 9등)' },
  { id: 'ngc1499', ngc: 'NGC1499', ko: '캘리포니아 성운', en: 'California Nebula', wiki: 'California Nebula', dist: 1300, distSrc: W, wmag: 6, wsize: 150,
    magReviewed: 'OpenNGC B등급 사용(Wikipedia 6.0)', note: '표면 밝기가 매우 낮음' },
  { id: 'ngc2024', ngc: 'NGC2024', ko: '불꽃 성운', al: ['플레임 성운'], en: 'Flame Nebula', wiki: 'Flame Nebula', dist: 1350, distSrc: W, wmag: 10, wsize: 30,
    magSrc: 'Wikipedia(출처 표시 없는 값)' },
  { id: 'ngc3372', ngc: 'NGC3372', ko: '용골자리 성운', al: ['카리나 성운', '에타 카리나 성운'], en: 'Carina Nebula', wiki: 'Carina Nebula', dist: 8500, distSrc: W, wmag: 1, wsize: 120,
    magReviewed: 'OpenNGC B등급 사용(Wikipedia +1.0은 에타 카리나 포함)' },
  { id: 'ic4628', ngc: 'IC4628', ko: '새우 성운', en: 'Prawn Nebula', wiki: 'Prawn Nebula', dist: 6000, distSrc: W, wmag: 7.31, wsize: 90 },
  { id: 'ngc6334', ngc: 'NGC6334', ko: '고양이 발 성운', en: "Cat's Paw Nebula", type: 'nebula', sub: '발광성운', wiki: 'NGC 6334', dist: 4370, distSrc: W, wsize: 35,
    mag: 9.0, magSrc: '추정치 — 적분등급이 발표되지 않아 사진 관측 대상임을 감안한 보수적 값', note: 'OpenNGC는 초신성잔해로 분류하나 Wikipedia·Sharpless(Sh2-8) 기준 발광성운' },
  { id: 'ngc6357', ngc: 'NGC6357', ko: '전쟁과 평화 성운', en: 'War and Peace Nebula', wiki: 'NGC 6357', dist: 5900, distSrc: W, size: 90, sizeSrc: 'Sharpless 1959(Sh2-11)',
    mag: 9.0, magSrc: '추정치 — 적분등급이 발표되지 않아 사진 관측 대상임을 감안한 보수적 값' },
  { id: 'ic1396', ngc: 'IC1396', ko: '코끼리 코 성운', al: ['IC 1396 성운'], en: "IC 1396 (Elephant's Trunk Nebula)", wiki: 'IC 1396', dist: 2400, distSrc: W,
    size: 170, sizeSrc: 'Sharpless 1959(Sh2-131)', mag: 5.7, magSrc: '추정치 — 중심별 HD 206267(트럼플러 37) 5.7등(Wikipedia) 기준, 실제 전체 밝기는 이보다 밝음',
    note: '코끼리 코(IC 1396A)는 이 발광성운 안의 어두운 가스 기둥' },
  { id: 'b33', ngc: 'B033', ko: '말머리 성운', en: 'Horsehead Nebula', cat: 'Barnard 33', alt: 'IC 434(배경 발광성운)', wiki: 'Horsehead Nebula', dist: 1375, wmag: 6.8, wsize: 8,
    mag: 6.8, magSrc: 'Wikipedia — 배경 발광성운 IC 434 기준 값, 말머리 자체는 빛을 내지 않는 암흑성운' },
  { id: 'ngc253', ngc: 'NGC0253', ko: '조각가자리 은하', al: ['은화 은하', '은전 은하'], en: 'Sculptor Galaxy', wiki: 'Sculptor Galaxy', dist: 11400000, morph: 'SAB(s)c', wmag: 8.0, wsize: 27.5 },
  { id: 'ngc891', ngc: 'NGC0891', al: ['실버 슬리버 은하'], en: 'NGC 891', wiki: 'NGC 891', dist: 30000000, morph: 'SA(s)b', wmag: 10.1, wsize: 13.5 },
  { id: 'ngc4565', ngc: 'NGC4565', ko: '바늘 은하', en: 'Needle Galaxy', wiki: 'NGC 4565', dist: 40000000, morph: 'SA(s)b', wmag: 10.42, wsize: 15.9 },
];

// 별 행 필드
//   id, hyg('HIP n' 또는 'HD n'; 없으면 ra/dec/mag 등 직접), ko, en, al, cat, alt, sub(기본 '단일별'), wiki
//   wabs(Wikipedia 절대등급 — 0.5등 넘게 다르면 이 값 사용; 성분별 값이라 비교가 무의미하면 생략)
//   dist/distSrc(HYG 대신 쓸 거리), mag/magSrc, sp(분광형 덮어쓰기)/spSrc, bv/bvSrc, absMag/absSrc, comp(이중성 성분), note
const STARS = [
  { id: 'sirius', hyg: 'HIP 32349', ko: '시리우스', al: ['천랑성'], en: 'Sirius', cat: 'α CMa', wiki: 'Sirius', wabs: 1.43, sp: 'A1V', spSrc: W },
  { id: 'arcturus', hyg: 'HIP 69673', ko: '아크투루스', al: ['대각성'], en: 'Arcturus', cat: 'α Boo', wiki: 'Arcturus', wabs: -0.30 },
  { id: 'vega', hyg: 'HIP 91262', ko: '베가', al: ['직녀성', '직녀별'], en: 'Vega', cat: 'α Lyr', wiki: 'Vega', wabs: 0.582 },
  { id: 'capella', hyg: 'HIP 24608', ko: '카펠라', en: 'Capella', cat: 'α Aur', wiki: 'Capella', sp: 'G3III', spSrc: 'Wikipedia(HYG 분광형 오류)',
    note: 'Wikipedia 절대등급(+0.3)은 한 성분 값이라 비교 생략' },
  { id: 'rigel', hyg: 'HIP 24436', ko: '리겔', en: 'Rigel', cat: 'β Ori', wiki: 'Rigel', wabs: -7.84 },
  { id: 'procyon', hyg: 'HIP 37279', ko: '프로키온', en: 'Procyon', cat: 'α CMi', wiki: 'Procyon', wabs: 2.66 },
  { id: 'betelgeuse', hyg: 'HIP 27989', ko: '베텔게우스', en: 'Betelgeuse', cat: 'α Ori', sub: '변광성', wiki: 'Betelgeuse', wabs: -5.85,
    dist: 548, distSrc: 'Wikipedia(Joyce 외 2020; HYG Hipparcos 값 498은 불확실)', note: '반규칙 변광성, 0.0~1.6등' },
  { id: 'altair', hyg: 'HIP 97649', ko: '알타이르', al: ['견우성', '견우별'], en: 'Altair', cat: 'α Aql', wiki: 'Altair', wabs: 2.22 },
  { id: 'aldebaran', hyg: 'HIP 21421', ko: '알데바란', en: 'Aldebaran', cat: 'α Tau', wiki: 'Aldebaran', wabs: -0.641 },
  { id: 'antares', hyg: 'HIP 80763', ko: '안타레스', en: 'Antares', cat: 'α Sco', sub: '변광성', wiki: 'Antares', wabs: -5.28, note: '반규칙 변광성, 0.6~1.6등' },
  { id: 'spica', hyg: 'HIP 65474', ko: '스피카', en: 'Spica', cat: 'α Vir', wiki: 'Spica', wabs: -3.55 },
  { id: 'pollux', hyg: 'HIP 37826', ko: '폴룩스', en: 'Pollux', cat: 'β Gem', wiki: 'Pollux (star)', wabs: 1.08 },
  { id: 'fomalhaut', hyg: 'HIP 113368', ko: '포말하우트', en: 'Fomalhaut', cat: 'α PsA', wiki: 'Fomalhaut', wabs: 1.72 },
  { id: 'deneb', hyg: 'HIP 102098', ko: '데네브', en: 'Deneb', cat: 'α Cyg', wiki: 'Deneb', wabs: -8.38,
    dist: 2615, distSrc: 'Wikipedia(Schiller·Przybilla 2008; HYG Hipparcos 값 1,410은 신뢰도 낮음)' },
  { id: 'regulus', hyg: 'HIP 49669', ko: '레굴루스', en: 'Regulus', cat: 'α Leo', wiki: 'Regulus', wabs: -0.57 },
  { id: 'adhara', hyg: 'HIP 33579', ko: '아다라', en: 'Adhara', cat: 'ε CMa', wiki: 'Epsilon Canis Majoris', wabs: -3.97 },
  { id: 'castor', hyg: 'HIP 36850', ko: '카스토르', en: 'Castor', cat: 'α Gem', sub: '이중성', wiki: 'Castor (star)', wabs: 0.986,
    comp: [{ ko: '카스토르 A', mag: 1.93, magSrc: W, hyg: 'HIP 36850' }, { ko: '카스토르 B', mag: 2.97, magSrc: W, hyg: 'HD 60178' }] },
  { id: 'shaula', hyg: 'HIP 85927', ko: '샤울라', en: 'Shaula', cat: 'λ Sco', wiki: 'Lambda Scorpii' },
  { id: 'bellatrix', hyg: 'HIP 25336', ko: '벨라트릭스', en: 'Bellatrix', cat: 'γ Ori', wiki: 'Bellatrix', wabs: -2.78 },
  { id: 'elnath', hyg: 'HIP 25428', ko: '엘나트', al: ['엘나스'], en: 'Elnath', cat: 'β Tau', wiki: 'Beta Tauri', wabs: -1.42 },
  { id: 'alnilam', hyg: 'HIP 26311', ko: '알닐람', en: 'Alnilam', cat: 'ε Ori', wiki: 'Alnilam', wabs: -6.89,
    dist: 1250, distSrc: 'Wikipedia(384 pc; HYG Hipparcos 값 1,980은 시차 오차가 큼)' },
  { id: 'regor', hyg: 'HIP 39953', ko: '레고르', al: ['돛자리 감마'], en: 'Regor (Gamma Velorum)', cat: 'γ² Vel', wiki: 'Gamma Velorum',
    note: '41″ 떨어진 γ¹(4.2등)과 쌍안경 이중성' },
  { id: 'alnitak', hyg: 'HIP 26727', ko: '알니타크', al: ['알니탁'], en: 'Alnitak', cat: 'ζ Ori', wiki: 'Alnitak', wabs: -6.0,
    dist: 1260, distSrc: 'Wikipedia(387 pc; HYG Hipparcos 값 736은 오리온자리 띠 별의 알려진 시차 문제)' },
  { id: 'alioth', hyg: 'HIP 62956', ko: '알리오트', al: ['알리오스'], en: 'Alioth', cat: 'ε UMa', wiki: 'Alioth', wabs: -0.2 },
  { id: 'alnair', hyg: 'HIP 109268', ko: '알나이르', en: 'Alnair', cat: 'α Gru', wiki: 'Alpha Gruis', wabs: -0.721 },
  { id: 'dubhe', hyg: 'HIP 54061', ko: '두베', en: 'Dubhe', cat: 'α UMa', wiki: 'Dubhe', wabs: -1.10, sp: 'K0III', spSrc: 'Wikipedia(HYG 분광형은 동반성 값)' },
  { id: 'mirfak', hyg: 'HIP 15863', ko: '미르팍', al: ['미르파크'], en: 'Mirfak', cat: 'α Per', wiki: 'Alpha Persei', wabs: -5.1,
    note: '페르세우스자리 알파 성단(Mel 20)의 가장 밝은 별' },
  { id: 'wezen', hyg: 'HIP 34444', ko: '웨젠', en: 'Wezen', cat: 'δ CMa', wiki: 'Delta Canis Majoris', wabs: -6.77 },
  { id: 'kaus-australis', hyg: 'HIP 90185', ko: '카우스 아우스트랄리스', al: ['카우스오스트랄리스'], en: 'Kaus Australis', cat: 'ε Sgr', wiki: 'Epsilon Sagittarii', wabs: -1.41 },
  { id: 'alkaid', hyg: 'HIP 67301', ko: '알카이드', en: 'Alkaid', cat: 'η UMa', wiki: 'Alkaid', wabs: -0.67 },
  { id: 'sargas', hyg: 'HIP 86228', ko: '사르가스', en: 'Sargas', cat: 'θ Sco', wiki: 'Theta Scorpii', wabs: -2.71 },
  { id: 'menkalinan', hyg: 'HIP 28360', ko: '멘칼리난', en: 'Menkalinan', cat: 'β Aur', wiki: 'Beta Aurigae' },
  { id: 'alhena', hyg: 'HIP 31681', ko: '알헤나', al: ['알레나'], en: 'Alhena', cat: 'γ Gem', wiki: 'Gamma Geminorum', wabs: -0.68 },
  { id: 'polaris', hyg: 'HIP 11767', ko: '북극성', al: ['폴라리스'], en: 'Polaris', cat: 'α UMi', sub: '이중성', wiki: 'Polaris', wabs: -3.6,
    comp: [{ ko: '북극성 A', mag: 1.98, magSrc: W, hyg: 'HIP 11767' }, { ko: '북극성 B', mag: 8.7, magSrc: W, hyg: 'HIP 11767' }],
    note: '북극성 A는 변광 폭이 아주 작은 세페이드 변광성; B는 18″ 떨어진 망원경 이중성' },
  { id: 'mirzam', hyg: 'HIP 30324', ko: '미르잠', en: 'Mirzam', cat: 'β CMa', wiki: 'Beta Canis Majoris', wabs: -3.93 },
  { id: 'alphard', hyg: 'HIP 46390', ko: '알파르드', en: 'Alphard', cat: 'α Hya', wiki: 'Alphard', wabs: -1.743 },
  { id: 'hamal', hyg: 'HIP 9884', ko: '하말', en: 'Hamal', cat: 'α Ari', wiki: 'Hamal', wabs: 0.47 },
  { id: 'albireo', hyg: 'HIP 95947', ko: '알비레오', en: 'Albireo', cat: 'β Cyg', sub: '이중성', wiki: 'Albireo', wabs: -2.45,
    comp: [{ ko: '알비레오 A(금색)', hyg: 'HIP 95947' }, { ko: '알비레오 B(청색)', hyg: 'HIP 95951' }] },
  { id: 'mizar', hyg: 'HIP 65378', ko: '미자르·알코르', al: ['미자르', '알코르'], en: 'Mizar and Alcor', cat: 'ζ UMa', alt: '80 UMa(알코르)', sub: '이중성',
    wiki: 'Mizar and Alcor', comp: [{ ko: '미자르 A', hyg: 'HIP 65378' }, { ko: '미자르 B', hyg: 'HD 116657' }, { ko: '알코르', hyg: 'HIP 65477' }],
    note: '알코르는 11.8′, 미자르 B는 14″ 떨어져 있음(망원경 이중성)' },
  { id: 'almach', hyg: 'HIP 9640', ko: '알마크', en: 'Almach', cat: 'γ And', sub: '이중성', wiki: 'Gamma Andromedae', wabs: -3.08,
    sp: 'K2+IIb', spSrc: 'Wikipedia(HYG 분광형은 동반성 값)',
    comp: [{ ko: '알마크 A(주황)', mag: 2.27, magSrc: W, hyg: 'HIP 9640' }, { ko: '알마크 B(청색)', mag: 4.84, magSrc: W, dist: 355, distSrc: 'Wikipedia(시차 9.19 mas)' }] },
  { id: 'achernar', hyg: 'HIP 7588', ko: '아케르나르', en: 'Achernar', cat: 'α Eri', wiki: 'Achernar', wabs: -2.74 },
  { id: 'canopus', hyg: 'HIP 30438', ko: '카노푸스', al: ['노인성'], en: 'Canopus', cat: 'α Car', wiki: 'Canopus', wabs: -5.71,
    mag: -0.74, magSrc: 'Wikipedia(HYG −0.62는 표준 V값과 차이)' },
  { id: 'alpha-centauri', hyg: 'HIP 71683', ko: '알파 센타우리', al: ['리길 켄타우루스', '톨리만'], en: 'Alpha Centauri', cat: 'α Cen', sub: '이중성',
    wiki: 'Alpha Centauri', wabs: 4.38, mag: -0.27, magSrc: 'Wikipedia(A+B 합성)', sp: 'G2V + K1V', spSrc: W,
    comp: [{ ko: '알파 센타우리 A', hyg: 'HIP 71683' }, { ko: '알파 센타우리 B', hyg: 'HIP 71681' }], note: '등급·절대등급은 A+B 합성, B−V는 A성 값' },
  { id: 'markab', hyg: 'HIP 113963', ko: '마르카브', en: 'Markab', cat: 'α Peg', wiki: 'Alpha Pegasi', wabs: -0.718 },
  { id: 'merak', hyg: 'HIP 53910', ko: '메라크', en: 'Merak', cat: 'β UMa', wiki: 'Merak (star)', wabs: 0.61 },
  { id: 'phecda', hyg: 'HIP 58001', ko: '페크다', en: 'Phecda', cat: 'γ UMa', wiki: 'Phecda', wabs: 0.4 },
  { id: 'megrez', hyg: 'HIP 59774', ko: '메그레즈', en: 'Megrez', cat: 'δ UMa', wiki: 'Megrez', wabs: 1.39 },
  { id: 'alpheratz', hyg: 'HIP 677', ko: '알페라츠', en: 'Alpheratz', cat: 'α And', wiki: 'Alpheratz', wabs: -0.193 },
  { id: 'saiph', hyg: 'HIP 27366', ko: '사이프', en: 'Saiph', cat: 'κ Ori', wiki: 'Saiph', wabs: -6.1 },
  { id: 'mirach', hyg: 'HIP 5447', ko: '미라크', en: 'Mirach', cat: 'β And', wiki: 'Mirach', wabs: -1.76 },
  { id: 'kochab', hyg: 'HIP 72607', ko: '코카브', en: 'Kochab', cat: 'β UMi', wiki: 'Kochab', wabs: -0.83 },
  { id: 'denebola', hyg: 'HIP 57632', ko: '데네볼라', en: 'Denebola', cat: 'β Leo', wiki: 'Denebola', wabs: 1.93 },
  { id: 'sadr', hyg: 'HIP 100453', ko: '사드르', en: 'Sadr', cat: 'γ Cyg', wiki: 'Gamma Cygni', wabs: -4.54 },
  { id: 'schedar', hyg: 'HIP 3179', ko: '셰다르', al: ['쉐다르'], en: 'Schedar', cat: 'α Cas', wiki: 'Alpha Cassiopeiae', wabs: -2.01 },
  { id: 'caph', hyg: 'HIP 746', ko: '카프', en: 'Caph', cat: 'β Cas', wiki: 'Beta Cassiopeiae', wabs: 1.3 },
  { id: 'navi', hyg: 'HIP 4427', ko: '나비', al: ['카시오페이아자리 감마'], en: 'Navi (Gamma Cassiopeiae)', cat: 'γ Cas', sub: '변광성', wiki: 'Gamma Cassiopeiae', wabs: -3.98,
    note: '불규칙 변광성(약 1.6~3.0등)' },
  { id: 'stephenson-2-18', ko: '스티븐슨 2-18', al: ['St2-18'], en: 'Stephenson 2-18', cat: 'Stephenson 2-18', alt: 'Stephenson 2 DFK 1', wiki: 'Stephenson 2 DFK 1',
    ra: '18:39:02.37', dec: '-06:05:10.5', con: 'Sct', posSrc: W, mag: 15.26, magSrc: 'Gaia G등급(Wikipedia) — V등급은 발표되지 않았고 이보다 더 어두움',
    dist: 18900, distSrc: 'Wikipedia(5,800±1,000 pc)', sp: 'M5-M6', spSrc: W, bv: 1.8, bvSrc: '분광형(M형 초거성) 기준 추정',
    note: '알려진 가장 큰 별 가운데 하나(반지름 태양의 약 2,150배)' },
  { id: 'godzilla', ko: '고질라', al: ['고지라'], en: 'Godzilla (lensed star)', cat: 'Godzilla', alt: 'PSZ1 G311.65-18.48 선버스트 호', wiki: 'Godzilla (star)',
    ra: '15:50:00.66', dec: '-78:11:10.0', posSrc: W, mag: 25, magSrc: '추정치 — 발표된 겉보기 등급이 없어 허블 망원경으로만 보이는 수준(약 25등)으로 표기',
    dist: 10900000000, distSrc: 'Wikipedia(적색이동 z=2.37, 빛이 출발한 뒤 걸린 시간 기준 거리)', note: '은하단 중력렌즈로 수천 배 확대되어 보이는 별(또는 별무리) 후보' },
];

// 태양계 (위치는 사이트가 날짜별로 계산)
const SOLAR = [
  { id: 'sun', nameKo: '태양', nameEn: 'Sun', catalog: 'Sun', type: 'other', subtype: '항성(태양)', mag: -26.74, body: 'Sun', wikiTitleEn: 'Sun',
    source: '등급: Wikipedia; 지구에서 평균 1 AU(약 1억 4960만 km), 지름 약 139만 km' },
  { id: 'moon', nameKo: '달', nameEn: 'Moon', catalog: 'Moon', type: 'moon', subtype: '위성', magRange: [-12.9, -2.5], distanceKm: [362600, 405400],
    parent: 'earth', diameterKm: 3474.8, body: 'Moon', wikiTitleEn: 'Moon', source: 'Wikipedia(거리 = 평균 근지점·원지점)' },
  { id: 'mercury', nameKo: '수성', nameEn: 'Mercury', catalog: 'Mercury', type: 'planet', subtype: '내행성', magRange: [-2.48, 7.25], distanceAU: [0.3075, 0.4667],
    diameterKm: 4879, moons: 0, orbitYears: 0.2408, body: 'Mercury', wikiTitleEn: 'Mercury (planet)', source: 'Wikipedia(지름 = 평균 지름)' },
  { id: 'venus', nameKo: '금성', nameEn: 'Venus', catalog: 'Venus', type: 'planet', subtype: '내행성', magRange: [-4.92, -2.98], distanceAU: [0.7184, 0.7282],
    diameterKm: 12104, moons: 0, orbitYears: 0.6152, body: 'Venus', wikiTitleEn: 'Venus', source: 'Wikipedia(지름 = 평균 지름)' },
  { id: 'mars', nameKo: '화성', nameEn: 'Mars', catalog: 'Mars', type: 'planet', subtype: '외행성', magRange: [-2.94, 1.86], distanceAU: [1.3814, 1.6662],
    diameterKm: 6792, moons: 2, orbitYears: 1.8808, body: 'Mars', wikiTitleEn: 'Mars', source: 'Wikipedia(지름 = 적도 지름)' },
  { id: 'jupiter', nameKo: '목성', nameEn: 'Jupiter', catalog: 'Jupiter', type: 'planet', subtype: '외행성', magRange: [-2.94, -1.66], distanceAU: [4.9506, 5.4571],
    diameterKm: 142976, moons: 115, orbitYears: 11.862, body: 'Jupiter', wikiTitleEn: 'Jupiter',
    source: 'Wikipedia(지름 = 적도 지름; 위성 수 = 2026년 4월 국제천문연맹 소행성센터 발표 기준)' },
  { id: 'saturn', nameKo: '토성', nameEn: 'Saturn', catalog: 'Saturn', type: 'planet', subtype: '외행성', magRange: [-0.55, 1.17], distanceAU: [9.0412, 10.1238],
    diameterKm: 120536, moons: 293, orbitYears: 29.45, body: 'Saturn', wikiTitleEn: 'Saturn',
    source: 'Wikipedia(지름 = 적도 지름; 위성 수 = 2026년 6월 국제천문연맹 소행성센터 발표 기준)' },
  { id: 'uranus', nameKo: '천왕성', nameEn: 'Uranus', catalog: 'Uranus', type: 'planet', subtype: '외행성', magRange: [5.38, 6.03], distanceAU: [18.2861, 20.0965],
    diameterKm: 51113, moons: 29, orbitYears: 84.02, body: 'Uranus', wikiTitleEn: 'Uranus', source: 'Wikipedia(지름 = 적도 지름; 위성 수 2025년 기준)' },
  { id: 'neptune', nameKo: '해왕성', nameEn: 'Neptune', catalog: 'Neptune', type: 'planet', subtype: '외행성', magRange: [7.67, 8.0], distanceAU: [29.81, 30.33],
    diameterKm: 49521, moons: 16, orbitYears: 164.8, body: 'Neptune', wikiTitleEn: 'Neptune', source: 'Wikipedia(지름 = 적도 지름)' },
  // 위성: distanceKm = 모행성 중심으로부터 [근점, 원점], mag = 충 무렵 겉보기 등급
  { id: 'io', nameKo: '이오', nameEn: 'Io', catalog: 'Jupiter I', type: 'moon', subtype: '위성', parent: 'jupiter', body: 'Jupiter', mag: 5.02,
    distanceKm: [420100, 423500], diameterKm: 3648.4, wikiTitleEn: 'Io (moon)', source: 'Wikipedia(등급 = 충일 때)' },
  { id: 'europa', nameKo: '유로파', nameEn: 'Europa', catalog: 'Jupiter II', type: 'moon', subtype: '위성', parent: 'jupiter', body: 'Jupiter', mag: 5.29,
    distanceKm: [664862, 676938], diameterKm: 3121.6, wikiTitleEn: 'Europa (moon)', source: 'Wikipedia(등급 = 충일 때)' },
  { id: 'ganymede', nameKo: '가니메데', nameEn: 'Ganymede', catalog: 'Jupiter III', type: 'moon', subtype: '위성', parent: 'jupiter', body: 'Jupiter', mag: 4.61,
    distanceKm: [1069200, 1071600], diameterKm: 5264.5, wikiTitleEn: 'Ganymede (moon)', source: 'Wikipedia(등급 = 충일 때)' },
  { id: 'callisto', nameKo: '칼리스토', nameEn: 'Callisto', catalog: 'Jupiter IV', type: 'moon', subtype: '위성', parent: 'jupiter', body: 'Jupiter', mag: 5.65,
    distanceKm: [1869000, 1897000], diameterKm: 4820.6, wikiTitleEn: 'Callisto (moon)', source: 'Wikipedia(등급 = 충일 때)' },
  { id: 'titan', nameKo: '타이탄', nameEn: 'Titan', catalog: 'Saturn VI', type: 'moon', subtype: '위성', parent: 'saturn', body: 'Saturn', mag: 8.2,
    distanceKm: [1186680, 1257060], diameterKm: 5149.5, wikiTitleEn: 'Titan (moon)', source: 'Wikipedia(등급 8.2~9.0 중 밝을 때)' },
  { id: 'enceladus', nameKo: '엔셀라두스', nameEn: 'Enceladus', catalog: 'Saturn II', type: 'moon', subtype: '위성', parent: 'saturn', body: 'Saturn', mag: 11.7,
    distanceKm: [236895, 239180], diameterKm: 504.1, wikiTitleEn: 'Enceladus', source: 'Wikipedia' },
  { id: 'tethys', nameKo: '테티스', nameEn: 'Tethys', catalog: 'Saturn III', type: 'moon', subtype: '위성', parent: 'saturn', body: 'Saturn', mag: 10.2,
    distanceKm: [294700, 295300], diameterKm: 1062, wikiTitleEn: 'Tethys (moon)', source: 'Wikipedia' },
  { id: 'dione', nameKo: '디오네', nameEn: 'Dione', catalog: 'Saturn IV', type: 'moon', subtype: '위성', parent: 'saturn', body: 'Saturn', mag: 10.4,
    distanceKm: [376900, 378500], diameterKm: 1122.8, wikiTitleEn: 'Dione (moon)', source: 'Wikipedia' },
  { id: 'triton', nameKo: '트리톤', nameEn: 'Triton', catalog: 'Neptune I', type: 'moon', subtype: '위성', parent: 'neptune', body: 'Neptune', mag: 13.47,
    distanceKm: [354759, 354759], diameterKm: 2706.8, wikiTitleEn: 'Triton (moon)', source: 'Wikipedia(거의 원 궤도 — 평균 거리)' },
];

// ═════════════════════════════════════ 데이터 읽기 ═════════════════════════════════════
const args = process.argv.slice(2);
const odIdx = args.indexOf('--opendata');
const OPENDATA = odIdx >= 0 ? args[odIdx + 1] : null;

function csvSplit(line, sep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}
function loadOpenNGC(dir, want) {
  const m = {};
  for (const f of ['NGC.csv', 'addendum.csv']) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).filter(Boolean);
    const head = lines[0].split(';');
    for (const l of lines.slice(1)) {
      const c = l.split(';'); const r = {}; head.forEach((h, i) => (r[h] = c[i] ?? ''));
      if (!want.has(r.Name)) continue;
      m[r.Name] = { type: r.Type, ra: r.RA, dec: r.Dec, con: r.Const, majAx: r.MajAx ? +r.MajAx : null,
        b: r['B-Mag'] ? +r['B-Mag'] : null, v: r['V-Mag'] ? +r['V-Mag'] : null, hubble: r.Hubble || null };
    }
  }
  return m;
}
function loadHarris(dir, want) {
  const m = {}; let part = 0;
  for (const l of fs.readFileSync(path.join(dir, 'mwgc.dat'), 'utf8').split(/\r?\n/)) {
    if (/^\s+ID\s+Name\s+RA/.test(l)) { part = 1; continue; }
    if (/^\s+ID\s+\[Fe\/H\]/.test(l)) { part = 2; continue; }
    if (/^\s+ID\s+v_r/.test(l)) { part = 3; continue; }
    const id = l.slice(0, 12).trim();
    if (part === 2 && want.has(id)) { const vt = parseFloat(l.substr(40, 7)); if (!Number.isNaN(vt)) m[id] = { vt }; }
  }
  return m;
}
function loadHYG(dir, want) {
  const m = {};
  const lines = fs.readFileSync(path.join(dir, 'hygdata_v41.csv'), 'utf8').split(/\r?\n/);
  const head = csvSplit(lines[0], ',');
  const ix = k => head.indexOf(k);
  const I = { hip: ix('hip'), hd: ix('hd'), ra: ix('ra'), dec: ix('dec'), dist: ix('dist'), mag: ix('mag'), absmag: ix('absmag'), spect: ix('spect'), ci: ix('ci'), con: ix('con'), proper: ix('proper') };
  for (const l of lines.slice(1)) {
    if (!l) continue;
    const c = csvSplit(l, ',');
    const keys = [c[I.hip] && `HIP ${c[I.hip]}`, c[I.hd] && `HD ${c[I.hd]}`].filter(Boolean);
    const k = keys.find(x => want.has(x)); if (!k) continue;
    m[k] = { ra: +c[I.ra], dec: +c[I.dec], distPc: c[I.dist] ? +c[I.dist] : null, mag: +c[I.mag], absmag: c[I.absmag] ? +c[I.absmag] : null,
      spect: c[I.spect], ci: c[I.ci] === '' ? null : +c[I.ci], con: c[I.con], proper: c[I.proper] };
  }
  return m;
}

const wantNGC = new Set(DSO.map(r => r.ngc).filter(Boolean));
const wantHYG = new Set([...STARS.flatMap(r => [r.hyg, ...(r.comp || []).map(c => c.hyg)]), ...DSO.map(r => r.posHyg)].filter(Boolean));
const harrisKey = name => name.replace(/^NGC0*/, 'NGC ').replace(/^IC0*/, 'IC ');
let OD;
if (OPENDATA) {
  const ngc = loadOpenNGC(OPENDATA, wantNGC);
  const wantH = new Set(Object.entries(ngc).filter(([, r]) => r.type === 'GCl').map(([k]) => harrisKey(k)));
  OD = { ngc, harris: loadHarris(OPENDATA, wantH), hyg: loadHYG(OPENDATA, wantHYG) };
  const snap = { note: 'build-catalog.mjs가 --opendata 실행 때 자동 생성. 공개 카탈로그(OpenNGC, Harris 2010, HYG v4.1)에서 이 목록에 쓰인 행만 뽑은 사본.',
    created: new Date().toISOString().slice(0, 10), ...OD };
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 1) + '\n', 'utf8');
} else {
  if (!fs.existsSync(SNAPSHOT)) throw new Error('opendata-snapshot.json 없음 — --opendata <폴더> 로 실행하세요');
  OD = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
}

// ═════════════════════════════════════ 변환 ═════════════════════════════════════
const problems = [], notes = [];
const sexH = s => { const neg = s.trim().startsWith('-'); const [a, b, c = 0] = s.trim().replace(/^[+-]/, '').split(/[: ]+/).map(Number); return (neg ? -1 : 1) * (a + b / 60 + c / 3600); };
const r5 = x => +x.toFixed(5), r4 = x => +x.toFixed(4), r2 = x => +x.toFixed(2);
const sig3 = x => +Number(x).toPrecision(3);
const fmtName = n => n.replace(/^NGC0*/, 'NGC ').replace(/^IC0*/, 'IC ').replace(/^Mel0*/, 'Melotte ').replace(/^C0*(\d)/, 'Caldwell $1')
  .replace(/^Cl0*/, 'Collinder ').replace(/^B0*/, 'Barnard ').replace(/^M0*/, 'M');
const conFix = c => ({ Se1: 'Ser', Se2: 'Ser' }[c] || c);

const NGC_TYPE = { G: ['galaxy', null], OCl: ['cluster', '산개성단'], GCl: ['cluster', '구상성단'], PN: ['nebula', '행성상성운'], HII: ['nebula', '발광성운'],
  EmN: ['nebula', '발광성운'], Neb: ['nebula', '발광성운'], 'Cl+N': ['nebula', '발광성운'], RfN: ['nebula', '반사성운'], SNR: ['nebula', '초신성잔해'],
  DrkN: ['nebula', '암흑성운'], '*Ass': ['other', '성군'], '**': ['star', '이중성'], Other: ['other', '성군'] };
function galaxySub(morph) {
  const m = morph.replace(/^\(R'?\)/, '').trim();
  if (/^(c?E|E\+)/.test(m) && !/^E-?S0/.test(m)) return '타원은하';
  if (/^(S0|SA0|SB0|SAB0|E-?S0|S0-a)/.test(m) || /^SA\(s\)0/.test(m)) return '렌즈형은하';
  if (/^(I|Im|IB|IAB|Irr)/.test(m)) return '불규칙은하';
  if (/^SB/.test(m)) return '막대나선은하';
  if (/^(SA|SAB|S)/.test(m)) return '나선은하';
  return null;
}
// source 문자열: {출처: [항목...]} 묶음
function srcText(map, note) {
  const groups = new Map();
  for (const [field, s] of map) { if (!s) continue; if (!groups.has(s)) groups.set(s, []); groups.get(s).push(field); }
  const parts = [...groups].map(([s, fs_]) => `${fs_.join('·')}: ${s}`);
  if (note) parts.push(note);
  return parts.join('; ');
}

const out = [];
const push = o => {
  const ORDER = ['id', 'nameKo', 'nameEn', 'aliasesKo', 'catalog', 'altCatalog', 'type', 'subtype', 'constellationKo', 'ra', 'dec', 'mag', 'magRange', 'absMag',
    'distanceLy', 'distanceAU', 'distanceKm', 'parent', 'sizeArcmin', 'spectral', 'bv', 'radiusSun', 'components', 'diameterKm', 'moons', 'orbitYears',
    'dynamic', 'body', 'wikiTitleEn', 'featured', 'source'];
  const extra = Object.keys(o).filter(k => !ORDER.includes(k));
  if (extra.length) problems.push(`${o.id}: 사양에 없는 필드 ${extra.join(',')}`);
  const r = {}; for (const k of ORDER) if (o[k] !== undefined) r[k] = o[k];
  out.push(r);
};
function conCheck(id, ra, dec, declared) {
  const c = A.Constellation(ra, dec).symbol;
  if (declared && conFix(declared) !== c) problems.push(`${id}: 원자료 별자리 ${declared} ≠ 좌표상 ${c}`);
  if (!CON_KO[c]) problems.push(`${id}: 별자리 한글 이름 없음 ${c}`);
  return CON_KO[c];
}

// ── 태양계 ──
for (const s of SOLAR) push({ ...s, constellationKo: null, dynamic: true });

// ── 별 ──
const cleanSp = s => s.replace(/\s*(comp|SB)\b/g, '').replace(/\+?\.\.\.$/, '').replace(/:/g, '').replace(/var$/, '').replace(/(I|V)v$/, '$1').trim();
for (const r of STARS) {
  const h = r.hyg ? OD.hyg[r.hyg] : null;
  if (r.hyg && !h) { problems.push(`${r.id}: HYG에 ${r.hyg} 없음`); continue; }
  const src = new Map();
  const ra = h ? h.ra : sexH(r.ra), dec = h ? h.dec : sexH(r.dec);
  src.set('좌표', h ? 'HYG v4.1' : r.posSrc);
  const constellationKo = conCheck(r.id, ra, dec, h ? h.con : r.con);
  let mag = r.mag ?? h?.mag; src.set('등급', r.mag != null ? r.magSrc : 'HYG v4.1');
  let distLy = r.dist ?? (h?.distPc ? sig3(h.distPc * LY_PER_PC) : undefined);
  src.set('거리', r.dist != null ? r.distSrc : 'HYG v4.1');
  let absMag, absSrc;
  if (r.absMag != null) { absMag = r.absMag; absSrc = r.absSrc; }
  else if (h) {
    absMag = r.dist != null ? r2(mag - 5 * Math.log10(r.dist / LY_PER_PC / 10)) : r2(h.absmag);
    absSrc = r.dist != null ? '거리지수' : 'HYG v4.1';
    if (r.mag != null && r.dist == null && h.distPc) { absMag = r2(mag - 5 * Math.log10(h.distPc / 10)); absSrc = '거리지수'; }
    if (r.wabs != null && Math.abs(absMag - r.wabs) > 0.5) { notes.push(`${r.id}: 절대등급 ${absMag} → Wikipedia ${r.wabs}`); absMag = r.wabs; absSrc = W; }
  }
  src.set('절대등급', absSrc);
  const spectral = r.sp ?? (h ? cleanSp(h.spect) : undefined); src.set('분광형', spectral ? (r.sp ? r.spSrc : 'HYG v4.1') : undefined);
  const bv = r.bv ?? (h?.ci ?? undefined); src.set('B−V', r.bv != null ? r.bvSrc : (h?.ci != null ? 'HYG v4.1' : undefined));
  let components;
  if (r.comp) {
    components = r.comp.map(c => {
      const ch = c.hyg ? OD.hyg[c.hyg] : null;
      if (c.hyg && !ch) problems.push(`${r.id}: 성분 HYG ${c.hyg} 없음`);
      return { nameKo: c.ko, mag: c.mag ?? ch.mag, distanceLy: c.dist ?? (r.dist ?? sig3(ch.distPc * LY_PER_PC)) };
    });
    const cs = r.comp.some(c => c.magSrc) ? '성분 등급 일부 Wikipedia' : null;
    if (cs) src.set('성분', 'HYG v4.1·Wikipedia');
  }
  push({ id: r.id, nameKo: r.ko, nameEn: r.en, aliasesKo: r.al, catalog: r.cat, altCatalog: r.alt, type: 'star', subtype: r.sub || '단일별', constellationKo,
    ra: r5(ra), dec: r4(dec), mag: r2(mag), absMag, distanceLy: distLy, spectral, bv, components, wikiTitleEn: r.wiki, source: srcText(src, r.note) });
}

// ── 딥스카이 ──
for (const r of DSO) {
  const src = new Map();
  const n = r.ngc ? OD.ngc[r.ngc] : null;
  if (r.ngc && !n) { problems.push(`${r.id}: OpenNGC에 ${r.ngc} 없음`); continue; }
  let ra, dec, declaredCon;
  if (r.posHyg) { const h = OD.hyg[r.posHyg]; ra = h.ra; dec = h.dec; declaredCon = h.con; }
  else if (r.ra) { ra = sexH(r.ra); dec = sexH(r.dec); declaredCon = r.con; }
  else { ra = sexH(n.ra); dec = sexH(n.dec); declaredCon = n.con; }
  src.set('좌표', r.posSrc || 'OpenNGC');
  const constellationKo = conCheck(r.id, ra, dec, declaredCon);

  let [type, sub] = n ? (NGC_TYPE[n.type] || [null, null]) : [r.type, r.sub];
  if (r.type) type = r.type; if (r.sub) sub = r.sub;
  if (type === 'galaxy') {
    sub = galaxySub(r.morph || n.hubble || '');
    if (!sub) problems.push(`${r.id}: 은하 형태 판정 불가 (${r.morph})`);
    src.set('형태', r.morph ? 'Wikipedia(NED)' : 'OpenNGC');
  }
  if (!type || !sub) problems.push(`${r.id}: type/subtype 미정 (${n?.type})`);

  // 등급
  let mag, magSrc;
  const h = n && n.type === 'GCl' ? OD.harris[harrisKey(r.ngc)] : null;
  if (r.mag != null) { mag = r.mag; magSrc = r.magSrc; }
  else if (r.posHyg) { mag = OD.hyg[r.posHyg].mag; magSrc = r.magSrc; }
  else if (h) { mag = h.vt; magSrc = 'Harris 2010'; }
  else if (n) {
    const bvMin = type === 'galaxy' ? 0.4 : type === 'cluster' ? -0.4 : -Infinity;
    if (n.v != null && !(n.b != null && n.b - n.v < bvMin)) { mag = n.v; magSrc = 'OpenNGC'; }
    else if (n.v == null && n.b != null) { mag = n.b; magSrc = 'OpenNGC B등급(V 없음)'; }
    else if (r.wmag != null) { mag = r.wmag; magSrc = r.magSrc || (n.v != null ? `Wikipedia(OpenNGC V ${n.v}는 B−V로 볼 때 이상)` : 'Wikipedia'); }
  }
  if (mag == null) problems.push(`${r.id}: 등급 없음`);
  if (mag != null && r.wmag != null && Math.abs(mag - r.wmag) >= 1 && !r.magReviewed && r.mag == null)
    problems.push(`${r.id}: 등급 ${mag}(${magSrc}) vs Wikipedia ${r.wmag} — 검토 후 magReviewed 또는 mag 지정`);
  src.set('등급', magSrc);

  // 크기
  let size, sizeSrc;
  if (r.size != null) { size = r.size; sizeSrc = r.sizeSrc; }
  else if (n?.majAx) {
    size = n.majAx; sizeSrc = 'OpenNGC';
    if (r.wsize && Math.max(r.wsize, size) / Math.min(r.wsize, size) > 1.5) { notes.push(`${r.id}: 크기 OpenNGC ${size}′ → Wikipedia ${r.wsize}′`); size = r.wsize; sizeSrc = W; }
  } else if (r.wsize) { size = r.wsize; sizeSrc = W; }
  if (type !== 'star') src.set('크기', sizeSrc);

  // 거리
  if (!r.noDist) src.set('거리', r.distSrc || '문헌(Wikipedia와 대조)');

  const mnum = /^m(\d+)$/.exec(r.id)?.[1];
  const catalog = r.cat || (mnum ? `M${mnum}` : fmtName(r.ngc));
  const altCatalog = r.alt || (mnum && r.ngc ? fmtName(r.ngc) : undefined);
  const nameKo = r.ko || (mnum ? `M${mnum} ${sub}` : `${catalog} ${sub}`);
  const o = { id: r.id, nameKo, nameEn: r.en, aliasesKo: r.al, catalog, altCatalog, type, subtype: sub, constellationKo, ra: r5(ra), dec: r4(dec),
    mag: mag == null ? null : r2(mag), distanceLy: r.noDist ? undefined : r.dist, sizeArcmin: type === 'star' ? undefined : (size == null ? undefined : r2(size)),
    wikiTitleEn: r.wiki, ...(r.extra || {}) };
  o.source = srcText(src, r.note);
  push(o);
}

// ═════════════════════════════════════ 「관측회 추천」 ═════════════════════════════════════
const OBS = new A.Observer(EVENT.lat, EVENT.lon, EVENT.height);
function altAt(o, date) {
  const time = A.MakeTime(date);
  if (o.dynamic) { const eq = A.Equator(o.body, time, OBS, true, true); return A.Horizon(time, OBS, eq.ra, eq.dec, 'normal').altitude; }
  const v = A.VectorFromSphere(new A.Spherical(o.dec, o.ra * 15, 1), time);
  const eq = A.EquatorFromVector(A.RotateVector(A.Rotation_EQJ_EQD(time), v));
  return A.Horizon(time, OBS, eq.ra, eq.dec, 'normal').altitude;
}
const t0 = new Date(`${EVENT.date}T${EVENT.from}:00+09:00`), t1 = new Date(`${EVENT.date}T${EVENT.to}:00+09:00`);
const kept = [], dropped = [];
for (const id of FEATURED_CANDIDATES) {
  const o = out.find(x => x.id === id);
  if (!o) { problems.push(`추천 후보 ${id} 가 목록에 없음`); continue; }
  let max = -90;
  for (let t = +t0; t <= +t1; t += 5 * 60000) max = Math.max(max, altAt(o, new Date(t)));
  if (max >= EVENT.minAlt) { o.featured = true; kept.push(`${id}(${max.toFixed(1)}°)`); } else dropped.push(`${id}(${max.toFixed(1)}°)`);
}
// featured 키가 source 뒤로 가지 않게 다시 정렬
for (let i = 0; i < out.length; i++) { const o = out[i]; if (o.featured) { const { source, ...rest } = o; out[i] = { ...rest, featured: true, source }; } }

// ═════════════════════════════════════ 출력 ═════════════════════════════════════
const ids = new Set();
for (const o of out) { if (ids.has(o.id)) problems.push(`중복 id ${o.id}`); ids.add(o.id); }
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
const byType = {};
for (const o of out) byType[`${o.type}/${o.subtype}`] = (byType[`${o.type}/${o.subtype}`] || 0) + 1;
console.log(`catalog.json: ${out.length}개 → ${path.relative(process.cwd(), OUT)}  (데이터: ${OPENDATA ? 'opendata 원본 + 스냅숏 갱신' : '스냅숏'})`);
console.log('종류별:', byType);
console.log(`관측회 추천 유지 ${kept.length}: ${kept.join(', ')}`);
console.log(`관측회 추천 제외 ${dropped.length}: ${dropped.join(', ') || '없음'}`);
if (process.argv.includes('--verbose')) console.log('규칙 적용:\n  ' + notes.join('\n  '));
if (problems.length) { console.log('문제:\n  ' + problems.join('\n  ')); process.exitCode = 1; } else console.log('문제 없음');
