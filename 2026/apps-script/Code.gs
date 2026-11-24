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
 * 사전신청 마감/재개, 첫 타임 학생 신청 열기는 사이트 관리자 메뉴에서 (스크립트 속성 REG_OPEN, STUDENT_FIRST_OPEN = Y/N)
 * 시간대 정원은 기본 72명 (스크립트 속성 CAPACITY 로 바꿀 수 있음)
 * 시트 열 순서를 바꾸지 마세요 (아래 COL 번호로 읽음). 행 삭제는 자유롭게 해도 됨.
 */

var VERSION = '2026-11-24';
var INITIAL_ADMIN_PW = ''; // ← setup 실행 전에만 적기 (저장소에는 올리지 않음)
var ROLES = ['학생', '교사', '학부모', '일반주민'];
var SLOTS = ['18:20~19:20', '19:30~20:30', '20:40~21:40'];
var HEADERS = ['제출시각', '신분', '이름/별칭', '학번', '자녀 이름', '관계', '시간대', '인원', '남길 말', '개인정보 동의', '휴대폰(선택)', '현황 공개', '신청 번호', '상태', '변경 희망 시간대', '변경 희망 인원', '변경 신청 시각'];
var COL = { at: 1, role: 2, name: 3, studentNo: 4, childName: 5, relation: 6, slot: 7, party: 8, message: 9, consent: 10, phone: 11, pub: 12, id: 13, status: 14, wantSlot: 15, wantParty: 16, wantAt: 17 };
var DEFAULT_CAPACITY = 72;
var FIRST_SLOT = SLOTS[0]; // 첫 타임: 주민 우선 — 학생은 관리자가 열어 줄 때까지 신청 불가
// 11/3 → 11/27(금) 연기(기상): 새 탭에 다시 신청받음, 예전 「신청」 탭(11/3)은 그대로 둠
// 11/27 → 11/26(목) 변경: 11/27 신청을 그대로 옮김 — 「신청(11.27)」 탭 이름을 「신청(11.26)」으로 바꿔 계속 씀
var EVENT_DATE = '2026-11-26';
var SHEET_NAME = '신청(11.26)';
var PREV_SHEET_NAME = '신청(11.27)';
var OLD_SHEET_NAME = '신청';
var LOG_SHEET_NAME = '변경기록';
var GB_SHEET_NAME = '방명록(11.26)'; // 디지털 방명록(문지기 입장 확인) — 도착·함께 온 사람 이름·삭제한 칸
var GB_HEADERS = ['신청 번호', '시간대', '예약자', '도착', '도착 시각', '칸 상태(JSON)', '마지막 수정', '수정한 사람'];
var LOG_HEADERS = ['시각', '한 일', '신청 번호', '예약자', '조회 방법', '조회 값', '변경 전', '변경 후', '결과', '기기 표시', '브라우저'];
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
    case 'ping': return { ok: true, version: VERSION, eventDate: EVENT_DATE, sheet: SHEET_NAME };
    case 'counts': return counts_();
    case 'register': return register_(p);
    case 'checkPw': return { ok: isAdmin_(p.pw) };
    case 'uploadPhoto': return uploadPhoto_(p);
    case 'trashPhoto': return trashPhoto_(p);
    case 'setRegOpen': return setRegOpen_(p);
    case 'links': return links_(p);
    case 'publicList': return publicList_();
    case 'setPublic': return setPublic_(p);
    case 'setStudentFirst': return setStudentFirst_(p);
    case 'deleteReg': return deleteReg_(p);
    case 'lookup': return lookup_(p);
    case 'change': return change_(p);
    case 'cancel': return cancel_(p);
    case 'cancelWait': return cancelWait_(p);
    case 'guestList': return guestList_(p);
    case 'guestSet': return guestSet_(p);
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
  if (!sh && PREV_SHEET_NAME) { sh = ss.getSheetByName(PREV_SHEET_NAME); if (sh) sh.setName(SHEET_NAME); } // 날짜만 바뀜: 예약 그대로 옮김
  if (!sh) sh = ss.insertSheet(SHEET_NAME, 0); // 새 탭을 맨 앞에
  var lastCol = sh.getLastColumn();
  var head = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (sh.getLastRow() === 0 || head.length < HEADERS.length || String(head[HEADERS.length - 1]) !== HEADERS[HEADERS.length - 1]) {
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
function studentFirstOpen_() {
  return PropertiesService.getScriptProperties().getProperty('STUDENT_FIRST_OPEN') === 'Y';
}
function capacity_() {
  var c = parseInt(PropertiesService.getScriptProperties().getProperty('CAPACITY'), 10);
  return c > 0 ? c : DEFAULT_CAPACITY;
}
var CACHE_COUNTS = 'counts:' + SHEET_NAME, CACHE_PUBLIC = 'publicList:' + SHEET_NAME;
function clearCaches_() { CacheService.getScriptCache().removeAll([CACHE_COUNTS, CACHE_PUBLIC]); }

// 신청 행 전체를 객체로 (2행부터)
function readRows_(sh) {
  var n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  var vals = sh.getRange(2, 1, n, HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    if (!v[COL.role - 1]) continue;
    out.push({
      row: i + 2, at: v[COL.at - 1], role: String(v[COL.role - 1]), name: String(v[COL.name - 1]),
      childName: String(v[COL.childName - 1]), relation: String(v[COL.relation - 1]), slot: String(v[COL.slot - 1]),
      party: parseInt(v[COL.party - 1], 10) || 1, message: String(v[COL.message - 1]),
      pub: String(v[COL.pub - 1]) === 'Y', id: String(v[COL.id - 1]),
      phone: String(v[COL.phone - 1]), canceled: String(v[COL.status - 1]) === '취소',
      wantSlot: String(v[COL.wantSlot - 1] || ''), wantParty: parseInt(v[COL.wantParty - 1], 10) || 1,
      wantAt: v[COL.wantAt - 1] instanceof Date ? v[COL.wantAt - 1].getTime() : (Number(v[COL.wantAt - 1]) || 0),
    });
  }
  return out;
}
function slotPeople_(rows, slot) {
  var n = 0;
  rows.forEach(function (r) { if (r.slot === slot && !r.canceled) n += r.party; });
  return n;
}
// 시트에 저장할 때 붙인 ' (수식 방지 표시)는 화면에 보일 때 떼기
function shown_(s) { return String(s || '').replace(/^'/, ''); }
// 휴대폰: 숫자만 10~11자리, 01로 시작 → 010-1234-5678 형식
function phone_(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  if (!/^01\d{8,9}$/.test(d)) throw new Error('휴대폰 번호를 확인해 주세요. (예: 010-1234-5678) 적지 않아도 신청할 수 있어요.');
  return d.length === 11 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
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
  var phone = phone_(p.phone);
  if (phone && String(p.phoneConsent) !== 'Y') throw new Error('휴대폰 번호를 적으셨다면 알림 문자 발송을 위한 수집·이용에 동의해 주세요. (번호를 지우면 동의 없이 신청할 수 있어요)');

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
  if (role === '학생' && slot === FIRST_SLOT && !studentFirstOpen_()) {
    throw new Error('첫 타임(' + FIRST_SLOT + ')은 주민 우선이라 학생 신청이 아직 열리지 않았어요. 다른 시간대를 골라 주세요.');
  }

  var id = Utilities.getUuid();
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = getRegSheet_();
    var cap = capacity_();
    var used = slotPeople_(readRows_(sh), slot);
    if (activeRows_(sh).some(function (x) { return x.wantSlot === slot; })) used = Math.max(used, capacity_()); // 변경 대기자가 먼저
    if (used + party > cap) {
      var left = Math.max(0, cap - used);
      throw new Error(left ? slot + ' 시간대는 ' + left + '명까지만 더 신청할 수 있어요. 인원을 줄이거나 다른 시간대를 골라 주세요.'
        : slot + ' 시간대는 정원(' + cap + '명)이 다 찼어요. 다른 시간대를 골라 주세요.');
    }
    sh.appendRow([new Date(), role, name, studentNo, childName, relation, slot, party, message, '동의', phone, 'N', id]);
  } finally {
    lock.releaseLock();
  }
  clearCaches_();
  return { ok: true, id: id, eventDate: EVENT_DATE, counts: counts_() };
}

// ===== 예약 확인·변경·취소 (본인 확인: 예약할 때 쓴 휴대폰 번호 또는 이름) =====
// 모든 조회·변경은 「변경기록」 탭에 남김. 취소는 행을 지우지 않고 상태를 「취소」로 바꿈(되살릴 수 있게)
function digits_(s) { return String(s || '').replace(/\D/g, ''); }
function normName_(s) { return shown_(s).replace(/\s+/g, ''); }
function rowLabel_(r) {
  return r.role === '학부모' ? shown_(r.childName) + ' ' + shown_(r.relation)
    : r.role === '교사' ? shown_(r.name) + ' 선생님' : shown_(r.name);
}
// 조회 키가 이 예약과 맞는지
function matches_(r, by, q) {
  if (by === 'phone') { var d = digits_(q); return d.length >= 10 && digits_(r.phone) === d; }
  if (by === 'name') { var n = normName_(q); return n.length >= 2 && (normName_(r.name) === n || normName_(r.childName) === n); }
  return false;
}
function checkKey_(p) {
  var by = String(p.by || ''), q = String(p.q || '');
  if (by === 'phone') { if (digits_(q).length < 10) throw new Error('휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)'); }
  else if (by === 'name') { if (normName_(q).length < 2) throw new Error('예약할 때 쓴 이름을 두 글자 이상 입력해 주세요.'); }
  else throw new Error('휴대폰 번호 또는 이름으로 조회해 주세요.');
  return { by: by, q: q };
}
function logSheet_(ss) {
  ss = ss || openSheetFile_();
  var sh = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(LOG_SHEET_NAME);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function log_(action, p, r, before, after, result) {
  try {
    logSheet_().appendRow([new Date(), action, r ? r.id : '', r ? rowLabel_(r) + ' (' + r.role + ')' : '',
      p.by === 'phone' ? '휴대폰' : p.by === 'name' ? '이름' : String(p.by || ''), clean_(p.q, 40),
      before || '', after || '', result || '', clean_(p.dev, 40), clean_(p.ua, 200)]);
  } catch (e) { /* 기록 실패가 변경을 막지는 않음 */ }
}
function desc_(slot, party) { return slot + ' ' + party + '명'; }
function activeRows_(sh) { return readRows_(sh).filter(function (r) { return !r.canceled; }); }
// 한 시간대에서 대기 순번(1부터)
function queuePos_(rows, r) {
  if (!r.wantSlot) return 0;
  var q = rows.filter(function (x) { return x.wantSlot === r.wantSlot; }).sort(function (a, b) { return a.wantAt - b.wantAt; });
  for (var i = 0; i < q.length; i++) if (q[i].id === r.id) return i + 1;
  return 0;
}
function itemOf_(rows, r) {
  return { id: r.id, role: r.role, label: rowLabel_(r), slot: r.slot, party: r.party, at: r.at instanceof Date ? r.at.getTime() : 0,
    want: r.wantSlot ? { slot: r.wantSlot, party: r.wantParty, pos: queuePos_(rows, r), at: r.wantAt } : null };
}
function setWant_(sh, r, slot, party, at) {
  sh.getRange(r.row, COL.wantSlot, 1, 3).setValues([[slot || '', slot ? party : '', slot ? new Date(at) : '']]);
}
function findOwned_(sh, p) {
  var key = checkKey_(p);
  var id = String(p.id || '');
  var rows = readRows_(sh);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) {
      if (!matches_(rows[i], key.by, key.q)) throw new Error('조회한 휴대폰 번호·이름과 예약이 맞지 않아요.');
      if (rows[i].canceled) throw new Error('이미 취소된 예약이에요.');
      return rows[i];
    }
  }
  throw new Error('예약을 찾을 수 없어요. 다시 조회해 주세요.');
}

// 빈자리가 생긴 시간대에 대기자를 먼저 신청한 순서대로 옮김(앞사람이 안 들어가면 뒷사람도 기다림)
function processQueues_(sh, p) {
  var cap = capacity_(), moved = [];
  for (var guard = 0; guard < 300; guard++) {
    var rows = activeRows_(sh), did = false;
    for (var k = 0; k < SLOTS.length && !did; k++) {
      var s = SLOTS[k];
      var q = rows.filter(function (x) { return x.wantSlot === s; }).sort(function (a, b) { return a.wantAt - b.wantAt; });
      if (!q.length) continue;
      var first = q[0], left = cap - slotPeople_(rows, s);
      if (first.wantParty <= left) {
        var before = desc_(first.slot, first.party);
        sh.getRange(first.row, COL.slot).setValue(s);
        sh.getRange(first.row, COL.party).setValue(first.wantParty);
        setWant_(sh, first, '');
        log_('대기 자동 이동', { by: '자동', q: '' }, first, before, desc_(s, first.wantParty), '빈자리가 생겨 이동');
        moved.push(first.id);
        did = true;
      }
    }
    if (!did) break;
  }
  return moved;
}

function lookup_(p) {
  var key = checkKey_(p);
  var sh = getRegSheet_();
  var rows = activeRows_(sh);
  var hit = rows.filter(function (r) { return matches_(r, key.by, key.q); });
  log_('조회', p, null, '', '', hit.length + '건');
  return { ok: true, items: hit.map(function (r) { return itemOf_(rows, r); }), counts: counts_() };
}

// 시간대 변경(빈자리 없으면 변경 대기) 또는 같은 시간대에서 인원 줄이기
function change_(p) {
  var slot = String(p.slot || '');
  if (SLOTS.indexOf(slot) < 0) throw new Error('시간대를 선택해 주세요.');
  var party = parseInt(p.party, 10);
  if (!(party >= 1 && party <= 10)) throw new Error('인원을 확인해 주세요.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = getRegSheet_();
    var r = findOwned_(sh, p);
    var before = desc_(r.slot, r.party) + (r.wantSlot ? ' (대기: ' + desc_(r.wantSlot, r.wantParty) + ')' : '');
    var result, pos = 0;
    if (slot === r.slot) {
      if (party >= r.party) throw new Error('시간대를 그대로 두면 인원은 줄이기만 할 수 있어요. (지금 ' + r.party + '명)');
      sh.getRange(r.row, COL.party).setValue(party);
      result = 'reduced';
    } else {
      if (r.role === '학생' && slot === FIRST_SLOT && !studentFirstOpen_()) throw new Error('첫 타임(' + FIRST_SLOT + ')은 주민 우선이라 학생은 옮길 수 없어요.');
      var rows = activeRows_(sh);
      var left = capacity_() - slotPeople_(rows, slot);
      var waiting = rows.some(function (x) { return x.wantSlot === slot && x.id !== r.id; });
      if (party <= left && !waiting) {
        sh.getRange(r.row, COL.slot).setValue(slot);
        sh.getRange(r.row, COL.party).setValue(party);
        setWant_(sh, r, '');
        result = 'moved';
      } else {
        // 꽉 찼거나 앞에 기다리는 사람이 있으면 변경 대기(지금 시간대 예약은 그대로 유지)
        var keepAt = r.wantSlot === slot && r.wantParty === party ? r.wantAt : Date.now();
        setWant_(sh, r, slot, party, keepAt);
        result = 'waiting';
      }
    }
    SpreadsheetApp.flush && SpreadsheetApp.flush();
    var moved = processQueues_(sh, p);
    var after = activeRows_(sh), me = after.filter(function (x) { return x.id === r.id; })[0];
    if (result === 'waiting' && me && !me.wantSlot) result = 'moved'; // 대기 걸자마자 자리가 나서 바로 들어간 경우
    if (me && me.wantSlot) pos = queuePos_(after, me);
    log_(result === 'reduced' ? '인원 줄이기' : result === 'moved' ? '시간 변경' : '변경 대기 신청', p, r, before,
      me ? desc_(me.slot, me.party) + (me.wantSlot ? ' (대기: ' + desc_(me.wantSlot, me.wantParty) + ', ' + pos + '번째)' : '') : '', moved.length ? '대기 ' + moved.length + '건 자동 이동' : '');
    clearCaches_();
    return { ok: true, result: result, pos: pos, item: me ? itemOf_(after, me) : null, counts: counts_() };
  } finally {
    lock.releaseLock();
  }
}

function cancel_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = getRegSheet_();
    var r = findOwned_(sh, p);
    sh.getRange(r.row, COL.status).setValue('취소');
    setWant_(sh, r, '');
    var moved = processQueues_(sh, p);
    log_('예약 취소', p, r, desc_(r.slot, r.party), '취소', moved.length ? '대기 ' + moved.length + '건 자동 이동' : '');
    clearCaches_();
    return { ok: true, counts: counts_() };
  } finally {
    lock.releaseLock();
  }
}

