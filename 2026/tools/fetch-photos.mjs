#!/usr/bin/env node
// fetch-photos.mjs — 천체 기본 사진(Wikimedia Commons) 수집기
//
// 사용법 (Node 24, npm 의존성 없음 / 사진 재인코딩에 Python + Pillow 필요):
//   node tools/fetch-photos.mjs                       # data/catalog.json (없으면 시제품 catalog-draft.json)
//   node tools/fetch-photos.mjs path/to/catalog.json
//   옵션:
//     --only=m31,m42      이 id만 처리
//     --force             이미 사진이 있어도 다시 받기 (--only와 같이 쓰기 권장)
//     --dry               내려받지 않고 어떤 파일/라이선스가 골라지는지만 출력
//     --refresh-credits   사진은 두고 credits.json의 저작자/라이선스 문구만 Commons에서 다시 읽기
//     --staging=DIR       원본 썸네일 임시 저장 폴더 (기본: OS 임시폴더/gwangsu-fetch-photos)
//     --python=CMD        파이썬 실행 명령 (기본: python)
//
// 동작: 별(star / double-star)은 건너뜀(사이트가 색 점으로 그림). 이미 img/objects/{id}.jpg가
// 있는 id도 건너뜀. 나머지는 영어 위키백과 요약 API의 대표 사진 → Commons 라이선스 확인 →
// 330px 썸네일 → photo_reencode.py로 JPEG(폭 330, q≈82, ≤60KB) → data/credits.json 기록.
// 대표 사진이 차트·지도·도표 등이거나 자유 라이선스가 아니면 Commons 검색으로 대체 후보를 찾는다.
// 사람이 확인해서 고른 파일은 아래 OVERRIDES에, 사진을 넣지 않을 id는 EXCLUDE에 적는다.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOLS, '..');                       // cosmos/2026
const OUT_DIR = path.join(ROOT, 'img', 'objects');
const CREDITS_PATH = path.join(ROOT, 'data', 'credits.json');
const DEFAULT_CATALOG = path.join(ROOT, 'data', 'catalog.json');
const PROTOTYPE_CATALOG = path.resolve(ROOT, '..', '..', '주민관측회', '2026', '계획단계_시제품', 'catalog-draft.json');
const REENCODE_PY = path.join(TOOLS, 'photo_reencode.py');

const UA = 'GwangsuStargazing/1.0 (school project; kbs26123@gmail.com)';
const MIN_GAP_MS = 1100;          // 요청 간 최소 간격
const THUMB_WIDTH = 330;          // Wikimedia 표준 썸네일 폭 (20,40,60,120,250,330,500,960,1280,1920,3840)
const FALLBACK_WIDTH = 500;
const MIN_SOURCE_WIDTH = 250;     // 이보다 작은 원본은 쓰지 않음

const SKIP_TYPES = new Set(['star', 'double-star']);

// 사람이 직접 고른 Commons 파일 (대표 사진이 부적절할 때). id → 'File:...'
const OVERRIDES = {
  m38: 'File:M38, NGC 1912 (noao-m38).jpg',   // 대표 사진은 IC 410/417 성운이 주인공인 넓은 시야
  m63: 'File:M63, NGC 5055 (noao-m63).jpg',   // 대표 사진(HST 모자이크)은 모서리가 검게 비어 있음
  m65: 'File:M65 (noao-m65greiner).jpg',      // 대표 사진(HST)은 은하 일부만 + 계단 모양 검은 빈칸
};

// 대체 후보 검색어를 직접 지정할 id. id → Commons 검색어
const SEARCH_HINTS = {
};

// Commons 메타데이터에 저작자 칸이 비어 있어 설명문에서 옮겨 적은 것. id → 저작자 표기
const AUTHOR_OVERRIDES = {
  m52: '2MASS (UMass / IPAC-Caltech), NASA, NSF',   // File:M52atlas.jpg 설명의 Credit 문구
};

// 사진을 넣지 않기로 한 id (이유 메모)
const EXCLUDE = {
};

