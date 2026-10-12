// 별자리 88개 대표 그림: Till Credner의 별자리 사진(File:{라틴이름}CC.jpg, CC BY-SA 3.0) 우선,
// 없으면 IAU 공식 성도(File:{라틴이름} IAU.svg)를 330px PNG로 받아 → 어두운 배경으로 반전(tools/invert-charts.py)
// 사용: node tools/fetch-constellation-photos.mjs [--force]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'GwangsuStargazing/1.0 (school project; kbs26123@gmail.com)';
const force = process.argv.includes('--force');
const cons = JSON.parse(readFileSync(path.join(ROOT, 'data/constellations.json'), 'utf8'));
const creditsPath = path.join(ROOT, 'data/credits.json');
const credits = JSON.parse(readFileSync(creditsPath, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function info(title) {
  const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=330&titles=' + encodeURIComponent(title);
  for (let i = 0; i < 4; i++) {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    if (r.status === 429) { await sleep(5000); continue; }
    const j = await r.json();
    const p = Object.values(j.query.pages)[0];
    if (!p || p.missing !== undefined || !p.imageinfo) return null;
    return p.imageinfo[0];
  }
  return null;
}
async function download(url, file) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.status === 429) { await sleep(5000); continue; }
    if (!r.ok) throw new Error(r.status + ' ' + url);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    return;
  }
  throw new Error('429 반복');
}

const toInvert = [];
for (const o of cons) {
  const out = path.join(ROOT, 'img/objects', o.id + '.jpg');
  const cur = credits[o.id];
  if (!force && cur && cur.kind) { continue; } // 이 스크립트로 이미 받은 것
  const latin = o.nameEn.replace(/ö/g, 'o');
  const tries = [
    { title: 'File:' + latin.replace(/\s+/g, '') + 'CC.jpg', kind: 'photo' },
    { title: 'File:' + o.nameEn + ' IAU.svg', kind: 'chart' },
    { title: 'File:' + latin + ' IAU.svg', kind: 'chart' },
  ];
  let got = null, kind = '';
  for (const t of tries) { got = await info(t.title); await sleep(700); if (got) { got.title = t.title; kind = t.kind; break; } }
  if (!got) { console.log('✗', o.id, '찾지 못함'); continue; }
  const m = got.extmetadata || {};
  const tmp = kind === 'chart' ? out.replace(/\.jpg$/, '.chart.png') : out;
  await download(got.thumburl, tmp);
  await sleep(700);
  credits[o.id] = {
    file: 'img/objects/' + o.id + '.jpg', title: got.title,
    author: strip(m.Artist && m.Artist.value) || (kind === 'chart' ? 'IAU and Sky & Telescope magazine' : 'Till Credner'),
    license: strip(m.LicenseShortName && m.LicenseShortName.value), licenseUrl: (m.LicenseUrl && m.LicenseUrl.value) || null,
    source: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(got.title.replace(/ /g, '_')), kind,
  };
  if (kind === 'chart') toInvert.push(o.id);
  console.log('✓', o.id, kind, got.title, credits[o.id].license);
}
writeFileSync(creditsPath, JSON.stringify(credits, null, 1));
writeFileSync(path.join(ROOT, 'tools', '.charts-to-invert.json'), JSON.stringify(toInvert));
console.log('사진', cons.filter((o) => credits[o.id] && credits[o.id].kind === 'photo').length, '/ 성도', cons.filter((o) => credits[o.id] && credits[o.id].kind === 'chart').length, '/ 반전 대기', toInvert.length);