function cancelWait_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = getRegSheet_();
    var r = findOwned_(sh, p);
    if (!r.wantSlot) throw new Error('기다리는 변경이 없어요.');
    setWant_(sh, r, '');
    var moved = processQueues_(sh, p);
    log_('변경 대기 취소', p, r, desc_(r.slot, r.party) + ' (대기: ' + desc_(r.wantSlot, r.wantParty) + ')', desc_(r.slot, r.party), moved.length ? '대기 ' + moved.length + '건 자동 이동' : '');
    clearCaches_();
    var after = activeRows_(sh);
    return { ok: true, item: itemOf_(after, after.filter(function (x) { return x.id === r.id; })[0]), counts: counts_() };
  } finally {
    lock.releaseLock();
  }
}

// 신청한 사람이 "공개할까요?"에 답함 — 신청 번호(id)를 아는 사람만 바꿀 수 있음
function setPublic_(p) {
  var id = String(p.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('신청 번호가 올바르지 않습니다.');
  var on = String(p.public) === 'Y';
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = getRegSheet_();
    var rows = readRows_(sh);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) {
        sh.getRange(rows[i].row, COL.pub).setValue(on ? 'Y' : 'N');
        clearCaches_();
        return { ok: true, public: on };
      }
    }
  } finally {
    lock.releaseLock();
  }
  throw new Error('신청 기록을 찾을 수 없어요. (선생님이 지웠을 수 있어요)');
}