// 파일 이름으로 보아 천체 사진이 아닐 가능성이 큰 것
// ("telescope"는 넣지 않음 — "…captured by the Hubble Space Telescope.tif"처럼 진짜 사진 이름에 흔함)
const NOT_PHOTO_RE = /(\bmap\b|_map|map\.|chart|diagram|finder|\blocat|\bposition|constellation|logo|sketch|drawing|illustration|comparison|\borbits?\b|\bplot\b|\bgraph\b|artist|impression|\.svg)/i;

// ---------------------------------------------------------------- args
const args = process.argv.slice(2);
const opt = { only: null, force: false, dry: false, staging: path.join(os.tmpdir(), 'gwangsu-fetch-photos'), python: 'python' };
let catalogArg = null;
for (const a of args) {
  if (a.startsWith('--only=')) opt.only = new Set(a.slice(7).split(',').map(s => s.trim()).filter(Boolean));
  else if (a === '--force') opt.force = true;
  else if (a === '--dry') opt.dry = true;
  else if (a === '--refresh-credits') opt.refreshCredits = true;
  else if (a.startsWith('--staging=')) opt.staging = path.resolve(a.slice(10));
  else if (a.startsWith('--python=')) opt.python = a.slice(9);
  else if (!a.startsWith('--')) catalogArg = a;
  else { console.error('unknown option', a); process.exit(2); }
}

function pickCatalogPath() {
  if (catalogArg) return path.resolve(catalogArg);
  if (fs.existsSync(DEFAULT_CATALOG)) return DEFAULT_CATALOG;
  return PROTOTYPE_CATALOG;
}

// ---------------------------------------------------------------- polite fetch
let lastReq = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function politeFetch(url, { tries = 6 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const wait = lastReq + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastReq = Date.now();
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, 'Accept-Encoding': 'gzip' } });
    } catch (e) {
      if (attempt >= tries) throw e;
      await sleep(2000 * attempt);
      continue;
    }
    if ((res.status === 429 || res.status === 503 || res.status === 502) && attempt < tries) {
      const ra = Number(res.headers.get('retry-after'));
      const backoff = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(60000, 5000 * 2 ** (attempt - 1));
      console.warn(`  ${res.status} → ${Math.round(backoff / 1000)}s 대기 후 재시도 (${attempt}/${tries})`);
      await res.arrayBuffer().catch(() => {});
      await sleep(backoff);
      continue;
    }
    return res;
  }
}

