// 2026 주민 천체관측회 — 시간 투표 (schedule.html)
// 저장: years/{year}/jumin26/timeVote/{사람키} = { name, id, d0: '0101…'(11/25 14칸), d1: '…'(11/26 14칸, 앞 3칸은 늘 0), at }
// 사람키 = SC.ROSTER의 key(학번, 학번 없으면 이름)
(function () {
  const $ = id => document.getElementById(id);
  const hm = SC.hm, fmt = SC.fmt;
  const ROW_FROM = hm('14:30'), ROWS = 14;                 // 14:30 ~ 21:30, 30분 단위 14칸
  const DAYS = [
    { key: 'd0', label: '11/25(수)', sub: '리허설 · 준비', from: hm('14:30') },
    { key: 'd1', label: '11/26(목)', sub: '관측회 당일', from: hm('16:00') },
  ];
  const rowStart = r => ROW_FROM + r * 30;
  const rowLabel = r => `${fmt(rowStart(r))}~${fmt(rowStart(r) + 30)}`;
  const enabled = (d, r) => rowStart(r) >= DAYS[d].from;
  const blank = () => DAYS.map(() => new Array(ROWS).fill(false));
  const toStr = arr => arr.map(b => (b ? '1' : '0')).join('');
  const fromStr = s => Array.from({ length: ROWS }, (_, i) => String(s || '')[i] === '1');

  const V = { me: null, sel: blank(), saved: '', votes: {}, detail: null };
  const url = async k => (await jmBase()) + '/timeVote' + (k ? '/' + encodeURIComponent(k) : '') + '.json';
  const loadVotes = async () => (await fetch(await url(), { cache: 'no-store' }).then(r => r.json())) || {};
  // 배치도(schedule.html)에서 쓰는 값: 투표 결과 공유 + 그 시각(11/26)에 자리를 비우는지
  const publish = () => { SC.votes = V.votes; window.dispatchEvent(new Event('jm26votes')); };
  SC.voteRowAt = T => { const r = Math.floor((T - ROW_FROM) / 30); return r >= 0 && r < ROWS && enabled(1, r) ? r : -1; };
  SC.voteAway = (key, T) => {
    const v = (SC.votes || {})[key], r = SC.voteRowAt(T);
    return !!v && r >= 0 && String(v.d1 || '')[r] !== '1';
  };

  // ── 펼침 상태 기억 ──
  ['voteFold', 'resFold'].forEach(id => {
    const el = $(id);
    try { if (localStorage.getItem('jm26fold_' + id) === '1') el.open = true; } catch (e) {}
    el.addEventListener('toggle', () => { try { localStorage.setItem('jm26fold_' + id, el.open ? '1' : '0'); } catch (e) {} if (id === 'resFold' && el.open) refresh(); });
  });

  // ── ① 이름 고르기 ──
  const norm = s => String(s || '').replace(/\s+/g, '');
  function renderFind() {
    const q = norm($('voteFind').value);
    if (!q) { $('voteFindRes').innerHTML = ''; return; }
    const hits = SC.ROSTER.filter(p => norm(p.name).includes(q) || (p.id && p.id.includes(q)));
    $('voteFindRes').innerHTML = hits.slice(0, 12).map(p =>
      `<button class="qbtn vote-pick" data-k="${esc(p.key)}">${esc(p.name)}${p.id ? ` <small>${esc(p.id)}</small>` : ''}${V.votes[p.key] ? ' ✓' : ''}</button>`).join('') ||
      '<span class="slot-empty">명단에 없어요. 선생님께 알려 주세요.</span>';
  }
  $('voteFind').addEventListener('input', renderFind);
  $('voteFindRes').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) pick(b.dataset.k); });

  async function pick(k) {
    const p = SC.person(k); if (!p) return;
    V.me = p;
    $('voteWho').hidden = true; $('voteBody').hidden = false;
    $('voteState').textContent = '불러오는 중…';
    try { V.votes = await loadVotes(); publish(); } catch (e) {}
    const v = V.votes[k];
    V.sel = v ? DAYS.map(d => fromStr(v[d.key])) : blank();
    V.saved = snap();
    $('voteMe').innerHTML = `<b>${esc(p.name)}</b>${p.id ? ` (${esc(p.id)})` : ''} 으로 투표해요 · <a href="#" id="voteChange">다른 사람으로 바꾸기</a>` +
      (v ? `<div class="sec-hint" style="margin:4px 0 0">이미 투표했어요 (${new Date(v.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}). 고쳐서 다시 저장할 수 있어요.</div>` : '');
    $('voteChange').onclick = ev => {
      ev.preventDefault();
      if (dirty() && !confirm('저장하지 않은 표시가 있어요. 그래도 바꿀까요?')) return;
      V.me = null; $('voteBody').hidden = true; $('voteWho').hidden = false; $('voteFind').value = ''; renderFind(); $('voteFind').focus();
    };
    renderGrid(); setState();
  }

  // ── ② 칠하기 표 ──
  const snap = () => V.sel.map(toStr).join('|');
  const dirty = () => V.me && snap() !== V.saved;
  function setState(msg) {
    const n = V.sel.map(a => a.filter(Boolean).length);
    $('voteState').textContent = msg || (dirty() ? `저장 안 됨 · 11/25 ${n[0]}칸, 11/26 ${n[1]}칸` : `저장됨 · 11/25 ${n[0]}칸, 11/26 ${n[1]}칸`);
    $('voteState').classList.toggle('warn', !msg && dirty());
  }
  function head() {
    return `<tr><th class="t">시간</th>${DAYS.map(d => `<th>${d.label}<small>${d.sub}</small></th>`).join('')}</tr>`;
  }
  function renderGrid() {
    let h = `<table class="vote-grid" id="paint"><thead>${head()}</thead><tbody>`;
    for (let r = 0; r < ROWS; r++) {
      h += `<tr><th class="t">${rowLabel(r)}</th>` + DAYS.map((d, i) => enabled(i, r)
        ? `<td class="c${V.sel[i][r] ? ' on' : ''}" data-d="${i}" data-r="${r}"></td>`
        : '<td class="off">—</td>').join('') + '</tr>';
    }
    $('voteGrid').innerHTML = h + '</tbody></table>';
  }
  // 누르거나 끌면 칠하기: 처음 누른 칸이 꺼져 있으면 「칠하기」, 켜져 있으면 「지우기」로 끝까지 같은 동작
  let paint = null;
  const cellAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest('#paint td.c'); };
  function apply(td) {
    const d = +td.dataset.d, r = +td.dataset.r;
    if (V.sel[d][r] === paint) return;
    V.sel[d][r] = paint; td.classList.toggle('on', paint); setState();
  }
  $('voteGrid').addEventListener('pointerdown', e => {
    const td = e.target.closest('td.c'); if (!td) return;
    e.preventDefault();
    paint = !V.sel[+td.dataset.d][+td.dataset.r];
    apply(td);
    try { $('voteGrid').setPointerCapture(e.pointerId); } catch (er) {}
  });
  $('voteGrid').addEventListener('pointermove', e => { if (paint === null) return; const td = cellAt(e); if (td) apply(td); });
  const stop = () => { paint = null; };
  $('voteGrid').addEventListener('pointerup', stop);
  $('voteGrid').addEventListener('pointercancel', stop);
  document.querySelector('.vote-tools').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.all != null) { const d = +b.dataset.all; const all = V.sel[d].every((x, r) => x || !enabled(d, r)); V.sel[d] = V.sel[d].map((x, r) => enabled(d, r) && !all); }
    if (b.dataset.clear) V.sel = blank();
    renderGrid(); setState();
  });
  window.addEventListener('beforeunload', e => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

  $('voteSave').onclick = async () => {
    if (!V.me) return;
    const btn = $('voteSave'); btn.disabled = true; setState('저장 중…');
    const body = { name: V.me.name, id: V.me.id || '', at: Date.now() };
    DAYS.forEach((d, i) => { body[d.key] = toStr(V.sel[i]); });
    try {
      const r = await fetch(await url(V.me.key), { method: 'PUT', body: JSON.stringify(body) });
      if (!r.ok) throw new Error('저장 실패 (' + r.status + ')');
      V.votes[V.me.key] = body; V.saved = snap(); setState(); publish();
      $('voteState').textContent = '✅ 저장했어요! ' + $('voteState').textContent;
      renderResults();
    } catch (e) { setState('⚠️ ' + e.message + ' — 다시 눌러 주세요'); }
    btn.disabled = false;
  };

  // ── 결과 ──
  async function refresh() {
    try { V.votes = await loadVotes(); } catch (e) { $('resSummary').textContent = '결과를 불러오지 못했어요'; return; }
    publish(); renderResults();
  }
  function voters() {
    // 명단 순서대로, 명단에 없는 키(명단에서 빠진 사람)는 결과에서 제외
    return SC.ROSTER.filter(p => V.votes[p.key]).map(p => ({ p, v: V.votes[p.key], sel: DAYS.map(d => fromStr(V.votes[p.key][d.key])) }));
  }
  function renderResults() {
    const vs = voters(), N = vs.length, total = SC.ROSTER.length;
    $('resSummary').textContent = `${N}명 투표 / 명단 ${total}명`;
    let h = `<table class="vote-grid res"><thead>${head()}</thead><tbody>`;
    for (let r = 0; r < ROWS; r++) {
      h += `<tr><th class="t">${rowLabel(r)}</th>` + DAYS.map((d, i) => {
        if (!enabled(i, r)) return '<td class="off">—</td>';
        const c = vs.filter(x => x.sel[i][r]).length, a = N ? c / N : 0;
        const cur = V.detail && V.detail[0] === i && V.detail[1] === r ? ' cur' : '';
        return `<td class="rc${cur}${N && c === N ? ' full' : ''}" data-d="${i}" data-r="${r}" style="--a:${a.toFixed(3)}">${c ? c + '명' : ''}</td>`;
      }).join('') + '</tr>';
    }
    $('resGrid').innerHTML = h + '</tbody></table>';
    renderDetail(vs);
    const not = SC.ROSTER.filter(p => !V.votes[p.key]);
    $('resWho').innerHTML = `<div><b>투표한 사람 ${N}명</b> ${vs.map(x => `<span class="vchip ok">${esc(x.p.name)}</span>`).join('') || '<span class="slot-empty">아직 없어요</span>'}</div>` +
      `<div style="margin-top:8px"><b>아직 안 한 사람 ${not.length}명</b> ${not.map(p => `<span class="vchip">${esc(p.name)}</span>`).join('') || '<span class="slot-empty">모두 투표했어요 🎉</span>'}</div>`;
  }
  function renderDetail(vs) {
    if (!V.detail) { $('resDetail').innerHTML = ''; return; }
    const [i, r] = V.detail;
    const yes = vs.filter(x => x.sel[i][r]), no = vs.filter(x => !x.sel[i][r]);
    $('resDetail').innerHTML = `<div class="card"><b>${DAYS[i].label} ${rowLabel(r)}</b> · 가능 ${yes.length}명 / 투표 ${vs.length}명` +
      `<div style="margin-top:6px">⭕ ${yes.map(x => `<span class="vchip ok">${esc(x.p.name)}</span>`).join('') || '없음'}</div>` +
      `<div style="margin-top:4px">❌ ${no.map(x => `<span class="vchip">${esc(x.p.name)}</span>`).join('') || '없음'}</div></div>`;
  }
  $('resGrid').addEventListener('click', e => {
    const td = e.target.closest('td.rc'); if (!td) return;
    const k = [+td.dataset.d, +td.dataset.r];
    V.detail = V.detail && V.detail[0] === k[0] && V.detail[1] === k[1] ? null : k;
    renderResults();
  });
  $('resReload').onclick = refresh;

  refresh();
})();
