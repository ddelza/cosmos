// 2026 광수중 주민 천체관측회 — 공용 스크립트 (모든 페이지가 가장 먼저 불러옴)
// 전역 이름공간 CN 하나에 모아 둠.
(function () {
  'use strict';
  var CN = window.CN = {};

  // ===== 설정 =====
  CN.VERSION = '20261014c';
  CN.DB_URL = 'https://gwangsu-on-default-rtdb.firebaseio.com';
  CN.ROOT = 'years/2026/cosmosNight';          // 행사·천체 아카이브 데이터 (연도 바뀌어도 이 경로 고정)
  CN.ROSTER_YEAR = 2026;                        // 학생·교사 명단 연도
  CN.API_URL = 'https://script.google.com/macros/s/AKfycbwLUwLZlaqXJR4uL7FA3crSz6BzZ3u_z_dJsAYEKliJyMVWbvEhJnj4Sv3_AAq8isIn/exec';
  CN.DEFAULTS = {
    eventDate: '2026-11-03',
    previewTimes: ['18:30', '19:30', '20:30', '21:30'],
    slots: ['18:20~19:20', '19:30~20:30', '20:40~21:40'],
    notice: '',
    regOpen: true,
    capacity: 72,
    placeText: '광수중학교 3층 과학실 · 3층 데크 · 옥상',
    addressText: '경기도 광주시 퇴촌면 도수길23번길 23',
  };
  CN.LOC = { lat: 37.47304, lon: 127.3196, elev: 50, name: '광수중학교' };
  // 다른 폴더의 페이지(예: cosmos/nightly.html)가 이 코드를 쓸 때: 페이지에서 window.CN_BASE = '2026/'
  CN.BASE = window.CN_BASE || '';
  CN.asset = function (p) { return /^(data:|https?:|\/)/.test(p) ? p : CN.BASE + p; };

  // ===== 문자열 =====
  CN.esc = function (s) {
    if (s === undefined || s === null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  // 아주 간단한 서식: 빈 줄 = 문단, "- " / "1. " 목록, **굵게**
  CN.md = function (text) {
    var src = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!src) return '';
    var blocks = src.split(/\n{2,}/);
    return blocks.map(function (b) {
      var lines = b.split('\n');
      var bullet = lines.every(function (l) { return /^\s*[-•]\s+/.test(l); });
      var numbered = lines.every(function (l) { return /^\s*\d+[.)]\s+/.test(l); });
      var inline = function (s) { return CN.esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); };
      if (bullet) return '<ul>' + lines.map(function (l) { return '<li>' + inline(l.replace(/^\s*[-•]\s+/, '')) + '</li>'; }).join('') + '</ul>';
      if (numbered) return '<ol>' + lines.map(function (l) { return '<li>' + inline(l.replace(/^\s*\d+[.)]\s+/, '')) + '</li>'; }).join('') + '</ol>';
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    }).join('');
  };
  CN.qs = function (k) { return new URLSearchParams(location.search).get(k); };
  // 받침에 맞는 조사: CN.josa('목성', '으로', '로') → '목성으로'
  CN.josa = function (word, withBatchim, without) {
    var w = String(word || ''), c = w.charCodeAt(w.length - 1);
    if (c < 0xAC00 || c > 0xD7A3) return w + without;
    var jong = (c - 0xAC00) % 28;
    if (withBatchim === '으로' && jong === 8) return w + without; // ㄹ 받침은 '로'
    return w + (jong ? withBatchim : without);
  };
  CN.fmtWhen = function (ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };

  // ===== 작성자·편집자 표시 =====
  // 기록: author/authorAt = 처음 쓴 사람, by/at = 마지막으로 고친 사람 (예전 기록은 author가 없으면 by를 작성자로 봄)
  // 모두에게 이름을 보여 주고, 학번과 시각은 관리자 로그인했을 때만
  CN.personName = function (label) { return String(label || '').replace(/^\d{4,5}\s+/, ''); };
  CN.authorOf = function (rec) { return (rec && (rec.author || rec.by)) || ''; };
  CN.byline = function (rec, o) {
    o = o || {};
    var author = CN.authorOf(rec);
    if (!author) return '';
    var authorAt = rec.author ? rec.authorAt : rec.at, admin = CN.isAdmin();
    var nm = function (l) { return '<b>' + CN.esc(admin ? l : CN.personName(l)) + '</b>'; };
    var when = function (t) { return admin && t ? ' <span class="when">' + CN.fmtWhen(t) + '</span>' : ''; };
    var parts = [(o.made || '작성') + ' ' + nm(author) + when(authorAt)];
    if (rec.by && rec.by !== author) parts.push((o.edited || '편집') + ' ' + nm(rec.by) + when(rec.at));
    else if (admin && rec.at && authorAt && rec.at - authorAt > 60000) parts.push('마지막 저장' + when(rec.at));
    if (o.extra) parts.push(o.extra);
    return '<div class="by">✎ ' + parts.join(' · ') + '</div>';
  };
  // 저장할 때 붙일 값: 작성자는 그대로 두고(없으면 지금 사람, 또는 예전 기록의 by), 편집자·시각은 지금으로
  // prev가 내용 없는 빈 기록이면 null을 넘겨서 지금 사람이 작성자가 되게 함
  CN.stamp = function (prev, extra) {
    var me = CN.adminLabel(), now = Date.now(), out = { by: me, at: now };
    var a = CN.authorOf(prev);
    out.author = a || me;
    out.authorAt = a ? (prev.author ? prev.authorAt : prev.at) || now : now;
    return Object.assign(out, extra || {});
  };
  CN.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };

  // ===== Firebase RTDB (REST) =====
  function url(path) { return CN.DB_URL + '/' + path.replace(/^\/+/, '') + '.json'; }
  CN.db = {
    get: async function (path, opts) {
      var r = await fetch(url(path) + (opts && opts.shallow ? '?shallow=true' : ''), { cache: 'no-store' });
      if (!r.ok) throw new Error('DB 읽기 실패 (' + r.status + ')');
      return r.json();
    },
    // 조건부 쓰기용: 값 + ETag
    getTagged: async function (path) {
      var r = await fetch(url(path), { headers: { 'X-Firebase-ETag': 'true' }, cache: 'no-store' });
      if (!r.ok) throw new Error('DB 읽기 실패 (' + r.status + ')');
      return { data: await r.json(), etag: r.headers.get('ETag') };
    },
    put: async function (path, value) {
      var r = await fetch(url(path), { method: 'PUT', body: JSON.stringify(value) });
      if (!r.ok) throw new Error('DB 저장 실패 (' + r.status + ')');
      return r.json();
    },
    // etag가 같을 때만 저장. 다른 사람이 먼저 저장했으면 {ok:false, conflict:true, current, etag}
    putIfMatch: async function (path, value, etag) {
      var headers = { 'X-Firebase-ETag': 'true' };
      if (etag) headers['if-match'] = etag;
      var r = await fetch(url(path), { method: 'PUT', headers: headers, body: JSON.stringify(value) });
      if (r.status === 412) return { ok: false, conflict: true, current: await r.json(), etag: r.headers.get('ETag') };
      if (!r.ok) throw new Error('DB 저장 실패 (' + r.status + ')');
      return { ok: true, data: await r.json(), etag: r.headers.get('ETag') };
    },
    patch: async function (path, value) {
      var r = await fetch(url(path), { method: 'PATCH', body: JSON.stringify(value) });
      if (!r.ok) throw new Error('DB 저장 실패 (' + r.status + ')');
      return r.json();
    },
    post: async function (path, value) {
      var r = await fetch(url(path), { method: 'POST', body: JSON.stringify(value) });
      if (!r.ok) throw new Error('DB 저장 실패 (' + r.status + ')');
      return r.json(); // {name: pushId}
    },
    del: async function (path) {
      var r = await fetch(url(path), { method: 'DELETE' });
      if (!r.ok) throw new Error('DB 삭제 실패 (' + r.status + ')');
    },
  };
  CN.path = function () { return [CN.ROOT].concat([].slice.call(arguments)).join('/'); };

  // ===== Apps Script API (신청·사진·비밀번호) =====
  // 커스텀 헤더 없는 단순 POST → CORS 사전 요청 없음 (동아리 사이트와 같은 방식)
  CN.api = async function (action, params, timeoutMs) {
    var body = new URLSearchParams(Object.assign({ action: action }, params || {}));
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, timeoutMs || 30000);
    try {
      var r = await fetch(CN.API_URL, { method: 'POST', body: body, signal: ctrl.signal });
      var text = await r.text();
      var data;
      try { data = JSON.parse(text); } catch (e) { throw new Error('서버 응답을 읽을 수 없습니다.'); }
      return data;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('서버 응답이 늦습니다. 잠시 후 다시 시도해 주세요.');
      throw e;
    } finally { clearTimeout(t); }
  };

  // ===== 이 기기에서 한 사전신청 (공개 설정을 바꿀 수 있도록 신청 번호를 기기에만 보관) =====
  var REGS_KEY = 'cn26regs';
  CN.myRegs = function () {
    try {
      var list = JSON.parse(localStorage.getItem(REGS_KEY) || '[]');
      var old = JSON.parse(localStorage.getItem('cn26reg') || 'null'); // 예전 형식(신청 번호 없음)
      if (old && old.who) { list.push({ id: '', who: old.who, slot: old.slot, at: old.at, public: false }); localStorage.removeItem('cn26reg'); localStorage.setItem(REGS_KEY, JSON.stringify(list)); }
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  };
  CN.addMyReg = function (r) {
    try { var list = CN.myRegs(); list.push(r); localStorage.setItem(REGS_KEY, JSON.stringify(list)); } catch (e) {}
  };
  CN.setRegPublic = async function (id, on) {
    var res = await CN.api('setPublic', { id: id, public: on ? 'Y' : 'N' });
    if (!res || !res.ok) throw new Error(res && res.error ? res.error : '공개 설정을 바꾸지 못했어요.');
    try {
      var list = CN.myRegs().map(function (r) { if (r.id === id) r.public = !!on; return r; });
      localStorage.setItem(REGS_KEY, JSON.stringify(list));
    } catch (e) {}
    return res;
  };

  // ===== 행사 설정 (DB, 실패하면 기본값) =====
  var configPromise = null;
  CN.getConfig = function () {
    if (!configPromise) {
      configPromise = CN.db.get(CN.path('config')).then(function (c) {
        return Object.assign({}, CN.DEFAULTS, c || {});
      }).catch(function () { return Object.assign({}, CN.DEFAULTS); });
    }
    return configPromise;
  };
  CN.dateLabel = function (dateStr) {
    var d = new Date(dateStr + 'T12:00:00+09:00');
    var w = '일월화수목금토'[d.getUTCDay()];
    var p = dateStr.split('-');
    return Number(p[0]) + '년 ' + Number(p[1]) + '월 ' + Number(p[2]) + '일(' + w + ')';
  };
  CN.dateShort = function (dateStr) {
    var d = new Date(dateStr + 'T12:00:00+09:00');
    var p = dateStr.split('-');
    return Number(p[1]) + '/' + Number(p[2]) + '(' + '일월화수목금토'[d.getUTCDay()] + ')';
  };

  // ===== 관리자 세션 =====
  var ADMIN_KEY = 'cn26Admin';
  var ADMIN_DAYS = 7;
  CN.admin = function () {
    try {
      var a = JSON.parse(localStorage.getItem(ADMIN_KEY) || 'null');
      if (!a || !a.pw || !a.who) return null;
      if (Date.now() - a.at > ADMIN_DAYS * 864e5) { localStorage.removeItem(ADMIN_KEY); return null; }
      return a;
    } catch (e) { return null; }
  };
  CN.isAdmin = function () { return !!CN.admin(); };
  CN.adminLabel = function () { var a = CN.admin(); return a ? a.who.label : ''; };
  CN.logout = function () { try { localStorage.removeItem(ADMIN_KEY); } catch (e) {} location.reload(); };

  async function verifyPerson(kind, id, name) {
    name = name.replace(/\s+/g, '');
    if (kind === 'student') {
      if (!/^\d{4}$/.test(id)) throw new Error('학번 4자리를 입력해 주세요. 예) 2학년 1반 15번 → 2115');
      var s = await CN.db.get('years/' + CN.ROSTER_YEAR + '/students/' + id);
      if (!s || String(s.name || '').replace(/\s+/g, '') !== name) throw new Error('학번과 이름이 학생 명단과 맞지 않습니다.');
      return { kind: 'student', id: id, name: s.name, label: id + ' ' + s.name };
    }
    var list = await CN.db.get('years/' + CN.ROSTER_YEAR + '/teachers');
    var hit = Object.values(list || {}).find(function (t) { return String(t.name || '').replace(/\s+/g, '') === name; });
    if (!hit) throw new Error('교직원 명단에서 이름을 찾을 수 없습니다.');
    return { kind: 'teacher', id: '', name: hit.name, label: hit.name + ' 선생님' };
  }

  CN.openLogin = function () {
    var html =
      '<div class="modal-head"><div class="t">관리자 로그인</div><button class="icon-btn" data-close>닫기</button></div>' +
      '<p class="sub">로그인하면 포스터·공지·천체 설명·사진을 편집할 수 있어요. 편집 기록에 이름이 남습니다.</p>' +
      '<div class="chips" id="lgKind"><button class="chip on" data-k="student" aria-pressed="true">학생</button><button class="chip" data-k="teacher" aria-pressed="false">교사</button></div>' +
      '<div id="lgIdRow"><label class="field" for="lgId">학번 (4자리)</label><input type="tel" id="lgId" maxlength="4" inputmode="numeric" placeholder="2115"></div>' +
      '<label class="field" for="lgName">이름</label><input type="text" id="lgName" placeholder="홍길동" autocomplete="off">' +
      '<label class="field" for="lgPw">관리자 비밀번호</label><input type="password" id="lgPw" autocomplete="current-password">' +
      '<div class="msg err" id="lgErr"></div>' +
      '<button class="btn primary block" id="lgGo" style="margin-top:16px">로그인</button>';
    var m = CN.modal(html, { narrow: true });
    var kind = 'student';
    m.el.querySelectorAll('#lgKind .chip').forEach(function (b) {
      b.onclick = function () {
        kind = b.dataset.k;
        m.el.querySelectorAll('#lgKind .chip').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
        m.el.querySelector('#lgIdRow').style.display = kind === 'student' ? '' : 'none';
      };
    });
    var go = m.el.querySelector('#lgGo'), err = m.el.querySelector('#lgErr');
    var submit = async function () {
      err.classList.remove('show');
      go.disabled = true; go.textContent = '확인 중…';
      try {
        var id = m.el.querySelector('#lgId').value.trim();
        var name = m.el.querySelector('#lgName').value.trim();
        var pw = m.el.querySelector('#lgPw').value;
        if (!name) throw new Error('이름을 입력해 주세요.');
        if (!pw) throw new Error('비밀번호를 입력해 주세요.');
        var who = await verifyPerson(kind, id, name);
        var res = await CN.api('checkPw', { pw: pw });
        if (!res || !res.ok) throw new Error(res && res.error ? res.error : '비밀번호가 맞지 않습니다.');
        localStorage.setItem(ADMIN_KEY, JSON.stringify({ pw: pw, who: who, at: Date.now() }));
        location.reload();
      } catch (e) {
        err.textContent = e.message; err.classList.add('show');
        go.disabled = false; go.textContent = '로그인';
      }
    };
    go.onclick = submit;
    m.el.querySelector('#lgPw').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  };

  // ===== 토스트 / 모달 =====
  CN.toast = function (text, ms) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, ms || 2400);
  };

  // 모바일 뒤로가기(브라우저 back)로 페이지 대신 맨 위 모달부터 닫기
  var modalStack = [], ignorePops = 0;
  window.addEventListener('popstate', function () {
    if (ignorePops > 0) { ignorePops--; return; }
    var top = modalStack[modalStack.length - 1];
    if (top) top.fromPop();
  });

  // html을 담은 모달을 열고 {el, close} 반환. opts.onClose, opts.beforeClose
  CN.modal = function (html, opts) {
    opts = opts || {};
    var back = document.createElement('div');
    back.className = 'modal-back show';
    back.innerHTML = '<div class="modal" role="dialog" aria-modal="true"' + (opts.narrow ? ' style="max-width:460px"' : opts.wide ? ' style="max-width:1000px"' : '') + '>' + html + '</div>';
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
    var el = back.querySelector('.modal');
    var closed = false;
    var entry = { pushed: false };
    var finish = function () {
      closed = true;
      back.remove();
      var i = modalStack.indexOf(entry); if (i >= 0) modalStack.splice(i, 1);
      if (!document.querySelector('.modal-back')) document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    };
    // 닫기 버튼·바깥 누르기·Esc
    var close = function () {
      if (closed) return;
      if (opts.beforeClose && opts.beforeClose() === false) return;
      finish();
      if (entry.pushed) { entry.pushed = false; ignorePops++; try { history.back(); } catch (e) { ignorePops--; } }
    };
    // 휴대폰 뒤로가기
    entry.fromPop = function () {
      if (closed) return;
      entry.pushed = false;
      if (opts.beforeClose && opts.beforeClose() === false) { try { history.pushState({ cnModal: 1 }, ''); entry.pushed = true; } catch (e) {} return; }
      finish();
    };
    try { history.pushState({ cnModal: 1 }, ''); entry.pushed = true; } catch (e) {}
    modalStack.push(entry);
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    el.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    return { el: el, close: close, back: back };
  };

  // ===== 컬러 이모지 → 붉은 톤 (암적응 보호) =====
  // 화면에 들어오는 모든 글자에서 컬러 이모지를 <span class="emo">로 감싸 CSS 필터로 붉게 만든다.
  // 학생이 쓴 글의 이모지도 포함. 입력칸(textarea/input/select) 안은 건드리지 않음.
  (function () {
    var RE, TEST;
    try {
      RE = new RegExp('(\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}|[\\u{1F3FB}-\\u{1F3FF}])*)', 'gu');
      TEST = new RegExp('\\p{Extended_Pictographic}', 'u');
    } catch (e) { return; } // 아주 오래된 브라우저는 그냥 둠
    var SKIP = 'textarea,script,style,option,select,input,svg,.emo,.no-emo';
    function wrapIn(root) {
      if (!root) return;
      if (root.nodeType === 3) { if (root.parentNode) wrapIn(root.parentNode); return; }
      if (root.nodeType !== 1 || (root.closest && root.closest(SKIP))) return;
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          var p = n.parentNode;
          if (!p || (p.closest && p.closest(SKIP))) return NodeFilter.FILTER_REJECT;
          return TEST.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      var nodes = [], n;
      while ((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(function (t) {
        var parts = t.nodeValue.split(RE);
        if (parts.length < 2) return;
        var frag = document.createDocumentFragment();
        parts.forEach(function (s, i) {
          if (!s) return;
          if (i % 2) { var sp = document.createElement('span'); sp.className = 'emo'; sp.textContent = s; frag.appendChild(sp); }
          else frag.appendChild(document.createTextNode(s));
        });
        t.parentNode.replaceChild(frag, t);
      });
    }
    CN.wrapEmoji = wrapIn;
    function start() {
      wrapIn(document.body);
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          if (m.type === 'characterData') wrapIn(m.target);
          else m.addedNodes.forEach(wrapIn);
        });
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  })();

  // ===== 상단 바 / 하단 =====
  var NIGHT_KEY = 'cn26NightPhotos';
  function applyNight(on) { document.documentElement.classList.toggle('night-photos', !!on); }
  try { applyNight(localStorage.getItem(NIGHT_KEY) === '1'); } catch (e) {}

  CN.topbar = function (opts) {
    opts = opts || {};
    var bar = document.createElement('header');
    bar.className = 'topbar';
    var night = document.documentElement.classList.contains('night-photos');
    bar.innerHTML =
      '<a class="home" href="' + CN.esc(opts.href || CN.asset('index.html')) + '">🌙 ' + CN.esc(opts.title || '2026 주민관측회') + '<small>' + CN.esc(opts.small || '광수중') + '</small></a><span class="spacer"></span>' +
      (CN.isAdmin() ? '<span class="admin-chip" title="관리자 모드">✎ ' + CN.esc(CN.adminLabel()) + '</span>' : '') +
      '<button class="icon-btn" id="nightBtn" aria-pressed="' + night + '" title="사진까지 붉게 보기 — 관측 중 눈의 암적응 보호">사진 붉게</button>';
    document.body.insertBefore(bar, document.body.firstChild);
    bar.querySelector('#nightBtn').onclick = function () {
      var on = !document.documentElement.classList.contains('night-photos');
      applyNight(on);
      this.setAttribute('aria-pressed', on);
      try { localStorage.setItem(NIGHT_KEY, on ? '1' : '0'); } catch (e) {}
    };
  };

  CN.footer = function (opts) {
    var f = document.createElement('footer');
    f.className = 'foot';
    var admin = CN.isAdmin();
    f.innerHTML =
      '광수중학교 천체관측동아리 코스모스 · <a href="' + CN.asset('credits.html') + '">사진 출처</a>' +
      (admin
        ? '<div style="margin-top:8px"><a href="' + CN.asset('admin.html') + '">관리자 메뉴</a> · <button class="admin-login-link" id="logoutBtn">로그아웃</button></div>'
        : (opts && opts.loginLink ? '<div><button class="admin-login-link" id="loginLink">관리자 로그인</button></div>' : ''));
    (document.querySelector('.wrap') || document.body).appendChild(f);
    var lo = f.querySelector('#logoutBtn'); if (lo) lo.onclick = CN.logout;
    var li = f.querySelector('#loginLink'); if (li) li.onclick = CN.openLogin;
  };

  // ===== 사진: 압축 → 드라이브 업로드 → 표시 =====
  CN.compressImage = function (file, maxDim, maxChars) {
    maxDim = maxDim || 2048; maxChars = maxChars || 2.2e6;
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || 'image/')) return reject(new Error('사진 파일만 올릴 수 있어요.'));
      var urlObj = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(urlObj);
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return reject(new Error('사진을 읽을 수 없어요.'));
        var scale = Math.min(1, maxDim / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        var q = 0.9, out = c.toDataURL('image/jpeg', q);
        while (out.length > maxChars && q > 0.5) { q -= 0.08; out = c.toDataURL('image/jpeg', q); }
        resolve(out);
      };
      img.onerror = function () {
        URL.revokeObjectURL(urlObj);
        reject(new Error('이 사진 형식은 열 수 없어요(HEIC 등). 휴대폰에서 JPG로 바꾸거나 캡처해서 올려 주세요.'));
      };
      img.src = urlObj;
    });
  };
  // folder: 천체 id 또는 _poster / _pages
  CN.uploadPhoto = async function (folder, file, onStage) {
    var a = CN.admin();
    if (!a) throw new Error('관리자 로그인이 필요합니다.');
    if (onStage) onStage('사진 줄이는 중…');
    var data = await CN.compressImage(file);
    if (onStage) onStage('올리는 중…');
    var res = await CN.api('uploadPhoto', { pw: a.pw, by: a.who.label, folder: folder, data: data }, 90000);
    if (!res || !res.ok) throw new Error(res && res.error ? res.error : '업로드 실패');
    return res.fileId;
  };
  CN.trashPhoto = async function (fileId) {
    var a = CN.admin();
    if (!a || !fileId) return;
    try { await CN.api('trashPhoto', { pw: a.pw, fileId: fileId }); } catch (e) { /* DB에서는 이미 빠졌으므로 무시 */ }
  };
  // 정적 사본이 있으면 그것, 없으면 드라이브 썸네일
  CN.staticPhotos = {};
  CN.photoUrl = function (fileId, w) {
    w = w || 400;
    var s = CN.staticPhotos[fileId];
    if (s) return CN.asset(w > 500 ? s.full : s.thumb);
    return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w' + w;
  };
  // <img onerror> 대체 사슬: 드라이브 썸네일 → lh3 → (3초 뒤) 드라이브 다시 → 기본 이미지
  // 방금 올린 사진은 드라이브가 썸네일을 만드는 데 몇 초 걸릴 수 있음
  CN.imgFallback = function (img) {
    var step = Number(img.dataset.fb || 0);
    img.dataset.fb = step + 1;
    var id = img.dataset.fid, w = img.dataset.w || 400;
    if (step === 0 && id) { img.src = 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(id) + '=w' + w; return; }
    if (step === 1 && id) {
      setTimeout(function () { img.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + w + '&r=' + Date.now(); }, 3000);
      return;
    }
    if (img.dataset.alt) { img.removeAttribute('onerror'); img.src = img.dataset.alt; return; }
    img.style.visibility = 'hidden';
  };
  CN.driveImgTag = function (fileId, w, cls, altSrc, alt) {
    return '<img class="' + (cls || 'photo') + '" loading="lazy" decoding="async" src="' + CN.esc(CN.photoUrl(fileId, w)) + '" data-fid="' + CN.esc(fileId) +
      '" data-w="' + (w || 400) + '"' + (altSrc ? ' data-alt="' + CN.esc(altSrc) + '"' : '') + ' alt="' + CN.esc(alt || '') + '" onerror="CN.imgFallback(this)">';
  };

  // ===== 별 기본 이미지 (B−V 색지수로 색칠한 별 그림) =====
  CN.bvToRgb = function (bv) {
    // Ballesteros 공식으로 온도 → 대략적인 RGB
    if (bv == null || isNaN(bv)) bv = 0.6;
    bv = Math.max(-0.4, Math.min(2.0, bv));
    var t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
    var r, g, b, x = t / 100;
    r = x <= 66 ? 255 : 329.7 * Math.pow(x - 60, -0.1332);
    g = x <= 66 ? 99.47 * Math.log(x) - 161.12 : 288.12 * Math.pow(x - 60, -0.0755);
    b = x >= 66 ? 255 : (x <= 19 ? 0 : 138.52 * Math.log(x - 10) - 305.04);
    var c = function (v) { return Math.round(Math.max(0, Math.min(255, v))); };
    return [c(r), c(g), c(b)];
  };
  CN.starImg = function (bv, mag) {
    var rgb = CN.bvToRgb(bv), col = 'rgb(' + rgb.join(',') + ')';
    var size = Math.max(10, Math.min(30, 22 - (mag || 1) * 3));
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="' + col + '"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="100" height="100" fill="#050203"/>' +
      '<g stroke="' + col + '" stroke-opacity=".55" stroke-width="1.2"><line x1="50" y1="' + (50 - size * 1.9) + '" x2="50" y2="' + (50 + size * 1.9) + '"/><line x1="' + (50 - size * 1.9) + '" y1="50" x2="' + (50 + size * 1.9) + '" y2="50"/></g>' +
      '<circle cx="50" cy="50" r="' + size + '" fill="url(#g)"/></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };

  // ===== 숫자 표기 =====
  function comma(n) { return Math.round(n).toLocaleString('ko-KR'); }
  // 444광년 / 2만 4,500광년 / 254만 광년 / 1억 2,000만 광년
  CN.fmtLy = function (ly) {
    if (ly == null || isNaN(ly)) return '';
    if (ly < 10) return (Math.round(ly * 10) / 10) + '광년';
    if (ly < 10000) return comma(ly) + '광년';
    if (ly < 1e6) {                       // 2만 4,500광년
      var n = Math.round(ly), m = Math.floor(n / 1e4), rest = n % 1e4;
      return m + '만' + (rest ? ' ' + comma(rest) : '') + '광년';
    }
    if (ly < 1e8) return comma(Math.round(ly / 1e4)) + '만 광년';   // 254만 광년
    var eok = Math.floor(ly / 1e8), man = Math.round((ly % 1e8) / 1e4);  // 1억 2,000만 광년
    if (man >= 10000) { eok++; man = 0; }
    return eok + '억' + (man ? ' ' + comma(man) + '만' : '') + ' 광년';
  };
  CN.fmtKm = function (km) {
    if (km == null) return '';
    if (km >= 1e8) return (Math.round(km / 1e6) / 100).toLocaleString('ko-KR') + '억 km';
    if (km >= 1e4) { var man = Math.floor(km / 1e4), rest = Math.round(km % 1e4); return comma(man) + '만' + (rest ? ' ' + comma(rest) : '') + 'km'; }
    return comma(km) + 'km';
  };
  CN.fmtMag = function (m) {
    if (m == null || isNaN(m)) return '';
    var r = Math.round(m * 100) / 100;
    var s = Number.isInteger(r) ? r.toFixed(1) : String(r);
    return (r > 0 ? '+' : r < 0 ? '−' : '') + s.replace('-', '') + '등급';
  };
  CN.fmtRA = function (h) {
    if (h == null) return '';
    var t = Math.round(h * 3600); var hh = Math.floor(t / 3600), mm = Math.floor(t % 3600 / 60), ss = t % 60;
    return hh + 'h ' + String(mm).padStart(2, '0') + 'm ' + String(ss).padStart(2, '0') + 's';
  };
  CN.fmtDec = function (d) {
    if (d == null) return '';
    var sign = d < 0 ? '−' : '+'; var t = Math.round(Math.abs(d) * 3600);
    return sign + Math.floor(t / 3600) + '° ' + String(Math.floor(t % 3600 / 60)).padStart(2, '0') + '′ ' + String(t % 60).padStart(2, '0') + '″';
  };
  CN.fmtArcmin = function (a) {
    if (a == null) return '';
    if (a >= 60) return (Math.round(a / 6) / 10) + '° (' + Math.round(a) + '′)';
    return (a < 10 ? Math.round(a * 10) / 10 : Math.round(a)) + '′';
  };
  // 겉보기 크기와 거리로 실제 반지름(광년)
  CN.radiusLy = function (sizeArcmin, distLy) {
    if (!sizeArcmin || !distLy) return null;
    return distLy * Math.tan((sizeArcmin / 2) * Math.PI / 10800);
  };
  CN.fmtRadius = function (r) {
    if (r == null) return '';
    if (r < 1) return (Math.round(r * 100) / 100) + '광년';
    if (r < 100) return (Math.round(r * 10) / 10) + '광년';
    return CN.fmtLy(r);
  };
})();
