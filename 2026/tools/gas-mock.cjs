// Apps Script(Code.gs)를 Node에서 돌리기 위한 가짜 환경 — 배포 없이 서버 로직을 시험할 때 사용
// 사용: const { loadGas } = require('./gas-mock.cjs'); const gas = loadGas(); gas.call({action:'counts'})
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function makeSheet() {
  const rows = []; // 2차원 배열(1행 = 헤더)
  const width = () => rows.reduce((m, r) => Math.max(m, r.length), 0);
  const cell = (r, c) => (rows[r - 1] && rows[r - 1][c - 1] !== undefined ? rows[r - 1][c - 1] : '');
  const setCell = (r, c, v) => { while (rows.length < r) rows.push([]); rows[r - 1][c - 1] = v; };
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j))),
    setValues: (vals) => { vals.forEach((row, i) => row.forEach((v, j) => setCell(r + i, c + j, v))); return range(r, c, nr, nc); },
    setValue: (v) => { setCell(r, c, v); return range(r, c); },
    setFontWeight: () => range(r, c, nr, nc),
  });
  return {
    rows,
    getLastRow: () => rows.length,
    getLastColumn: () => width(),
    getRange: range,
    appendRow: (vals) => { rows.push(vals.slice()); },
    deleteRow: (r) => { rows.splice(r - 1, 1); },
    setFrozenRows: () => {},
  };
}

function loadGas(opts = {}) {
  const props = Object.assign({ ADMIN_PW: 'test-pw', SHEET_ID: 'sheet1', FOLDER_ID: 'folder1' }, opts.props || {});
  const sheet = makeSheet();
  const cache = new Map();
  const files = new Map();
  const folders = new Map();
  const root = { id: 'folder1', name: 'root', parent: null };
  folders.set(root.id, root);
  const folderApi = (f) => ({
    getId: () => f.id, getUrl: () => 'https://drive/' + f.id,
    getFoldersByName: (n) => { const hit = [...folders.values()].filter((x) => x.parent === f.id && x.name === n); let i = 0; return { hasNext: () => i < hit.length, next: () => folderApi(hit[i++]) }; },
    createFolder: (n) => { const nf = { id: 'f' + folders.size, name: n, parent: f.id }; folders.set(nf.id, nf); return folderApi(nf); },
    createFile: (blob) => { const id = 'file' + crypto.randomBytes(8).toString('hex'); files.set(id, { id, parent: f.id, blob, trashed: false }); return fileApi(files.get(id)); },
    getParents: () => { const p = f.parent ? [folders.get(f.parent)] : []; let i = 0; return { hasNext: () => i < p.length, next: () => folderApi(p[i++]) }; },
    setSharing: () => {},
  });
  const fileApi = (file) => ({
    getId: () => file.id, setDescription: () => {}, setSharing: () => {}, setTrashed: (t) => { file.trashed = t; },
    getParents: () => { const p = [folders.get(file.parent)]; let i = 0; return { hasNext: () => i < p.length, next: () => folderApi(p[i++]) }; },
  });

  const ctx = {
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k), removeAll: (ks) => ks.forEach((k) => cache.delete(k)) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    SpreadsheetApp: {
      openById: (id) => (id === props.SHEET_ID ? { getSheetByName: (n) => (n === '신청' ? sheet : null), insertSheet: () => sheet, getUrl: () => 'https://sheet', getId: () => id } : null),
      getActiveSpreadsheet: () => null, create: () => null,
    },
    DriveApp: {
      getFolderById: (id) => folderApi(folders.get(id)),
      getFileById: (id) => { if (!files.has(id)) throw new Error('no file'); return fileApi(files.get(id)); },
      createFolder: () => folderApi(root),
      Access: { ANYONE_WITH_LINK: 'A' }, Permission: { VIEW: 'V' },
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      sleep: () => {},
      base64Decode: (s) => Buffer.from(s, 'base64'),
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
      formatDate: () => '20261013-000000',
    },
    ContentService: { createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    Logger: { log: () => {} },
  };
  vm.createContext(ctx);
  const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'Code.gs' });
  return {
    ctx, sheet, props, cache, files,
    call: (params) => JSON.parse(ctx.doPost({ parameter: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) }).content),
  };
}
module.exports = { loadGas, makeSheet };
