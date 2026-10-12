// 행사 전 스냅숏: DB 편집 내용 → data/content.json, 포스터 → img/poster.jpg (+ 선택: 사진 사본)
// 사용:  node tools/snapshot.mjs            (글 + 포스터)
//        node tools/snapshot.mjs --photos   (드라이브 사진도 img/uploads/에 사본 저장 + manifest.json)
// 사이트는 정적 파일을 먼저 그리고, DB는 그 이후 변경분만 덮어씀 → 옥상 통신이 약해도 설명 팝업 동작.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = 'https://gwangsu-on-default-rtdb.firebaseio.com/years/2026/cosmosNight';
const withPhotos = process.argv.includes('--photos');

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function download(url, file) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const type = r.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`이미지가 아님(${type}) ${url}`);
  await writeFile(file, Buffer.from(await r.arrayBuffer()));
}
const driveUrl = (id, w) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;

const objects = (await getJson(`${DB}/objects.json`)) || {};
await writeFile(path.join(ROOT, 'data/content.json'), JSON.stringify(objects));
console.log(`content.json: 천체 ${Object.keys(objects).length}개`);

const config = (await getJson(`${DB}/config.json`)) || {};
if (config.posterFileId) {
  await download(driveUrl(config.posterFileId, 1600), path.join(ROOT, 'img/poster.jpg'));
  console.log('poster.jpg 갱신');
}

if (withPhotos) {
  const dir = path.join(ROOT, 'img/uploads');
  await mkdir(dir, { recursive: true });
  const manifestFile = path.join(dir, 'manifest.json');
  const manifest = existsSync(manifestFile) ? JSON.parse(await readFile(manifestFile, 'utf8')) : {};
  const ids = new Set();
  for (const o of Object.values(objects)) {
    for (const p of Object.values(o.photos || {})) if (p.fileId) ids.add(p.fileId);
    for (const s of Object.values(o.hopping || {})) if (s.fileId) ids.add(s.fileId);
  }
  const pages = (await getJson(`${DB}/pages.json`)) || {};
  for (const pg of Object.values(pages)) for (const p of Object.values(pg.photos || {})) if (p.fileId) ids.add(p.fileId);
  let n = 0;
  for (const id of ids) {
    if (manifest[id]) continue;
    const safe = id.replace(/[^A-Za-z0-9_-]/g, '');
    try {
      await download(driveUrl(id, 400), path.join(dir, `${safe}-t.jpg`));
      await download(driveUrl(id, 1600), path.join(dir, `${safe}-f.jpg`));
      manifest[id] = { thumb: `img/uploads/${safe}-t.jpg`, full: `img/uploads/${safe}-f.jpg` };
      n++;
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) { console.warn('실패', id, e.message); }
  }
  // DB에서 지워진 사진은 manifest에서도 뺌 (파일은 남김)
  for (const id of Object.keys(manifest)) if (!ids.has(id)) delete manifest[id];
  await writeFile(manifestFile, JSON.stringify(manifest, null, 1));
  console.log(`사진 사본: 새로 ${n}장, 전체 ${Object.keys(manifest).length}장`);
}
console.log('끝. 커밋·푸시하면 사이트에 반영돼요.');