async function getJSON(url) {
  const res = await politeFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

// ---------------------------------------------------------------- helpers
function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function plain(html, max = 0) {
  if (!html) return '';
  let s = String(html)
    .replace(/<(br|\/?p|\/?div|\/?li|\/?ul|\/?ol|\/?tr|\/?td|\/?th|\/?table)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '');
  s = decodeEntities(s).replace(/\s+/g, ' ').replace(/\s+([,.;:)\]])/g, '$1').replace(/([(\[])\s+/g, '$1').trim();
  if (max && s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return s;
}
function commonsPageUrl(title) {
  return 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')).replace(/%3A/g, ':');
}
function fileFromUploadUrl(u) {
  const parts = new URL(u).pathname.split('/');       // /wikipedia/commons/[thumb/]a/ab/Name.jpg[/330px-Name.jpg]
  const i = parts.indexOf('thumb');
  const name = i >= 0 ? parts[i + 3] : parts[parts.length - 1];
  return { repo: parts[2], title: 'File:' + decodeURIComponent(name).replace(/_/g, ' ') };
}

// 자유 라이선스만: Public domain / CC0 / CC BY / CC BY-SA
function normalizeLicense(md) {
  if ((md.NonFree?.value || '').toString().toLowerCase() === 'true') return null;
  const s = plain(md.LicenseShortName?.value || '');
  if (/^(public domain|pd\b|pd-)/i.test(s)) return 'Public domain';
  if (/^(cc0|cc[- ]zero)/i.test(s)) return 'CC0';
  const m = s.match(/^CC[- ]BY(-SA)?[- ](IGO[- ])?(\d\.\d)(.*)$/i);
  if (m && !/\b(NC|ND)\b/i.test(s)) {
    const sa = m[1] ? '-SA' : '';
    const rest = (m[2] ? ' IGO' : '') + (m[4] || '').replace(/\s+/g, ' ');
    return `CC BY${sa} ${m[3]}${rest}`.trim();
  }
  return null;
}

async function imageInfo(titles) {
  // titles: ['File:..', ...] (최대 50) → Map(requestedTitle → info|null)
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1'
    + '&prop=imageinfo&iiprop=extmetadata|url|size|mime&iiurlwidth=' + THUMB_WIDTH
    + '&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl|Credit|ImageDescription|NonFree|AttributionRequired'
    + '&titles=' + encodeURIComponent(titles.join('|'));
  const j = await getJSON(url);
  const out = new Map();
  const alias = new Map();
  for (const n of j?.query?.normalized || []) alias.set(n.to, n.from);
  for (const r of j?.query?.redirects || []) alias.set(r.to, alias.get(r.from) || r.from);
  for (const p of j?.query?.pages || []) {
    const req = alias.get(p.title) || p.title;
    const ii = p.imageinfo?.[0];
    if (p.missing || !ii) { out.set(req, null); continue; }
    out.set(req, { title: p.title, ...ii });
  }
  for (const t of titles) if (!out.has(t)) out.set(t, null);
  return out;
}

// 후보 하나를 평가: 문제 없으면 null, 있으면 이유 문자열
function rejectReason(info, { allowNameFlag = false } = {}) {
  if (!info) return 'Commons에 없음(로컬/비자유 파일?)';
  const lic = normalizeLicense(info.extmetadata || {});
  if (!lic) return `라이선스 불가: ${plain(info.extmetadata?.LicenseShortName?.value) || '?'}`;
  if (!/^image\/(jpeg|png|gif|tiff|webp|svg\+xml)$/.test(info.mime)) return `형식 ${info.mime}`;
  if (info.width < MIN_SOURCE_WIDTH) return `너무 작음 ${info.width}px`;
  if (!allowNameFlag && (NOT_PHOTO_RE.test(info.title) || info.mime === 'image/svg+xml')) return `사진 아닐 수 있음(파일명/형식): ${info.title}`;
  return null;
}

function searchQuery(obj) {
  if (SEARCH_HINTS[obj.id]) return SEARCH_HINTS[obj.id];
  const cat = obj.catalog || '';
  const m = cat.match(/^M\s?(\d+)$/i);
  if (m) return `"Messier ${m[1]}"`;
  if (/^(NGC|IC)\s?\d+/i.test(cat)) return `"${cat}"`;
  return `"${obj.nameEn || obj.wikiTitleEn}"`;
}

async function searchCommons(obj) {
  const q = searchQuery(obj) + ' filetype:bitmap';
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&list=search'
    + '&srnamespace=6&srlimit=15&srsearch=' + encodeURIComponent(q);
  const j = await getJSON(url);
  return (j?.query?.search || []).map(r => r.title);
}

// 한 천체에 쓸 이미지 고르기 → { info, via, note } 또는 { error }
async function chooseImage(obj) {
  const notes = [];
  if (OVERRIDES[obj.id]) {
    const t = OVERRIDES[obj.id];
    const info = (await imageInfo([t])).get(t);
    const why = rejectReason(info, { allowNameFlag: true });
    if (!why) return { info, via: 'override' };
    return { error: `override ${t}: ${why}` };
  }

  if (obj.wikiTitleEn) {
    const sum = await getJSON('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(obj.wikiTitleEn.replace(/ /g, '_')));
    const src = sum?.originalimage?.source || sum?.thumbnail?.source;
    if (!sum) notes.push('위키 문서 없음');
    else if (!src) notes.push('대표 사진 없음');
    else {
      const f = fileFromUploadUrl(src);
      if (f.repo !== 'commons') notes.push(`대표 사진이 ${f.repo} 로컬 파일(비자유 가능): ${f.title}`);
      else {
        const info = (await imageInfo([f.title])).get(f.title);
        const why = rejectReason(info);
        if (!why) return { info, via: 'lead' };
        notes.push(`대표 사진 탈락 — ${why}`);
      }
    }
  }

  const titles = await searchCommons(obj);
  if (titles.length) {
    const infos = await imageInfo(titles.slice(0, 15));
    for (const t of titles) {
      const info = infos.get(t);
      if (!rejectReason(info)) return { info, via: 'search', note: notes.join(' / ') };
    }
  }
  return { error: (notes.join(' / ') || '') + ` / 검색(${searchQuery(obj)}) 후보 없음` };
}

async function download(info, stagingBase) {
  let url = info.thumburl || info.url;
  let res = await politeFetch(url);
  if (!res.ok && (res.status === 400 || res.status === 404) && url.includes(`/${THUMB_WIDTH}px-`)) {
    url = url.replace(`/${THUMB_WIDTH}px-`, `/${FALLBACK_WIDTH}px-`);
    res = await politeFetch(url);
  }
  if (!res.ok) throw new Error(`이미지 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 15 * 1024 * 1024) throw new Error('이미지가 너무 큼');
  const ct = (res.headers.get('content-type') || '').split(';')[0];
  const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' }[ct] || '.bin';
  const p = stagingBase + ext;
  fs.writeFileSync(p, buf);
  return p;
}

function reencode(src, dst) {
  const r = spawnSync(opt.python, ['-I', REENCODE_PY, src, dst, String(THUMB_WIDTH), '82', '60000'], { cwd: TOOLS, encoding: 'utf8' });
  const line = (r.stdout || '').trim().split('\n').pop() || '';
  try { return JSON.parse(line); } catch { return { ok: false, error: (r.stderr || line || r.error?.message || 'python 실행 실패').trim() }; }
}

function loadCredits() {
  try { return JSON.parse(fs.readFileSync(CREDITS_PATH, 'utf8')); } catch { return {}; }
}
function saveCredits(c) {
  const sorted = Object.fromEntries(Object.keys(c).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map(k => [k, c[k]]));
  fs.writeFileSync(CREDITS_PATH + '.part', JSON.stringify(sorted, null, 2) + '\n');
  fs.renameSync(CREDITS_PATH + '.part', CREDITS_PATH);
}

function authorText(md) {
  const html = md.Artist?.value || '';
  let a = plain(html);
  if (a.length > 120) {   // 긴 설명 속에 "Credit: …" 줄이 있으면 그것만
    const m = html.match(/Credit\s*(?:<\/b>|<\/strong>)?\s*:\s*([\s\S]*?)(?:<br|<\/p>|$)/i);
    if (m && plain(m[1])) a = plain(m[1]);
  }
  if (!a) a = plain(md.Credit?.value);
  a = a.replace(/^(image\s+)?(credits?|authors?)\s*:\s*/i, '').replace(/^image\s*:\s*/i, '')
    .replace(/^(credit line and )?copyright\s+/i, '')
    .replace(/(^|[\s,(])(?:en|w|commons):(?=\S)/g, '$1');            // "en:NASA" 같은 위키 링크 접두어
  a = a.split(/\s+(?:Acknowledge?ments?\s*:|The science team (?:consists of|includes)\s*:?)/i)[0].trim()
    .replace(/[\s/,;]+$/, '');
  if (a.length > 200) a = a.slice(0, 199).replace(/\s+\S*$/, '') + '…';
  return a || 'Unknown';
}

function creditEntry(id, info) {
  const md = info.extmetadata || {};
  const author = AUTHOR_OVERRIDES[id] || authorText(md);
  const entry = {
    file: `img/objects/${id}.jpg`,
    title: info.title,
    author,
    license: normalizeLicense(md),
    licenseUrl: md.LicenseUrl?.value || null,
    source: commonsPageUrl(info.title),
  };
  const desc = plain(md.ImageDescription?.value, 160);
  if (desc) entry.description = desc;
  return entry;
}

// credits.json에 있는 항목의 저작자/라이선스 문구를 Commons에서 다시 읽어 갱신 (사진은 그대로)
async function refreshCredits() {
  const credits = loadCredits();
  const ids = Object.keys(credits).filter(id => !opt.only || opt.only.has(id));
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const infos = await imageInfo(chunk.map(id => credits[id].title));
    for (const id of chunk) {
      const info = infos.get(credits[id].title);
      const why = rejectReason(info, { allowNameFlag: true });
      if (why) { console.log(`! ${id}: ${why} — 그대로 둠(확인 필요)`); continue; }
      credits[id] = creditEntry(id, info);
    }
  }
  saveCredits(credits);
  console.log(`credits ${ids.length}개 갱신`);
}

// ---------------------------------------------------------------- main
async function main() {
  if (opt.refreshCredits) return refreshCredits();
  const catPath = pickCatalogPath();
  const raw = JSON.parse(fs.readFileSync(catPath, 'utf8'));
  const catalog = Array.isArray(raw) ? raw : (raw.objects || Object.values(raw));
  console.log(`catalog: ${catPath} (${catalog.length}개)`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(CREDITS_PATH), { recursive: true });
  fs.mkdirSync(opt.staging, { recursive: true });

  const credits = loadCredits();
  const summary = { saved: [], skippedExisting: 0, skippedStar: 0, excluded: [], failed: [] };

  for (const obj of catalog) {
    const id = obj.id;
    if (!id) continue;
    if (opt.only && !opt.only.has(id)) continue;
    if (SKIP_TYPES.has(obj.type)) { summary.skippedStar++; continue; }
    if (EXCLUDE[id]) { summary.excluded.push(`${id}: ${EXCLUDE[id]}`); continue; }
    const dst = path.join(OUT_DIR, `${id}.jpg`);
    if (!opt.force && fs.existsSync(dst)) { summary.skippedExisting++; continue; }

    let pick;
    try { pick = await chooseImage(obj); } catch (e) { pick = { error: e.message }; }
    if (pick.error) { console.log(`✗ ${id}: ${pick.error}`); summary.failed.push(`${id}: ${pick.error}`); continue; }
    const lic = normalizeLicense(pick.info.extmetadata);
    const tag = `${id}\t[${pick.via}]\t${lic}\t${pick.info.width}x${pick.info.height}\t${pick.info.title}${pick.note ? '\t(' + pick.note + ')' : ''}`;
    if (opt.dry) { console.log('· ' + tag); continue; }

    try {
      const staged = await download(pick.info, path.join(opt.staging, id));
      const r = reencode(staged, dst);
      fs.rmSync(staged, { force: true });
      if (!r.ok) throw new Error('재인코딩 실패: ' + r.error);
      credits[id] = creditEntry(id, pick.info);
      saveCredits(credits);
      summary.saved.push(id);
      console.log(`✓ ${tag}\t→ ${r.w}x${r.h} ${(r.bytes / 1024).toFixed(1)}KB${r.reencoded ? '' : ' (원본 그대로)'}`);
    } catch (e) {
      console.log(`✗ ${id}: ${e.message}`);
      summary.failed.push(`${id}: ${e.message}`);
    }
  }

  // 사진은 있는데 카탈로그에 없는 id(이름 바뀐 id 등) 알림 — 지우지는 않음
  const ids = new Set(catalog.map(o => o.id));
  const orphans = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.jpg')).map(f => f.slice(0, -4)).filter(id => !ids.has(id));
  const total = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.jpg')).reduce((s, f) => s + fs.statSync(path.join(OUT_DIR, f)).size, 0);

  console.log('\n==== 요약 ====');
  console.log(`새로 저장 ${summary.saved.length} / 이미 있음 ${summary.skippedExisting} / 별 건너뜀 ${summary.skippedStar} / 제외 ${summary.excluded.length} / 실패 ${summary.failed.length}`);
  if (summary.excluded.length) console.log('제외:\n  ' + summary.excluded.join('\n  '));
  if (summary.failed.length) console.log('실패:\n  ' + summary.failed.join('\n  '));
  if (orphans.length) console.log('카탈로그에 없는 사진(확인 필요): ' + orphans.join(', '));
  console.log(`img/objects 합계 ${(total / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(e => { console.error(e); process.exit(1); });