// 공개에 동의한 신청만: 이름·신분·인원·남긴 말 (학번·휴대폰·신청 번호는 절대 내보내지 않음)
function publicList_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_PUBLIC);
  if (hit) return JSON.parse(hit);
  var bySlot = {};
  SLOTS.forEach(function (s) { bySlot[s] = []; });
  activeRows_(getRegSheet_()).forEach(function (r) {
    if (!r.pub || !bySlot[r.slot]) return;
    var label = r.role === '학부모' ? shown_(r.childName) + ' ' + shown_(r.relation)
      : r.role === '교사' ? shown_(r.name) + ' 선생님' : shown_(r.name);
    bySlot[r.slot].push({ name: label, role: r.role, party: r.party, message: shown_(r.message), at: r.at instanceof Date ? r.at.getTime() : 0 });
  });
  var out = { ok: true, slots: bySlot };
  cache.put(CACHE_PUBLIC, JSON.stringify(out), 60);
  return out;
}

function setStudentFirst_(p) {
  requireAdmin_(p);
  PropertiesService.getScriptProperties().setProperty('STUDENT_FIRST_OPEN', String(p.open) === 'Y' ? 'Y' : 'N');
  clearCaches_();
  return { ok: true, studentFirstOpen: studentFirstOpen_() };
}

