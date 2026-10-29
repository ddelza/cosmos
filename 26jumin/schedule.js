// 2026 주민 천체관측회 — 운영 안내(schedule.html)·인쇄본(schedule-print.html) 공용 데이터와 그리기 함수
// 배정 데이터: years/{year}/jumin26/staff = { 자리id: 사람키(학번, 학번 없으면 이름) }
(function () {
  const SC = window.SC = {};

  const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const fmt = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  SC.hm = hm; SC.fmt = fmt;

  SC.DATE_LABEL = '2026년 11월 3일(화)';
  SC.EVENT_DAY = '2026-11-03';
  SC.PER_PART = 72;

  // ── 하루 전체 ──
  SC.PARTS = [1, 2, 3].map((n, i) => ({ n, start: hm('18:20') + i * 70 }));
  SC.DAY = [
    { key: 'prep',  label: '준비',               from: hm('16:10'), to: hm('18:10') },
    { key: 'entry', label: '1부 입장',            from: hm('18:10'), to: hm('18:20'), part: 1 },
    { key: 'part',  label: '1부',                 from: hm('18:20'), to: hm('19:20'), part: 1 },
    { key: 'entry', label: '쉬는 시간 · 2부 입장', from: hm('19:20'), to: hm('19:30'), part: 2 },
    { key: 'part',  label: '2부',                 from: hm('19:30'), to: hm('20:30'), part: 2 },
    { key: 'entry', label: '쉬는 시간 · 3부 입장', from: hm('20:30'), to: hm('20:40'), part: 3 },
    { key: 'part',  label: '3부',                 from: hm('20:40'), to: hm('21:40'), part: 3 },
    { key: 'end',   label: '뒷정리 & 뒷풀이',      from: hm('21:40'), to: hm('22:30') },
  ];
  SC.DAY_FROM = hm('16:10'); SC.DAY_TO = hm('22:30');

  // ── 한 부(60분)의 흐름: 부 시작 기준 분(offset). A·B팀 36명, 데크에서는 다시 18명씩(①·②) ──
  SC.FLOW = [
    { place: 'lab',   from: -10, to: 0,  team: 'all', label: '입장 · 접수' },
    { place: 'lab',   from: 0,   to: 6,  team: 'all', label: '별과 우주 강의' },
    { place: 'lab',   from: 6,   to: 8,  team: 'all', label: '안전교육' },
    { place: 'lab',   from: 8,   to: 10, team: 'move', label: '이동' },
    { place: 'roof',  from: 10, to: 35, team: 'A', label: 'A팀 · 12명 × 3조' },
    { place: 'deck3', from: 10, to: 22, team: 'B', sub: 1, label: 'B-① 쌍안경' },
    { place: 'deck2', from: 10, to: 22, team: 'B', sub: 2, label: 'B-② 망원경' },
    { place: 'deck3', from: 23, to: 35, team: 'B', sub: 2, label: 'B-② 쌍안경' },
    { place: 'deck2', from: 23, to: 35, team: 'B', sub: 1, label: 'B-① 망원경' },
    { place: 'roof',  from: 35, to: 60, team: 'B', label: 'B팀 · 12명 × 3조' },
    { place: 'deck3', from: 35, to: 47, team: 'A', sub: 1, label: 'A-① 쌍안경' },
    { place: 'deck2', from: 35, to: 47, team: 'A', sub: 2, label: 'A-② 망원경' },
    { place: 'deck3', from: 48, to: 60, team: 'A', sub: 2, label: 'A-② 쌍안경' },
    { place: 'deck2', from: 48, to: 60, team: 'A', sub: 1, label: 'A-① 망원경' },
  ];

  SC.PLACES = {
    roof:  { name: '옥상',      floor: 'RF', sub: '주망원경 5대 · 36명이 12명씩 3조' },
    lab:   { name: '3층 과학실', floor: '3F', sub: '입장 · 강의 · 안전교육 · 의자 72개' },
    deck3: { name: '3층 데크',  floor: '3F', sub: '쌍안경 6개 · 3명이 1개' },
    deck2: { name: '2층 데크',  floor: '2F', sub: '굴절망원경 3대 · 6명씩 토성 찾기' },
  };
  SC.PLACE_ORDER = ['lab', 'roof', 'deck3', 'deck2'];

  SC.PREP = {
    roof:  '주망원경 세팅 · 광축 정렬',
    lab:   '책상 치우고 의자 72개 · 굿즈·명부 준비',
    deck3: '쌍안경 6개 세팅',
    deck2: '굴절망원경 3대 세팅',
  };

  SC.SCOPES = [
    { key: 'slt', name: 'NexStar 102SLT', kind: 'refractor' },
    { key: 'dob', name: '돕소니안 10인치', kind: 'dob' },
    { key: 'fra', name: 'ASKAR FRA400', kind: 'astro' },
    { key: 's50', name: 'Seestar S50', kind: 'smart' },
    { key: 'c8',  name: 'Celestron C8', kind: 'sct' },
  ];

  // ── 역할 ── timing: 부 시작 기준 [from, to, 할 일]
  SC.ROLES = [
    { key: 'door', name: '문지기', place: 'lab', need: 2, color: '#ff8fb8',
      prep: '굿즈(상품) 준비, 사전신청 확인 연습',
      during: ['각 부 시작 10분 전부터 입장 받기', '사전신청 여부 확인 → 명부에 이름 적기', '사전신청자에게 상품 주기', '앞쪽 자리부터 앉도록 안내'],
      timing: [[-10, 0, '입장 접수 · 상품 · 자리 안내']] },
    { key: 'lect', name: '별과 우주 강사', place: 'lab', need: 1, color: '#6fe3c8',
      prep: '과학실 책상 치우고 의자 72개 세팅',
      during: ['각 부 첫 6분: 별과 우주 강의', '과학실 관리'],
      timing: [[0, 6, '별과 우주 강의 (6분)']] },
    { key: 'safe', name: '안전교육 강사', place: 'lab', need: 1, color: '#6fe3c8',
      prep: '과학실 책상 치우고 의자 72개 세팅',
      during: ['강의 바로 뒤 2분: 안전교육', '과학실 관리'],
      timing: [[6, 8, '안전교육 (2분)']] },
    { key: 'eng', name: '주망원경 엔지니어', place: 'roof', need: 5, color: '#b79cff',
      prep: '옥상에 맡은 망원경 세팅, 광축 정렬',
      during: ['맡은 망원경으로 관측 대상 찾기', '대상을 바꿔 가며 여러 천체 보여 주기'],
      timing: [[10, 35, 'A팀 관측'], [35, 60, 'B팀 관측']] },
    { key: 'ast', name: '엔지니어 보조', place: 'roof', need: 5, color: '#d6c8ff',
      prep: '옥상에 맡은 망원경 세팅, 광축 정렬',
      during: ['엔지니어가 대상을 찾으면 손을 들고', '찾은 대상 이름을 큐레이터들이 들리게 크게 말하기'],
      timing: [[10, 35, 'A팀 관측'], [35, 60, 'B팀 관측']] },
    { key: 'rcur', name: '옥상 큐레이터', place: 'roof', need: 6, color: '#ffd166',
      prep: '과학실 책상 치우고 의자 72개 세팅',
      during: ['2명이 한 조(관객 12명)를 맡음 — 3조 × 2명', '한 명: 각 망원경이 대상을 찾았는지 계속 확인하고 조를 데려가기', '다른 한 명: 별자리·오늘 볼 대상 설명, 관객 질문 받기', '두 사람이 역할을 번갈아 해도, 고정해도 됨'],
      timing: [[10, 35, 'A팀 조 맡기'], [35, 60, 'B팀 조 맡기']] },
    { key: 'bcur', name: '쌍안경 큐레이터', place: 'deck3', need: 6, color: '#6ee7a8',
      prep: '3층 데크에 쌍안경 6개 세팅',
      during: ['쌍안경 1개를 맡아 관객 3명 안내', '처음 3분: 쌍안경 기본 사용법 교육', '플레이아데스, 안드로메다, 알비레오(쌍성) 같은 밝은 대상 보여 주기', '12분마다 다음 18명으로 교대'],
      timing: [[10, 22, 'B-① 18명'], [23, 35, 'B-② 18명'], [35, 47, 'A-① 18명'], [48, 60, 'A-② 18명']] },
    { key: 'tcur', name: '망원경 큐레이터', place: 'deck2', need: 6, color: '#ff9f7a',
      prep: '2층 데크에 굴절망원경(90mm·70mm) 3대 세팅',
      during: ['망원경 1대에 2명 — 줄 선 관객 6명 안내', '처음 3분: 망원경 기본 사용법 교육', '관객이 토성을 직접 찾아보게 돕기', '12분마다 다음 18명으로 교대'],
      timing: [[10, 22, 'B-② 18명'], [23, 35, 'B-① 18명'], [35, 47, 'A-② 18명'], [48, 60, 'A-① 18명']] },
    { key: 'run', name: '심부름꾼', place: 'multi', need: 3, color: '#8cc8ff',
      prep: '과학실 책상 치우고 의자 72개 세팅',
      during: ['맡은 공간(옥상 / 3층 데크 / 2층 데크)에 계속 머물기', '부탁을 받으면 과학실에서 물건 가져오기, 다른 곳에 전달하기'],
      timing: [[0, 60, '맡은 공간에 상주']] },
    { key: 'talk', name: '설명꾼', place: 'any', need: 0, color: '#c3cbe3', optional: true,
      prep: '(왔다면) 과학실 책상 치우고 의자 세팅 돕기',
      during: ['옥상·데크 곳곳에서 기다리는 관객의 질문 받아 주기', '천체에 대해 설명해 주기'],
      timing: [[10, 60, '옥상·데크에서 설명']] },
  ];
  SC.role = k => SC.ROLES.find(r => r.key === k);

  // ── 자리(슬롯) ──
  SC.SLOTS = [];
  const add = (id, role, place, label) => SC.SLOTS.push({ id, role, place, label });
  add('door1', 'door', 'lab', '문지기'); add('door2', 'door', 'lab', '문지기');
  add('lect', 'lect', 'lab', '별과 우주 강의'); add('safe', 'safe', 'lab', '안전교육');
  SC.SCOPES.forEach(s => {
    add(`sc_${s.key}_eng`, 'eng', 'roof', `${s.name} 엔지니어`);
    add(`sc_${s.key}_ast`, 'ast', 'roof', `${s.name} 보조`);
  });
  [1, 2, 3].forEach(g => [1, 2].forEach(i => add(`rc_${g}_${i}`, 'rcur', 'roof', `옥상 ${g}조 큐레이터`)));
  [1, 2, 3, 4, 5, 6].forEach(b => add(`bc_${b}`, 'bcur', 'deck3', `쌍안경 ${b}번 큐레이터`));
  [1, 2, 3].forEach(t => [1, 2].forEach(i => add(`tc_${t}_${i}`, 'tcur', 'deck2', `망원경 ${t}번 큐레이터`)));
  add('run_roof', 'run', 'roof', '옥상 심부름꾼');
  add('run_d3', 'run', 'deck3', '3층 데크 심부름꾼');
  add('run_d2', 'run', 'deck2', '2층 데크 심부름꾼');
  SC.slot = id => SC.SLOTS.find(s => s.id === id);

  // ── 명단 (학번, 이름, 부서) ──
  SC.ROSTER = [
    ['3123', '최지혁', '촬영부'], ['3221', '이하리', '차장'], ['3105', '박예승', '홍보부'], ['3506', '김태연', '관측부'],
    ['3512', '심가온', '홍보부'], ['3522', '차유빈', ''], ['3216', '유승연', '홍보부'], ['3520', '정예리나', ''],
    ['3107', '박혜나', '관측부 & 홍보부'], ['3108', '백서후', '대장'], ['3421', '정다율', '관측부'], ['3211', '배주은', '관측부'],
    ['3116', '이효서', '관측부'], ['3114', '이예원', '홍보부'], ['3220', '이세은', '홍보부'], ['3516', '이세아', '관측부'],
    ['3316', '윤나현', '관측부'], ['2123', '한율', '홍보부'], ['2510', '예연희', '홍보부'], ['3111', '안예찬', '편집부'],
    ['3309', '김효영', ''], ['3418', '이시유', '관측부'], ['3504', '김재혁', '촬영부'], ['3508', '박서이', '홍보부'],
    ['2113', '오지훈', '연구부'], ['2122', '최지원', '홍보부'], ['2215', '이동빈', '연구부'], ['2312', '윤서연', '홍보부'],
    ['2503', '김민하', '관측부'], ['2520', '정다빈', '관측부'],
    ['', '이상호', ''], ['', '강승현', ''], ['', '김인구', ''], ['', '이석호', ''], ['', '이문혁', ''], ['', '박도윤', ''],
    ['', '홍다연', ''], ['', '이연우', ''], ['', '이이나', ''], ['', '박재인', ''], ['', '박찬율', ''], ['', '임주영', ''],
    ['', '최재우', ''], ['', '곽서율', ''], ['', '박가빈', ''], ['', '문하은', ''],
  ].map(([id, name, dept]) => ({ key: id || name, id, name, dept }));
  SC.person = k => SC.ROSTER.find(p => p.key === k);

  // ── 저장소 ──
  SC.staffUrl = async () => (await jmBase()) + '/staff.json';
  SC.loadStaff = async () => (await fetch(await SC.staffUrl(), { cache: 'no-store' }).then(r => r.json())) || {};
  SC.patchStaff = async patch => {
    const r = await fetch(await SC.staffUrl(), { method: 'PATCH', body: JSON.stringify(patch) });
    if (!r.ok) throw new Error('저장 실패 (' + r.status + ')');
  };
  SC.slotOf = (staff, key) => Object.keys(staff).find(id => staff[id] === key) || null;

  // ── 시각 → 상태 ──
  SC.stateAt = T => {
    const places = { lab: [], roof: [], deck3: [], deck2: [] };
    if (T < SC.DAY_FROM) return { phase: 'before', places, title: '준비 전' };
    if (T < hm('18:10')) return { phase: 'prep', places, title: '준비', t: T - SC.DAY_FROM };
    if (T >= hm('21:40')) return { phase: 'end', places, title: T < SC.DAY_TO ? '뒷정리 & 뒷풀이' : '행사 끝' };
    const part = SC.PARTS.find(p => T >= p.start - 10 && T < p.start + 60);
    const t = T - part.start;
    SC.FLOW.filter(f => t >= f.from && t < f.to).forEach(f => places[f.place].push(f));
    let title = t < 0 ? `${part.n}부 입장` : `${part.n}부 · ${t}분째`;
    if (t < 0 && part.n > 1) title = `쉬는 시간 · ${part.n}부 입장`;
    return { phase: 'part', part: part.n, t, places, title };
  };
  SC.flowLabel = (f, n) => f.team === 'all' ? `${n}부 72명 · ${f.label}` : f.team === 'move' ? 'A팀→옥상, B팀→데크 이동' : `${n}${f.label}`;

  // ── 아이콘 ──
  SC.ICON = {
    refractor: '<svg viewBox="0 0 48 48"><path d="M8 26 38 10l3 6-30 16z" fill="currentColor" opacity=".9"/><path d="M38 10l4-2 3 6-4 2z" fill="currentColor"/><path d="M24 22v6M24 28l-9 16M24 28l9 16M24 28v16" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    dob: '<svg viewBox="0 0 48 48"><path d="M14 30 30 4l7 4-16 26z" fill="currentColor" opacity=".9"/><path d="M28 3l9 5-2 3-9-5z" fill="currentColor"/><path d="M10 30h24v8H10zM8 40h28v4H8z" fill="currentColor" opacity=".6"/></svg>',
    astro: '<svg viewBox="0 0 48 48"><path d="M10 24 34 12l2.5 5-24 12z" fill="currentColor" opacity=".9"/><path d="M18 17l8-4 1 2-8 4z" fill="currentColor" opacity=".6"/><rect x="21" y="22" width="6" height="5" fill="currentColor"/><path d="M24 27l-8 17M24 27l8 17M24 27v17" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    smart: '<svg viewBox="0 0 48 48"><rect x="14" y="8" width="20" height="18" rx="5" fill="currentColor" opacity=".9"/><circle cx="24" cy="15" r="4" fill="var(--bg)"/><path d="M24 26l-8 18M24 26l8 18M24 26v18" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    sct: '<svg viewBox="0 0 48 48"><rect x="13" y="6" width="22" height="18" rx="3" transform="rotate(-25 24 15)" fill="currentColor" opacity=".9"/><path d="M14 22v8h20v-8" stroke="currentColor" stroke-width="3" fill="none"/><path d="M24 30l-8 14M24 30l8 14M24 30v14" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    bino: '<svg viewBox="0 0 48 48"><rect x="6" y="16" width="14" height="22" rx="6" fill="currentColor"/><rect x="28" y="16" width="14" height="22" rx="6" fill="currentColor"/><rect x="18" y="20" width="12" height="7" fill="currentColor" opacity=".6"/><rect x="9" y="10" width="8" height="8" rx="2" fill="currentColor" opacity=".7"/><rect x="31" y="10" width="8" height="8" rx="2" fill="currentColor" opacity=".7"/></svg>',
    board: '<svg viewBox="0 0 48 48"><rect x="4" y="8" width="40" height="24" rx="2" fill="currentColor" opacity=".85"/><path d="M14 32l-4 10M34 32l4 10" stroke="currentColor" stroke-width="2"/></svg>',
    door: '<svg viewBox="0 0 48 48"><rect x="12" y="4" width="24" height="40" rx="2" fill="currentColor" opacity=".85"/><circle cx="30" cy="25" r="2" fill="var(--bg)"/></svg>',
    bag: '<svg viewBox="0 0 48 48"><path d="M10 16h28l-3 26H13z" fill="currentColor" opacity=".85"/><path d="M18 16a6 6 0 0 1 12 0" stroke="currentColor" stroke-width="3" fill="none"/></svg>',
  };

  // ── 배치도 그리기 ──
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  SC.esc = esc;
  SC.chip = (p, extra = '') => `<span class="chip" data-person="${esc(p.key)}"${extra}>${esc(p.name)}${p.id ? `<small>${p.id}</small>` : ''}</span>`;

  SC.renderMap = (el, staff) => {
    const slot = (id, short) => {
      const s = SC.slot(id), r = SC.role(s.role), p = staff[id] && SC.person(staff[id]);
      return `<div class="slot${p ? ' filled' : ''}" data-slot="${id}" style="--rc:${r.color}">
        <span class="slot-label">${esc(short || r.name)}</span>
        ${p ? SC.chip(p) : '<span class="slot-empty">비어 있음</span>'}</div>`;
    };
    const dots = (n, cls = '') => `<span class="dots ${cls}">${'<i></i>'.repeat(n)}</span>`;
    const head = k => `<div class="fl-head"><span class="fl-tag">${SC.PLACES[k].floor}</span><b>${SC.PLACES[k].name}</b>
      <span class="fl-sub">${SC.PLACES[k].sub}</span><span class="guest" data-guest="${k}"></span></div>`;

    el.innerHTML = `
    <div class="bldg">
      <div class="stairs"><span>계<br>단</span></div>
      <section class="fl fl-roof" data-place="roof">
        ${head('roof')}
        <div class="scopes">${SC.SCOPES.map(s => `
          <div class="scope"><div class="ic">${SC.ICON[s.kind]}</div><div class="scope-name">${esc(s.name)}</div>
            ${slot(`sc_${s.key}_eng`, '엔지니어')}${slot(`sc_${s.key}_ast`, '보조')}</div>`).join('')}
        </div>
        <div class="groups">${[1, 2, 3].map(g => `
          <div class="grp"><div class="grp-name">${g}조 <small>관객 12명</small></div>${dots(12, 'g12')}
            ${slot(`rc_${g}_1`, '큐레이터')}${slot(`rc_${g}_2`, '큐레이터')}</div>`).join('')}
          <div class="grp runner"><div class="ic sm">${SC.ICON.bag}</div>${slot('run_roof', '심부름꾼')}</div>
        </div>
      </section>
      <section class="fl fl-lab" data-place="lab">
        ${head('lab')}
        <div class="lab-in">
          <div class="lab-front"><div class="ic">${SC.ICON.board}</div>${slot('lect', '별과 우주 강의')}${slot('safe', '안전교육')}</div>
          <div class="seats">${dots(72, 'g72')}<div class="seat-cap">의자 72개 · 앞쪽부터</div></div>
          <div class="lab-door"><div class="ic">${SC.ICON.door}</div>${slot('door1', '문지기')}${slot('door2', '문지기')}</div>
        </div>
      </section>
      <section class="fl fl-deck3" data-place="deck3">
        ${head('deck3')}
        <div class="stations">${[1, 2, 3, 4, 5, 6].map(b => `
          <div class="st"><div class="ic">${SC.ICON.bino}</div><div class="st-name">쌍안경 ${b}</div>${dots(3)}${slot(`bc_${b}`, '큐레이터')}</div>`).join('')}
          <div class="st runner"><div class="ic sm">${SC.ICON.bag}</div>${slot('run_d3', '심부름꾼')}</div>
        </div>
      </section>
      <section class="fl fl-deck2" data-place="deck2">
        ${head('deck2')}
        <div class="stations">${[1, 2, 3].map(t => `
          <div class="st wide"><div class="ic">${SC.ICON.refractor}</div><div class="st-name">굴절망원경 ${t}</div>${dots(6)}
            ${slot(`tc_${t}_1`, '큐레이터')}${slot(`tc_${t}_2`, '큐레이터')}</div>`).join('')}
          <div class="st runner"><div class="ic sm">${SC.ICON.bag}</div>${slot('run_d2', '심부름꾼')}</div>
        </div>
      </section>
      <div class="fl fl-in2"><div class="fl-head"><span class="fl-tag">2F</span><span class="fl-sub">실내 — 계단으로 2층 데크 이동</span></div></div>
      <div class="ground"></div>
    </div>`;
  };

  // 시각에 맞춰 관객 표시(점 켜기·배지)
  SC.paintGuests = (el, T) => {
    const st = SC.stateAt(T);
    Object.keys(st.places).forEach(k => {
      const sec = el.querySelector(`[data-place="${k}"]`); if (!sec) return;
      const fl = st.places[k];
      const badge = sec.querySelector('[data-guest]');
      sec.querySelectorAll('.dots i').forEach(d => { d.className = ''; });
      sec.classList.toggle('busy', fl.length > 0 || st.phase === 'prep');
      if (st.phase === 'prep') { badge.innerHTML = `<em class="prep">준비: ${SC.PREP[k]}</em>`; return; }
      if (st.phase === 'end') { badge.innerHTML = `<em class="prep">뒷정리</em>`; return; }
      badge.innerHTML = fl.map(f => `<em class="t-${f.team}">${SC.flowLabel(f, st.part)}</em>`).join('');
      if (!fl.length) badge.innerHTML = '<em class="idle">관객 없음</em>';
      const f = fl[0]; if (!f || f.team === 'move') return;
      sec.querySelectorAll('.dots i').forEach(d => d.classList.add('on', 't-' + f.team));
    });
    return st;
  };

  // ── 한 부 흐름 그래프(SVG) ──
  SC.flowSvg = (n, nowT) => {
    const start = SC.PARTS[n - 1].start;
    const W = 760, L = 96, R = 24, top = 26, laneH = 38, lanes = SC.PLACE_ORDER;
    const x = t => L + (t + 10) / 70 * (W - L - R);
    const H = top + lanes.length * laneH + 6;
    const fill = f => f.team === 'A' ? 'var(--teamA)' : f.team === 'B' ? 'var(--teamB)' : f.team === 'all' ? 'var(--teamAll)' : 'var(--line)';
    let s = `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="${n}부 흐름">`;
    [-10, 0, 10, 22, 35, 47, 60].forEach(t => {
      s += `<line x1="${x(t)}" y1="${top - 4}" x2="${x(t)}" y2="${H - 4}" class="grid"/>`;
      s += `<text x="${x(t)}" y="${top - 10}" class="tick" text-anchor="middle">${fmt(start + t)}</text>`;
    });
    const tw = str => [...str].reduce((a, c) => a + (c.charCodeAt(0) < 128 ? 7 : 12.5), 0);
    const laneSub = { deck3: '쌍안경 6개', deck2: '망원경 · 토성' };
    lanes.forEach((k, i) => {
      const y = top + i * laneH, mid = y + laneH / 2;
      if (laneSub[k]) s += `<text x="${L - 8}" y="${mid - 2}" class="lane" text-anchor="end">${SC.PLACES[k].name}</text><text x="${L - 8}" y="${mid + 11}" class="lane-sub" text-anchor="end">${laneSub[k]}</text>`;
      else s += `<text x="${L - 8}" y="${mid + 4}" class="lane" text-anchor="end">${SC.PLACES[k].name}</text>`;
      SC.FLOW.filter(f => f.place === k).forEach(f => {
        const x1 = x(f.from) + 1, w = x(f.to) - x(f.from) - 2;
        s += `<g class="bar" data-t="${start + f.from}"><rect x="${x1}" y="${y + 5}" width="${w}" height="${laneH - 10}" rx="6" fill="${fill(f)}" ${f.sub === 2 ? 'opacity=".72"' : ''}/>`;
        const full = f.team === 'all' || f.team === 'move' ? f.label : `${n}${f.label}`;
        const short = full.replace(/ ·.*/, '').replace('별과 우주 ', '');
        const lbl = tw(full) + 10 <= w ? full : tw(short) + 10 <= w ? short : '';
        s += `<title>${SC.fmt(start + f.from)}~${SC.fmt(start + f.to)} ${esc(SC.flowLabel(f, n))}</title>`;
        if (lbl) s += `<text x="${x1 + w / 2}" y="${mid + 4}" class="bar-t" text-anchor="middle">${esc(lbl)}</text>`;
        s += '</g>';
      });
    });
    // 과학실의 짧은 칸(안전교육·이동) 설명, 데크 3층↔2층 교대 표시
    s += `<text x="${x(10) + 8}" y="${top + laneH / 2 + 4}" class="lane-sub">← 강의 6분 → 안전교육 2분 → 이동 2분</text>`;
    const yb = top + 3 * laneH;
    [22.5, 47.5].forEach(t => {
      s += `<g class="swap"><circle cx="${x(t)}" cy="${yb}" r="10"/><text x="${x(t)}" y="${yb + 4.5}" text-anchor="middle">⇅</text></g>`;
    });
    if (nowT != null && nowT >= start - 10 && nowT <= start + 60)
      s += `<line x1="${x(nowT - start)}" y1="${top - 4}" x2="${x(nowT - start)}" y2="${H - 2}" class="now"/>`;
    return s + '</svg>';
  };

  // 역할의 1·2·3부 시각표
  SC.roleClock = r => r.timing.map(([a, b, txt]) => ({ txt, times: SC.PARTS.map(p => `${fmt(p.start + a)}~${fmt(p.start + b)}`) }));
})();
