/**
 * 2026 광수중학교 주민 공개 천체관측회 — 사전신청(구글 시트) + 천체 사진(구글 드라이브) API
 * 사이트: https://ddelza.github.io/cosmos/2026/
 *
 * 처음 한 번: 이 코드를 붙여넣고 저장 → 위쪽 함수 선택에서 setup 고르고 ▶실행 → 권한 승인
 *   → 실행 로그에 나오는 시트·폴더 주소 확인
 * 배포: 배포 → 배포 관리 → 연필(수정) → 버전: 새 버전 → 배포   (웹 앱 URL은 그대로 유지됨)
 *   - 실행 사용자: 나 / 액세스 권한: 모든 사용자
 *
 * 관리자 비밀번호: 처음 setup 전에 아래 INITIAL_ADMIN_PW에 적고 실행 → [프로젝트 설정 → 스크립트 속성]의 ADMIN_PW로 저장됨
 *   (공개 저장소에는 빈칸으로 둠. 바꾸려면 스크립트 속성 ADMIN_PW를 직접 수정)
 * 사전신청 마감/재개는 사이트 관리자 화면에서 하거나 스크립트 속성 REG_OPEN 을 N/Y 로 바꾸면 됨
 */

var VERSION = '2026-10-12';
var INITIAL_ADMIN_PW = ''; // ← setup 실행 전에만 적기 (저장소에는 올리지 않음)
var ROLES = ['학생', '교사', '학부모', '일반주민'];
var SLOTS = ['18:20~19:20', '19:30~20:30', '20:40~21:40'];
var HEADERS = ['제출시각', '신분', '이름/별칭', '학번', '자녀 이름', '관계', '시간대', '인원', '남길 말', '개인정보 동의'];
var SHEET_NAME = '신청';
var ROOT_FOLDER_NAME = '2026 주민관측회 사진';
var MAX_IMAGE_CHARS = 9 * 1024 * 1024; // base64 문자 수 상한(약 6.7MB 이미지)

// ===== 처음 한 번 실행 =====
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PW')) {
    if (!INITIAL_ADMIN_PW) throw new Error('INITIAL_ADMIN_PW에 관리자 비밀번호를 적고 다시 실행해 주세요.');
    props.setProperty('ADMIN_PW', INITIAL_ADMIN_PW);
  }
  if (!props.getProperty('REG_OPEN')) props.setProperty('REG_OPEN', 'Y');

  var ss = openSheetFile_();
  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create('2026 주민관측회 사전신청');
    props.setProperty('SHEET_ID', ss.getId());
  }
  getRegSheet_(ss);

  var folder = null;
  var fid = props.getProperty('FOLDER_ID');
  if (fid) { try { folder = DriveApp.getFolderById(fid); } catch (e) { folder = null; } }
  if (!folder) {
    folder = DriveApp.createFolder(ROOT_FOLDER_NAME);
    props.setProperty('FOLDER_ID', folder.getId());
  }
  try {
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log('⚠️ 폴더 링크 공유 설정 실패 — 이 계정은 외부 공유가 막혀 있을 수 있습니다: ' + e);
  }
  Logger.log('신청 시트: ' + ss.getUrl());
  Logger.log('사진 폴더: ' + folder.getUrl());
  Logger.log('준비 완료. 이제 [배포 관리 → 새 버전]으로 배포하세요.');
}

// ===== 웹 앱 진입점 =====
function doGet(e) { return handle_(e); }
function doPost(e) { return handle_(e); }

function handle_(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    out = route_(String(p.action || ''), p);
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function route_(action, p) {
  switch (action) {
    case 'ping': return { ok: true, version: VERSION };
    case 'counts': return counts_();
    case 'register': return register_(p);
    case 'checkPw': return { ok: isAdmin_(p.pw) };
    case 'uploadPhoto': return uploadPhoto_(p);
    case 'trashPhoto': return trashPhoto_(p);
    case 'setRegOpen': return setRegOpen_(p);
    case 'links': return links_(p);
    default: return { ok: false, error: '알 수 없는 요청입니다: ' + action };
  }
}

// ===== 공통 =====
function isAdmin_(pw) {
  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_PW');
  var ok = !!real && String(pw || '') === real;
  if (!ok) Utilities.sleep(400); // 무작위 대입 속도 늦추기
  return ok;
}

function requireAdmin_(p) {
  if (!isAdmin_(p.pw)) throw new Error('관리자 비밀번호가 맞지 않습니다.');
}

function openSheetFile_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) return null;
  try { return SpreadsheetApp.openById(id); } catch (e) { return null; }
}

function getRegSheet_(ss) {
  ss = ss || openSheetFile_();
  if (!ss) throw new Error('setup()을 먼저 실행해 주세요.');
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function rootFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!id) throw new Error('setup()을 먼저 실행해 주세요.');
  return DriveApp.getFolderById(id);
}

// 시트 수식 주입 방지 + 길이 제한
function clean_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (s.length > max) s = s.slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function regOpen_() {
  return PropertiesService.getScriptProperties().getProperty('REG_OPEN') !== 'N';
}