// 신청 1건 삭제 (관리자, 신청 번호로) — 보통은 시트에서 직접 행을 지우면 됨
function deleteReg_(p) {
  requireAdmin_(p);
  var id = String(p.id || '');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = getRegSheet_();
    var rows = readRows_(sh);
    for (var i = 0; i < rows.length; i++) {
      if (id && rows[i].id === id) { sh.deleteRow(rows[i].row); clearCaches_(); return { ok: true }; }
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: false, error: '신청 기록을 찾을 수 없어요.' };
}

// 이름 없이 합계만 공개
function counts_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_COUNTS);
  if (hit) return JSON.parse(hit);

  var bySlot = {}, byRole = {};
  SLOTS.forEach(function (s) { bySlot[s] = { forms: 0, people: 0, waiting: 0 }; });
  ROLES.forEach(function (r) { byRole[r] = { forms: 0, people: 0 }; });
  var total = { forms: 0, people: 0 };

  var cap = capacity_(), pubCount = 0;
  activeRows_(getRegSheet_()).forEach(function (r) {
    if (r.wantSlot && bySlot[r.wantSlot]) bySlot[r.wantSlot].waiting++;
    total.forms++; total.people += r.party;
    if (r.pub) pubCount++;
    if (bySlot[r.slot]) { bySlot[r.slot].forms++; bySlot[r.slot].people += r.party; }
    if (byRole[r.role]) { byRole[r.role].forms++; byRole[r.role].people += r.party; }
  });
  SLOTS.forEach(function (s) { bySlot[s].remaining = Math.max(0, cap - bySlot[s].people); });
  var out = { ok: true, version: VERSION, eventDate: EVENT_DATE, regOpen: regOpen_(), capacity: cap, firstSlot: FIRST_SLOT,
    studentFirstOpen: studentFirstOpen_(), slots: bySlot, roles: byRole, total: total, publicForms: pubCount };
  cache.put(CACHE_COUNTS, JSON.stringify(out), 60);
  return out;
}

