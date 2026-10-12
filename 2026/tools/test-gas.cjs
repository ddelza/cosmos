// Code.gs 서버 로직 시험 (가짜 시트·캐시·드라이브):  node tools/test-gas.cjs
const { loadGas } = require('./gas-mock.cjs');
let fail = 0;
const check = (label, cond, extra) => { if (!cond) fail++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`); };

const g = loadGas();
const S1 = '18:20~19:20', S2 = '19:30~20:30', S3 = '20:40~21:40';
const base = { action: 'register', consent: 'Y' };

// 1) 기본 집계
let c = g.call({ action: 'counts' });
check('counts 기본', c.ok && c.capacity === 72 && c.studentFirstOpen === false && c.firstSlot === S1 && c.version === '2026-10-13', c);

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

// 8) 예전 형식(10열) 시트에 이어서 쓰기 — 머리글 자동 확장
const g2 = loadGas();
g2.sheet.rows.push(['제출시각', '신분', '이름/별칭', '학번', '자녀 이름', '관계', '시간대', '인원', '남길 말', '개인정보 동의']);
g2.sheet.rows.push([new Date(), '일반주민', "'=__시험용", '', '', '', S2, 2, '시험', '동의']);
c = g2.call({ action: 'counts' });
check('예전 행도 집계', c.slots[S2].people === 2, c.slots[S2]);
check('머리글 13열로 확장', g2.sheet.rows[0].length === 13 && g2.sheet.rows[0][12] === '신청 번호');
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
check('ping', g.call({ action: 'ping' }).version === '2026-10-13');
check('모르는 요청', !g.call({ action: 'nope' }).ok);

console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