// ===== 사전신청 =====
function register_(p) {
  if (!regOpen_()) return { ok: false, error: '사전신청이 마감되었습니다. 당일 현장으로 오셔도 참여할 수 있어요.' };

  var role = String(p.role || '');
  if (ROLES.indexOf(role) < 0) throw new Error('신분을 선택해 주세요.');
  var slot = String(p.slot || '');
  if (SLOTS.indexOf(slot) < 0) throw new Error('시간대를 선택해 주세요.');
  if (String(p.consent) !== 'Y') throw new Error('개인정보 수집·이용에 동의해 주세요.');

  var name = clean_(p.name, 30);
  var studentNo = clean_(p.studentNo, 4);
  var childName = clean_(p.childName, 30);
  var relation = clean_(p.relation, 20);
  var message = clean_(p.message, 300);
  var party = parseInt(p.party, 10);
  if (!(party >= 1 && party <= 10)) party = 1;

  if (role === '학생') {
    if (!/^[1-3][1-9]\d{2}$/.test(studentNo)) throw new Error('학번 4자리를 확인해 주세요. (예: 2학년 1반 15번 → 2115)');
    if (!name) throw new Error('이름을 입력해 주세요.');
  } else if (role === '학부모') {
    if (!childName) throw new Error('자녀 이름을 입력해 주세요.');
    if (!relation) throw new Error('자녀와의 관계를 입력해 주세요.');
    studentNo = '';
  } else {
    if (!name) throw new Error(role === '일반주민' ? '이름 또는 별칭을 입력해 주세요.' : '이름을 입력해 주세요.');
    studentNo = ''; childName = ''; relation = '';
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = getRegSheet_();
    sh.appendRow([new Date(), role, name, studentNo, childName, relation, slot, party, message, '동의']);
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove('counts');
  return { ok: true, counts: counts_() };
}

// 이름 없이 합계만 공개
function counts_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('counts');
  if (hit) return JSON.parse(hit);

  var bySlot = {}, byRole = {};
  SLOTS.forEach(function (s) { bySlot[s] = { forms: 0, people: 0 }; });
  ROLES.forEach(function (r) { byRole[r] = { forms: 0, people: 0 }; });
  var total = { forms: 0, people: 0 };

  var sh = getRegSheet_();
  var n = sh.getLastRow() - 1;
  if (n > 0) {
    var rows = sh.getRange(2, 2, n, 7).getValues(); // 신분 ~ 인원
    rows.forEach(function (r) {
      var role = String(r[0]), slot = String(r[5]), people = parseInt(r[6], 10) || 1;
      if (!role) return;
      total.forms++; total.people += people;
      if (bySlot[slot]) { bySlot[slot].forms++; bySlot[slot].people += people; }
      if (byRole[role]) { byRole[role].forms++; byRole[role].people += people; }
    });
  }
  var out = { ok: true, regOpen: regOpen_(), slots: bySlot, roles: byRole, total: total };
  cache.put('counts', JSON.stringify(out), 60);
  return out;
}

function setRegOpen_(p) {
  requireAdmin_(p);
  PropertiesService.getScriptProperties().setProperty('REG_OPEN', String(p.open) === 'Y' ? 'Y' : 'N');
  CacheService.getScriptCache().remove('counts');
  return { ok: true, regOpen: regOpen_() };
}

// 관리자 화면용: 시트·폴더 주소 (주소만으로는 열 수 없음 — 소유자 계정으로 로그인해야 열림)
function links_(p) {
  requireAdmin_(p);
  var ss = openSheetFile_();
  return { ok: true, sheetUrl: ss ? ss.getUrl() : '', folderUrl: rootFolder_().getUrl() };
}

// ===== 사진 (구글 드라이브) =====
function uploadPhoto_(p) {
  requireAdmin_(p);
  var folderKey = String(p.folder || '');
  if (!/^[a-z0-9_-]{1,40}$/.test(folderKey)) throw new Error('사진 폴더 이름이 올바르지 않습니다.');
  var data = String(p.data || '');
  if (!data) throw new Error('이미지 데이터가 없습니다.');
  if (data.length > MAX_IMAGE_CHARS) throw new Error('사진이 너무 큽니다.');

  var m = data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error('이미지 형식이 올바르지 않습니다.');
  var bytes = Utilities.base64Decode(m[2]);
  var ext = m[1] === 'image/png' ? 'png' : (m[1] === 'image/webp' ? 'webp' : 'jpg');
  var by = clean_(p.by, 40);
  var fileName = folderKey + '_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmmss') + '.' + ext;

  var root = rootFolder_();
  var it = root.getFoldersByName(folderKey);
  var sub = it.hasNext() ? it.next() : root.createFolder(folderKey);

  var file = sub.createFile(Utilities.newBlob(bytes, m[1], fileName));
  if (by) file.setDescription('올린 사람: ' + by);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    throw new Error('사진은 저장됐지만 링크 공유를 켤 수 없습니다(계정의 외부 공유 제한). 담당 선생님께 알려주세요.');
  }
  return { ok: true, fileId: file.getId() };
}

// 이 앱이 만든 사진 폴더 안의 파일만 휴지통으로 (영구 삭제 아님)
function trashPhoto_(p) {
  requireAdmin_(p);
  var id = String(p.fileId || '');
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) throw new Error('파일 번호가 올바르지 않습니다.');
  var file = DriveApp.getFileById(id);
  var rootId = rootFolder_().getId();
  var parents = file.getParents();
  var inside = false;
  while (parents.hasNext()) {
    var f = parents.next();
    if (f.getId() === rootId) { inside = true; break; }
    var gp = f.getParents();
    while (gp.hasNext()) { if (gp.next().getId() === rootId) { inside = true; break; } }
    if (inside) break;
  }
  if (!inside) throw new Error('이 사이트에서 올린 사진만 지울 수 있습니다.');
  file.setTrashed(true);
  return { ok: true };
}