function setRegOpen_(p) {
  requireAdmin_(p);
  PropertiesService.getScriptProperties().setProperty('REG_OPEN', String(p.open) === 'Y' ? 'Y' : 'N');
  clearCaches_();
  return { ok: true, regOpen: regOpen_() };
}

// 관리자 화면용: 시트·폴더 주소 (주소만으로는 열 수 없음 — 소유자 계정으로 로그인해야 열림)
function links_(p) {
  requireAdmin_(p);
  var ss = openSheetFile_();
  return { ok: true, sheetUrl: ss ? ss.getUrl() : '', folderUrl: rootFolder_().getUrl() };
}

// ===== 디지털 방명록 (문지기 입장 확인, 관리자 로그인 필요) =====
// 신청 1건 = 칸 [예약자, 함께 온 사람 1, 2, …] (인원 수만큼). 칸 상태는 「방명록」 탭에 신청 번호별로 한 줄
//   c: 함께 온 사람 이름(칸 1번부터), x: 삭제한 칸 번호(0 = 예약자 칸), 도착은 신청 단위
function gbSheet_() {
  var ss = openSheetFile_();
  if (!ss) throw new Error('setup()을 먼저 실행해 주세요.');
  var sh = ss.getSheetByName(GB_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(GB_SHEET_NAME);
    sh.getRange(1, 1, 1, GB_HEADERS.length).setValues([GB_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function gbRead_(sh) {
  var n = sh.getLastRow() - 1, out = {};
  if (n <= 0) return out;
  sh.getRange(2, 1, n, GB_HEADERS.length).getValues().forEach(function (v, i) {
    var id = String(v[0] || '');
    if (!id) return;
    var j = {};
    try { j = JSON.parse(String(v[5] || '{}')) || {}; } catch (e) { j = {}; }
    out[id] = {
      row: i + 2, a: String(v[3]) === 'Y', at: v[4] instanceof Date ? v[4].getTime() : 0,
      c: Array.isArray(j.c) ? j.c.map(String) : [], x: Array.isArray(j.x) ? j.x.map(Number) : [],
      up: v[6] instanceof Date ? v[6].getTime() : 0, by: String(v[7] || ''),
    };
  });
  return out;
}
function gbKey_(r) { return r.id || ('row' + r.row); }
function gbOut_(s) { return { a: s.a, at: s.at, c: s.c, x: s.x, up: s.up, by: s.by }; }
function gbName_(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 20); }

function guestList_(p) {
  requireAdmin_(p);
  var items = activeRows_(getRegSheet_()).filter(function (r) { return SLOTS.indexOf(r.slot) >= 0; }).map(function (r) {
    return { id: gbKey_(r), slot: r.slot, label: rowLabel_(r), role: r.role, party: r.party };
  });
  var st = gbRead_(gbSheet_()), state = {};
  Object.keys(st).forEach(function (k) { state[k] = gbOut_(st[k]); });
  return { ok: true, now: Date.now(), slots: SLOTS, items: items, state: state };
}

// op: arrive(v=Y/N) · name(i=1…, v=이름) · del(i=0…, v=Y 삭제/N 되살리기)
function guestSet_(p) {
  requireAdmin_(p);
  var id = String(p.id || ''), op = String(p.op || ''), i = parseInt(p.i, 10);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var r = activeRows_(getRegSheet_()).filter(function (x) { return gbKey_(x) === id; })[0];
    if (!r) throw new Error('신청을 찾을 수 없어요. (취소됐을 수 있어요)');
    var sh = gbSheet_(), s = gbRead_(sh)[id] || { row: 0, a: false, at: 0, c: [], x: [] };
    var n = r.party;
    while (s.c.length < n - 1) s.c.push('');
    s.c = s.c.slice(0, Math.max(0, n - 1));
    s.x = s.x.filter(function (k) { return k >= 0 && k < n; });
    if (op === 'arrive') {
      var on = String(p.v) === 'Y';
      if (on) for (var k = 1; k < n; k++) {
        if (s.x.indexOf(k) < 0 && !gbName_(s.c[k - 1])) throw new Error('함께 온 사람 이름을 모두 적어야 도착 처리할 수 있어요.');
      }
      s.a = on; s.at = on ? Date.now() : 0;
    } else if (op === 'name') {
      if (!(i >= 1 && i < n)) throw new Error('칸 번호가 올바르지 않습니다.');
      s.c[i - 1] = gbName_(p.v);
    } else if (op === 'del') {
      if (!(i >= 0 && i < n)) throw new Error('칸 번호가 올바르지 않습니다.');
      var pos = s.x.indexOf(i);
      if (String(p.v) === 'Y') { if (pos < 0) s.x.push(i); } else if (pos >= 0) s.x.splice(pos, 1);
      s.x.sort(function (a, b) { return a - b; });
    } else {
      throw new Error('알 수 없는 방명록 요청입니다.');
    }
    s.by = clean_(p.who, 40); s.up = Date.now();
    var row = [id, r.slot, rowLabel_(r), s.a ? 'Y' : '', s.at ? new Date(s.at) : '', JSON.stringify({ c: s.c, x: s.x }), new Date(s.up), s.by];
    if (s.row) sh.getRange(s.row, 1, 1, GB_HEADERS.length).setValues([row]); else sh.appendRow(row);
    return { ok: true, id: id, state: gbOut_(s) };
  } finally {
    lock.releaseLock();
  }
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
