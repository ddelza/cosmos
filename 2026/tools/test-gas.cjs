// Code.gs 서버 로직 시험 (가짜 시트·캐시·드라이브):  node tools/test-gas.cjs
const { loadGas } = require('./gas-mock.cjs');
let fail = 0;
const check = (label, cond, extra) => { if (!cond) fail++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`); };

const g = loadGas();
const S1 = '18:20~19:20', S2 = '19:30~20:30', S3 = '20:40~21:40';
const base = { action: 'register', consent: 'Y' };

// 1) 기본 집계
let c = g.call({ action: 'counts' });
check('counts 기본', c.ok && c.capacity === 72 && c.studentFirstOpen === false && c.firstSlot === S1 && c.version === '2026-11-24' && c.eventDate === '2026-11-26', c);

// 2) 첫 타임 학생 차단 / 다른 시간대 학생 허용 / 첫 타임 주민 허용
let r = g.call({ ...base, role: '학생', slot: S1, studentNo: '2115', name: '김학생' });
check('첫 타임 학생 거절', !r.ok && /첫 타임/.test(r.error), r.error);
r = g.call({ ...base, role: '학생', slot: S2, studentNo: '2115', name: '김학생' });
check('2타임 학생 허용', r.ok && /^[0-9a-f-]{36}$/.test(r.id));
const studentId = r.id;
r = g.call({ ...base, role: '학부모', slot: S1, childName: '김학생', relation: '어머니', party: 3 });
check('첫 타임 학부모 허용', r.ok);
const parentId = r.id;

// 3) 휴대폰: 형식·동의
r = g.call({ ...base, role: '일반주민', slot: S1, name: '쏘자토스트 사장님', phone: '010-12' });
check('휴대폰 형식 오류', !r.ok && /휴대폰/.test(r.error), r.error);
r = g.call({ ...base, role: '일반주민', slot: S1, name: '쏘자토스트 사장님', phone: '01012345678' });
check('휴대폰 동의 없으면 거절', !r.ok && /동의/.test(r.error), r.error);
r = g.call({ ...base, role: '일반주민', slot: S1, name: '쏘자토스트 사장님', phone: '01012345678', phoneConsent: 'Y', party: 2, message: '토성 고리 보고 싶어요' });
check('휴대폰+동의 허용', r.ok);
const residentId = r.id;
const row = g.sheet.rows.find((x) => x[12] === residentId);
check('휴대폰 저장 형식 010-1234-5678', row && row[10] === '010-1234-5678', row && row[10]);
check('공개 기본값 N', row && row[11] === 'N');
r = g.call({ ...base, role: '교사', slot: S3, name: '박선생' });
check('휴대폰 없이 허용', r.ok && g.sheet.rows.at(-1)[10] === '');
const teacherId = r.id;

// 4) 공개 동의 → 공개 목록 (학번·휴대폰·id 미노출)
let pl = g.call({ action: 'publicList' });
check('처음엔 공개 목록 비어 있음', pl.ok && pl.slots[S1].length === 0 && pl.slots[S2].length === 0);
check('setPublic 잘못된 id 거절', !g.call({ action: 'setPublic', id: 'abc', public: 'Y' }).ok);
for (const id of [residentId, parentId, studentId, teacherId]) check('setPublic Y', g.call({ action: 'setPublic', id, public: 'Y' }).ok);
pl = g.call({ action: 'publicList' });
const all = JSON.stringify(pl);
check('공개 목록 S1 2명', pl.slots[S1].length === 2, pl.slots[S1].map((x) => x.name));
check('학부모 표시 "김학생 어머니"', pl.slots[S1].some((x) => x.name === '김학생 어머니' && x.party === 3));
check('교사 표시 "박선생 선생님"', pl.slots[S3].some((x) => x.name === '박선생 선생님'));
check('남긴 말 포함', pl.slots[S1].some((x) => x.message === '토성 고리 보고 싶어요'));
check('휴대폰 미노출', !/010-1234-5678|01012345678/.test(all));
check('학번 미노출', !/2115/.test(all));
check('신청 번호 미노출', ![residentId, parentId, studentId, teacherId].some((id) => all.includes(id)));
check('setPublic N → 목록에서 빠짐', g.call({ action: 'setPublic', id: teacherId, public: 'N' }).ok && g.call({ action: 'publicList' }).slots[S3].length === 0);

// 5) 수식 주입 방지 + 공개 시 표시
r = g.call({ ...base, role: '일반주민', slot: S2, name: '=HYPERLINK("x")', message: '+1' });
check('수식 주입 차단 저장', r.ok && String(g.sheet.rows.at(-1)[2]).startsWith("'="));
g.call({ action: 'setPublic', id: r.id, public: 'Y' });
check('공개 목록에서는 따옴표 제거', g.call({ action: 'publicList' }).slots[S2].some((x) => x.name === '=HYPERLINK("x")' && x.message === '+1'));

// 6) 정원 72명 (인원 합계 기준, 경계값)
c = g.call({ action: 'counts' });
const usedS3 = c.slots[S3].people; // 교사 1명
check('S3 남은 자리', c.slots[S3].remaining === 72 - usedS3, c.slots[S3]);
let added = usedS3;
while (added + 10 <= 72) { const x = g.call({ ...base, role: '일반주민', slot: S3, name: '가족' + added, party: 10 }); if (!x.ok) break; added += 10; }
r = g.call({ ...base, role: '일반주민', slot: S3, name: '넘침', party: 72 - added + 1 });
check('남은 자리보다 많으면 거절(안내에 남은 수)', !r.ok && r.error.includes(String(72 - added)), r.error);
r = g.call({ ...base, role: '일반주민', slot: S3, name: '딱맞게', party: 72 - added });
check('정확히 72명까지 허용', r.ok);
r = g.call({ ...base, role: '일반주민', slot: S3, name: '마감후', party: 1 });
check('정원 다 차면 거절', !r.ok && /정원/.test(r.error), r.error);
c = g.call({ action: 'counts' });
check('S3 72/72, remaining 0', c.slots[S3].people === 72 && c.slots[S3].remaining === 0);

// 7) 관리자: 첫 타임 학생 열기, 마감, 정원 변경, 삭제
check('학생 첫 타임 열기 — 비번 틀림', !g.call({ action: 'setStudentFirst', pw: 'x', open: 'Y' }).ok);
check('학생 첫 타임 열기', g.call({ action: 'setStudentFirst', pw: 'test-pw', open: 'Y' }).studentFirstOpen === true);
check('열린 뒤 첫 타임 학생 허용', g.call({ ...base, role: '학생', slot: S1, studentNo: '3101', name: '이학생' }).ok);
check('counts 반영(캐시 비움)', g.call({ action: 'counts' }).studentFirstOpen === true);
g.call({ action: 'setStudentFirst', pw: 'test-pw', open: 'N' });
g.props.CAPACITY = '5';
g.cache.clear();
check('정원 속성 변경 반영', g.call({ action: 'counts' }).capacity === 5);
delete g.props.CAPACITY; g.cache.clear();
const before = g.sheet.rows.length;
check('deleteReg 비번 필요', !g.call({ action: 'deleteReg', pw: 'x', id: studentId }).ok);
check('deleteReg', g.call({ action: 'deleteReg', pw: 'test-pw', id: studentId }).ok && g.sheet.rows.length === before - 1);
check('삭제 후 공개 목록에서도 빠짐', !g.call({ action: 'publicList' }).slots[S2].some((x) => x.name === '김학생'));
check('마감', g.call({ action: 'setRegOpen', pw: 'test-pw', open: 'N' }).regOpen === false);
check('마감 후 신청 거절', !g.call({ ...base, role: '교사', slot: S2, name: '최선생' }).ok);
g.call({ action: 'setRegOpen', pw: 'test-pw', open: 'Y' });

// 8) 예전 형식(10열) 「신청(11.27)」 탭 → 「신청(11.26)」으로 이름만 바꿔 그대로 사용, 머리글 자동 확장
const g2 = loadGas({ tabs: { '신청(11.27)': [
  ['제출시각', '신분', '이름/별칭', '학번', '자녀 이름', '관계', '시간대', '인원', '남길 말', '개인정보 동의'],
  [new Date(), '일반주민', "'=__시험용", '', '', '', S2, 2, '시험', '동의'],
] } });
c = g2.call({ action: 'counts' });
check('11.27 탭이 11.26으로 이름 바뀜', g2.tabs.has('신청(11.26)') && !g2.tabs.has('신청(11.27)'));
check('예전 행도 집계', c.slots[S2].people === 2, c.slots[S2]);
check('머리글 17열로 확장', g2.sheet.rows[0].length === 17 && g2.sheet.rows[0][12] === '신청 번호' && g2.sheet.rows[0][13] === '상태');
r = g2.call({ ...base, role: '교사', slot: S2, name: '정선생', phone: '010 9876 5432', phoneConsent: 'Y' });
check('예전 시트에 새 형식 추가', r.ok && g2.sheet.rows.at(-1).length === 13 && g2.sheet.rows.at(-1)[10] === '010-9876-5432');
check('예전 행은 공개 안 됨', g2.call({ action: 'publicList' }).slots[S2].length === 0);

// 9) 사진 업로드·삭제 보호
const img = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');
check('업로드 비번 필요', !g.call({ action: 'uploadPhoto', pw: 'x', folder: 'm31', data: img }).ok);
const up = g.call({ action: 'uploadPhoto', pw: 'test-pw', folder: 'm31', data: img, by: '2108 백서후' });
check('업로드', up.ok && up.fileId);
check('잘못된 폴더명 거절', !g.call({ action: 'uploadPhoto', pw: 'test-pw', folder: '../x', data: img }).ok);
check('휴지통', g.call({ action: 'trashPhoto', pw: 'test-pw', fileId: up.fileId }).ok && g.files.get(up.fileId).trashed);
check('ping', g.call({ action: 'ping' }).version === '2026-11-24');

// 10) 예약 확인·변경·취소·변경 대기
{
  const h = loadGas({ props: { CAPACITY: '5', STUDENT_FIRST_OPEN: 'N' } });
  const reg = (o) => h.call({ ...base, ...o });
  const A = reg({ role: '일반주민', slot: S1, name: '홍 길동', phone: '010-1111-2222', phoneConsent: 'Y', party: 3 }).id;
  const B = reg({ role: '일반주민', slot: S2, name: '이몽룡', party: 2 }).id;
  const C = reg({ role: '학부모', slot: S2, childName: '성춘향', relation: '어머니', party: 3 }).id;
  const D = reg({ role: '일반주민', slot: S3, name: '변학도', party: 5 }).id; // S3 꽉 참(5)
  const look = (by, q) => h.call({ action: 'lookup', by, q, dev: 'dev1', ua: 'test' });
  let L = look('phone', '01011112222');
  check('휴대폰으로 조회', L.ok && L.items.length === 1 && L.items[0].id === A && L.items[0].party === 3);
  check('이름으로 조회(띄어쓰기 무시)', look('name', '홍길동').items.length === 1);
  check('학부모는 자녀 이름으로 조회', look('name', '성춘향').items[0].id === C);
  check('조회 결과에 휴대폰 없음', !JSON.stringify(L).includes('1111-2222'));
  check('짧은 이름 거절', !look('name', '홍').ok);
  check('남의 예약은 못 바꿈(키 불일치)', !h.call({ action: 'change', id: B, by: 'name', q: '홍길동', slot: S2, party: 1 }).ok);
  check('같은 시간대 인원 늘리기 거절', !h.call({ action: 'change', id: A, by: 'name', q: '홍길동', slot: S1, party: 4 }).ok);
  r = h.call({ action: 'change', id: A, by: 'phone', q: '010-1111-2222', slot: S1, party: 2 });
  check('인원 줄이기', r.ok && r.result === 'reduced' && r.counts.slots[S1].people === 2, r);
  // S3 꽉 참 → A(2명)가 S3로 변경 대기, B(2명)도 대기
  r = h.call({ action: 'change', id: A, by: 'name', q: '홍길동', slot: S3, party: 2 });
  check('꽉 찬 시간대는 변경 대기', r.ok && r.result === 'waiting' && r.pos === 1, r);
  r = h.call({ action: 'change', id: B, by: 'name', q: '이몽룡', slot: S3, party: 2 });
  check('두 번째 대기자', r.ok && r.result === 'waiting' && r.pos === 2);
  check('대기 중에도 원래 예약 유지', look('name', '홍길동').items[0].slot === S1);
  check('대기 있는 시간대는 새 신청도 막힘', !reg({ role: '일반주민', slot: S3, name: '방자', party: 1 }).ok);
  check('집계에 대기 수', h.call({ action: 'counts' }).slots[S3].waiting === 2);
  // D(5명)가 취소 → A, B 순서대로 S3로 이동
  r = h.call({ action: 'cancel', id: D, by: 'name', q: '변학도' });
  check('취소', r.ok && r.counts.slots[S3].people === 4, r.counts && r.counts.slots[S3]);
  L = look('name', '홍길동');
  check('먼저 건 대기자 자동 이동', L.items[0].slot === S3 && !L.items[0].want);
  check('다음 대기자도 이동', look('name', '이몽룡').items[0].slot === S3);
  check('취소한 예약은 조회 안 됨', look('name', '변학도').items.length === 0);
  check('취소 행은 지우지 않고 상태만', h.sheet.rows.some((x) => x[12] === D && x[13] === '취소'));
  check('취소한 예약 다시 못 바꿈', !h.call({ action: 'cancel', id: D, by: 'name', q: '변학도' }).ok);
  // 학생은 첫 타임으로 못 옮김
  const E = reg({ role: '학생', slot: S2, studentNo: '2101', name: '김별빛' }).id;
  check('학생 첫 타임 이동 거절', !h.call({ action: 'change', id: E, by: 'name', q: '김별빛', slot: S1, party: 1 }).ok);
  // 빈자리 있으면 바로 이동
  r = h.call({ action: 'change', id: C, by: 'name', q: '성춘향', slot: S1, party: 3 });
  check('빈자리 있으면 바로 이동', r.ok && r.result === 'moved' && r.item.slot === S1, r);
  // 대기 취소
  h.call({ action: 'change', id: E, by: 'name', q: '김별빛', slot: S3, party: 2 });
  r = h.call({ action: 'cancelWait', id: E, by: 'name', q: '김별빛' });
  check('변경 대기 취소', r.ok && !r.item.want && r.item.slot === S2);
  const log = h.tabs.get('변경기록');
  check('변경기록 탭에 남음', log && log.rows.length > 10 && log.rows.some((x) => x[1] === '대기 자동 이동') && log.rows.some((x) => x[9] === 'dev1'));
}

// 디지털 방명록
{
  const h = loadGas();
  const reg = (o) => h.call({ ...base, slot: S1, ...o });
  const p3 = reg({ role: '일반주민', name: '박주민', party: 3, phone: '01012345678', phoneConsent: 'Y' }).id;
  const p1 = reg({ role: '학부모', childName: '이학생', relation: '아버지', party: 1 }).id;
  const pw = { pw: 'test-pw', who: '3221 이하리' };
  check('guestList 비번 필요', !h.call({ action: 'guestList', pw: 'x' }).ok);
  let L = h.call({ action: 'guestList', ...pw });
  check('guestList 명단', L.ok && L.items.length === 2 && L.items.some((x) => x.id === p3 && x.party === 3 && x.label === '박주민' && x.phone === '010-1234-5678') && L.items.some((x) => x.label === '이학생 아버지'), L.items);
  let s = h.call({ action: 'guestSet', ...pw, id: p3, op: 'arrive', v: 'Y' });
  check('이름 다 안 적으면 도착 거절', !s.ok && /이름/.test(s.error), s.error);
  h.call({ action: 'guestSet', ...pw, id: p3, op: 'name', i: 1, v: '박동생' });
  s = h.call({ action: 'guestSet', ...pw, id: p3, op: 'del', i: 2, v: 'Y' });
  check('칸 삭제', s.ok && s.state.x.join() === '2' && s.state.c.join('|') === '박동생|', s.state);
  s = h.call({ action: 'guestSet', ...pw, id: p3, op: 'arrive', v: 'Y' });
  check('삭제한 칸 빼고 이름 다 있으면 도착', s.ok && s.state.a === true && s.state.at > 0, s);
  check('1인 신청 바로 도착', h.call({ action: 'guestSet', ...pw, id: p1, op: 'arrive', v: 'Y' }).ok);
  L = h.call({ action: 'guestList', ...pw });
  check('상태 다시 읽기', L.state[p3].a && L.state[p3].x.join() === '2' && L.state[p3].by === '3221 이하리' && L.state[p1].a, L.state);
  check('방명록 탭 한 신청 한 줄', h.tabs.get('방명록(11.26)').rows.length === 3);
  s = h.call({ action: 'guestSet', ...pw, id: p3, op: 'del', i: 2, v: 'N' });
  check('칸 되살리기', s.ok && s.state.x.length === 0);
  check('이름 추가 — 빈 이름 거절', !h.call({ action: 'guestSet', ...pw, id: p3, op: 'add', v: ' ' }).ok);
  s = h.call({ action: 'guestSet', ...pw, id: p3, op: 'add', v: '박막내' });
  check('이름 추가', s.ok && s.state.e === 1 && s.state.c.join('|') === '박동생||박막내', s.state);
  s = h.call({ action: 'guestSet', ...pw, id: p3, op: 'del', i: 3, v: 'Y' });
  check('추가한 칸도 삭제', s.ok && s.state.x.join() === '3', s.state);
  L = h.call({ action: 'guestList', ...pw });
  check('추가 되돌리기 — 마지막 칸만', !h.call({ action: 'guestSet', ...pw, id: p3, op: 'unadd', i: 2 }).ok);
  s = h.call({ action: 'guestSet', ...pw, id: p3, op: 'add', v: '임시' });
  s = h.call({ action: 'guestSet', ...pw, id: p3, op: 'unadd', i: 4 });
  check('추가 되돌리기', s.ok && s.state.e === 1 && s.state.c.length === 3, s.state);
  check('추가 칸 유지', L.state[p3].e === 1 && L.state[p3].c.length === 3, L.state[p3]);
  check('없는 신청', !h.call({ action: 'guestSet', ...pw, id: 'nope', op: 'arrive', v: 'Y' }).ok);
  check('칸 번호 범위', !h.call({ action: 'guestSet', ...pw, id: p3, op: 'name', i: 4, v: 'x' }).ok);
}

check('모르는 요청', !g.call({ action: 'nope' }).ok);

console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
