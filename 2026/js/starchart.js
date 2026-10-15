// 호핑법 그림 도구 — 별·점선·원·글자로 "찾아가는 길"을 그림 (사진 대신 쓸 수 있음)
// DB에는 그림 파일이 아니라 좌표만 저장: objects/{id}/hopping/{key}/chart
//   { v:1, bg:true(배경 잔별), seed:n, items:[
//       {id,t:'star',x,y,s} | {id,t:'line',x1,y1,x2,y2,a,b,div} | {id,t:'circle',x,y,r} | {id,t:'text',x,y,v,s} ] }
// 좌표는 1000×700 기준. 선의 a·b는 끝이 붙은 별 id — 별을 옮기면 선도 따라감. s는 크기 1~3, div는 분할 수
(function () {
  'use strict';
  var CN = window.CN, esc = CN.esc;
  var W = 1000, H = 700, SNAP = 28;
  var STAR_R = [0, 5, 8, 12.5];
  var TEXT_PX = [0, 26, 34, 46];
  var SIZE_LABEL = ['', '작게', '보통', '크게'];
  var C = { bg: '#070304', faint: '#4a2422', star: '#ffd2cc', text: '#e9b7b2', line: '#d9483c', solid: '#a8433b', white: '#f4ece9', whiteSolid: '#cbbfbc', red: '#e0453b', ui: '#ffd2cc' };
  var FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";
  var CLIP_KEY = 'cn26chartClip';
  var LAYER = { circle: 0, line: 1, star: 2, text: 3 };

  // ===== 공통 =====
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function sizeOf(it) { return clamp(Math.round(num(it.s, 2)), 1, 3); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // DB에서 온 값 정리 (배열이 객체로 오는 경우 포함)
  function norm(chart) {
    chart = chart || {};
    var items = chart.items || [];
    if (!Array.isArray(items)) items = Object.keys(items).sort(function (a, b) { return a - b; }).map(function (k) { return items[k]; });
    return { v: 1, bg: chart.bg !== false, seed: num(chart.seed, 7), bgFile: chart.bgFile || null, items: items.filter(function (it) { return it && it.id && LAYER[it.t] !== undefined; }) };
  }
  function starMap(items) { var m = {}; items.forEach(function (it) { if (it.t === 'star') m[it.id] = it; }); return m; }
  function ends(it, byId) {
    var a = it.a && byId[it.a], b = it.b && byId[it.b];
    return { x1: a ? a.x : num(it.x1, 0), y1: a ? a.y : num(it.y1, 0), x2: b ? b.x : num(it.x2, 0), y2: b ? b.y : num(it.y2, 0) };
  }
  function textBox(it) {
    var fs = TEXT_PX[sizeOf(it)], v = String(it.v || ''), w = 0;
    for (var i = 0; i < v.length; i++) {
      var ch = v.charCodeAt(i);
      w += ch === 32 ? 0.32 : ch > 0x2e80 ? 0.98 : /[A-Z0-9]/.test(v[i]) ? 0.64 : 0.55;
    }
    return { x: it.x, y: it.y - fs * 0.84, w: Math.max(w * fs, fs * 0.6), h: fs * 1.1 };
  }
  function segDist(p, e) {
    var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L2 = dx * dx + dy * dy;
    var t = L2 ? clamp(((p.x - e.x1) * dx + (p.y - e.y1) * dy) / L2, 0, 1) : 0;
    return dist(p.x, p.y, e.x1 + dx * t, e.y1 + dy * t);
  }

  // ===== 그리기 (보기·편집 공용) =====
  var gidN = 0;
  function body(chart, gid) {
    var c = norm(chart), byId = starMap(c.items), g = gid || ('sc' + (++gidN)), h = '';
    h += '<defs><radialGradient id="' + g + '"><stop offset="0" stop-color="' + C.star + '" stop-opacity=".5"/><stop offset="1" stop-color="' + C.star + '" stop-opacity="0"/></radialGradient></defs>';
    h += '<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>';
    if (c.bgFile) {
      // 배경 사진(스텔라리움 캡처 등) — 드라이브 썸네일이 안 되면 다른 주소로 한 번 더
      var alt = 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(c.bgFile) + '=w1600';
      h += '<image href="' + esc(CN.photoUrl(c.bgFile, 1600)) + '" x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="xMidYMid slice" opacity=".85"' +
        ' onerror="if(!this.dataset.fb){this.dataset.fb=1;this.setAttribute(\'href\',\'' + esc(alt) + '\')}"/>';
    }
    if (c.bg) {
      var R = rng(c.seed);
      h += '<g fill="' + C.faint + '">';
      for (var i = 0; i < 170; i++) h += '<circle cx="' + r1(R() * W) + '" cy="' + r1(R() * H) + '" r="' + r1(0.5 + R() * 1.3) + '"/>';
      h += '</g>';
    }
    c.items.slice().sort(function (a, b) { return LAYER[a.t] - LAYER[b.t]; }).forEach(function (it) {
      if (it.t === 'circle') {
        h += '<circle cx="' + r1(it.x) + '" cy="' + r1(it.y) + '" r="' + r1(Math.max(4, num(it.r, 40))) + '" fill="none" stroke="' + (it.col === 'w' ? C.white : C.red) + '" stroke-width="4"/>';
      } else if (it.t === 'line') {
        var e = ends(it, byId);
        var n = Math.round(num(it.div, 0)), L = dist(e.x1, e.y1, e.x2, e.y2);
        var lc = it.col === 'w' ? (it.solid ? C.whiteSolid : C.white) : (it.solid ? C.solid : C.line);
        h += it.solid
          ? '<line x1="' + r1(e.x1) + '" y1="' + r1(e.y1) + '" x2="' + r1(e.x2) + '" y2="' + r1(e.y2) + '" stroke="' + lc + '" stroke-width="3" stroke-linecap="round"/>'
          : '<line x1="' + r1(e.x1) + '" y1="' + r1(e.y1) + '" x2="' + r1(e.x2) + '" y2="' + r1(e.y2) + '" stroke="' + lc + '" stroke-width="4" stroke-dasharray="14 10" stroke-linecap="round"/>';
        if (it.arrow && L > 20) {
          // 끝(별에 붙어 있으면 별 바로 앞)에 화살촉
          var ux = (e.x2 - e.x1) / L, uy = (e.y2 - e.y1) / L, back = it.b && byId[it.b] ? STAR_R[sizeOf(byId[it.b])] + 7 : 0;
          var tx = e.x2 - ux * back, ty = e.y2 - uy * back, bx = tx - ux * 24, by = ty - uy * 24;
          h += '<path d="M' + r1(tx) + ' ' + r1(ty) + 'L' + r1(bx - uy * 11) + ' ' + r1(by + ux * 11) + 'L' + r1(bx + uy * 11) + ' ' + r1(by - ux * 11) + 'Z" fill="' + lc + '"/>';
        }
        if (n > 1 && L > 0) {
          var nx = -(e.y2 - e.y1) / L * 10, ny = (e.x2 - e.x1) / L * 10;
          for (var k = 1; k < n; k++) {
            var px = e.x1 + (e.x2 - e.x1) * k / n, py = e.y1 + (e.y2 - e.y1) * k / n;
            h += '<line x1="' + r1(px - nx) + '" y1="' + r1(py - ny) + '" x2="' + r1(px + nx) + '" y2="' + r1(py + ny) + '" stroke="' + lc + '" stroke-width="3.5" stroke-linecap="round"/>';
          }
        }
      } else if (it.t === 'star') {
        var sr = STAR_R[sizeOf(it)];
        h += '<circle cx="' + r1(it.x) + '" cy="' + r1(it.y) + '" r="' + r1(sr * 2.6) + '" fill="url(#' + g + ')"/>' +
          '<circle cx="' + r1(it.x) + '" cy="' + r1(it.y) + '" r="' + sr + '" fill="' + C.star + '"/>';
      } else if (it.t === 'text') {
        var fs = TEXT_PX[sizeOf(it)];
        h += '<text x="' + r1(it.x) + '" y="' + r1(it.y) + '" font-size="' + fs + '" font-weight="600" font-family="' + FONT + '" fill="' + C.text + '" stroke="' + C.bg + '" stroke-width="' + r1(fs * 0.2) + '" stroke-linejoin="round" paint-order="stroke">' + esc(it.v) + '</text>';
      }
    });
    return h;
  }

  CN.chartNorm = norm;
  CN.chartCount = function (chart) { return chart ? norm(chart).items.length : 0; };
  CN.chartSvg = function (chart, label) {
    return '<svg class="starchart" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(label || '찾아가는 길 그림') + '">' + body(chart) + '</svg>';
  };

  // 저장용: 필요한 값만, 소수 한 자리
  var KEYS = { star: ['x', 'y', 's'], line: ['x1', 'y1', 'x2', 'y2', 'a', 'b', 'div', 'arrow', 'solid', 'col'], circle: ['x', 'y', 'r', 'col'], text: ['x', 'y', 'v', 's'] };
  function clean(c) {
    var byId = starMap(c.items);
    return {
      v: 1, bg: !!c.bg, seed: c.seed, bgFile: c.bgFile || null,
      items: c.items.map(function (it) {
        var src = it.t === 'line' ? Object.assign({}, it, ends(it, byId)) : it, o = { id: it.id, t: it.t };
        KEYS[it.t].forEach(function (k) {
          var v = src[k];
          if (v === undefined || v === null || v === '' || v === false) return;
          o[k] = typeof v === 'number' ? r1(v) : v;
        });
        return o;
      }),
    };
  }

  // ===== 편집기 =====
  var TOOLS = [['select', '↖ 선택'], ['star', '★ 별'], ['line', '╌ 점선'], ['circle', '◯ 원'], ['text', '가 글자']];
  var HINT = {
    select: '눌러서 고르기 · 끌어서 옮기기 · 빈 곳을 끌면 여러 개 고르기(Shift+클릭으로 추가) · <b>오른쪽 클릭</b>: 복사·잘라내기 / 빈 곳은 붙여넣기 · Delete 지우기 · 화살표 키로 조금씩 옮기기 · Ctrl+C·V 복사·붙여넣기 · Ctrl+Z 되돌리기',
    star: '누른 자리에 별이 생겨요 · 별 근처를 <b>오른쪽 클릭</b>하면 지워져요 · 크기는 위 슬라이더(작게·보통·크게)',
    line: '끌어서 점선을 그어요(또는 시작점·끝점을 차례로 클릭) · 끝을 별 가까이 가져가면 별에 <b>붙어요</b> · 선 색은 위 <b>붉은색·흰색</b>에서(고른 선도 바뀜) · 점선을 <b>오른쪽 클릭 → 분할</b>',
    circle: '끌어서 원을 그려요(누르기만 하면 기본 크기) · 원 <b>테두리를 끌면</b> 크기 조정 · 색은 위 <b>붉은색·흰색</b> · 옮기기는 「선택」에서',
    text: '누른 자리에 글자를 넣어요 · 이미 있는 글자를 누르면 고치기 · <b>글자 크기</b>는 위 슬라이더(작게·보통·크게) — 고른 글자도 바뀌어요, 글자 오른쪽 클릭으로도 바꿀 수 있어요',
  };

  var clipMem = null;
  function getClip() {
    try { var s = localStorage.getItem(CLIP_KEY); if (s) return JSON.parse(s); } catch (e) {}
    return clipMem;
  }

  // opts: { title, draftKey, onSave(chart) → Promise }  저장하면 true, 그냥 닫으면 false로 끝나는 Promise
  CN.openChartEditor = function (initial, opts) {
    opts = opts || {};
    var saved = norm(initial ? clone(initial) : null);
    if (!initial) saved.seed = 1 + Math.floor(Math.random() * 99999);
    var c = clone(saved), restored = false;
    if (opts.draftKey) {
      try {
        var d = localStorage.getItem(opts.draftKey);
        if (d) { var dc = norm(JSON.parse(d)); if (JSON.stringify(dc) !== JSON.stringify(saved)) { c = dc; restored = true; } }
      } catch (e) {}
    }
    var tool = 'select', size = 2, lineCol = 'r', sel = {}, undo = [], redo = [], dirty = restored;
    var g = null, pending = null, hover = null, lastP = null, pasteN = 0, lastDown = { t: 0, id: null };
    var menuEl = null, popEl = null, done, finished = false, uidN = 0;
    var result = new Promise(function (res) { done = res; });
    function nid() { return 'e' + Date.now().toString(36).slice(-5) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 4); }

    var m = CN.modal(
      '<div class="modal-head"><div class="t">' + esc(opts.title || '찾아가는 길 그림') + '</div><button class="icon-btn" data-close>닫기</button></div>' +
      '<div class="sc-ed">' +
      '<div class="sc-tools" data-tools>' + TOOLS.map(function (t) { return '<button type="button" class="chip" data-tool="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="sc-tools"><label class="sc-size"><span data-sizet>크기</span> <input type="range" min="1" max="3" step="1" value="2" data-size><span data-sizel>보통</span></label>' +
      '<span class="sc-col" title="점선·원 색">색 <button type="button" class="chip" data-col="r"><i class="sw r"></i>붉은색</button><button type="button" class="chip" data-col="w"><i class="sw w"></i>흰색</button></span>' +
      '<button type="button" class="chip" data-bg>배경 잔별</button>' +
      '<button type="button" class="btn small ghost" data-undo>↶ 되돌리기</button><button type="button" class="btn small ghost" data-redo>↷ 다시</button>' +
      '<button type="button" class="btn small ghost" data-clear>모두 지우기</button></div>' +
      '<div class="sc-tools">' +
      (opts.library ? '<button type="button" class="btn small ghost" data-lib>📥 다른 그림 불러오기</button>' : '') +
      (opts.uploadFolder ? '<button type="button" class="btn small ghost" data-bgphoto>🖼 배경 사진</button><input type="file" accept="image/*" hidden data-bgfile>' : '') +
      '<span class="sc-st" data-st></span></div>' +
      '<svg class="starchart sc-canvas" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg"></svg>' +
      '<div class="sc-hint" data-hint></div><div class="msg err" data-err></div>' +
      '<div class="ed-actions"><button type="button" class="btn primary small" data-save>저장</button><button type="button" class="btn ghost small" data-cancel>취소</button></div>' +
      '</div>', {
        wide: true,
        beforeClose: function () {
          closeMenus(); closePop();
          if (finished || !dirty) return true;
          return confirm('저장하지 않은 그림이 있어요. 닫을까요? (이 기기에 임시저장돼 있어서 다시 열면 불러와요)');
        },
        onClose: function () {
          closeMenus(); closePop();
          document.removeEventListener('keydown', onKey, true);
          document.removeEventListener('pointerdown', onDocDown, true);
          done(finished);
        },
      });
    var el = m.el, svg = el.querySelector('svg.sc-canvas');
    var undoBtn = el.querySelector('[data-undo]'), redoBtn = el.querySelector('[data-redo]'), bgBtn = el.querySelector('[data-bg]');
    var sizeIn = el.querySelector('[data-size]'), sizeL = el.querySelector('[data-sizel]'), hintEl = el.querySelector('[data-hint]');

    // ----- 좌표·찾기 -----
    function pt(e) {
      var r = svg.getBoundingClientRect();
      return { x: clamp((e.clientX - r.left) / r.width * W, 0, W), y: clamp((e.clientY - r.top) / r.height * H, 0, H) };
    }
    function client(p) { var r = svg.getBoundingClientRect(); return { x: r.left + p.x / W * r.width, y: r.top + p.y / H * r.height }; }
    function nearestStar(p, exceptId, radius) {
      var best = null, bd = radius || SNAP;
      c.items.forEach(function (it) {
        if (it.t !== 'star' || it.id === exceptId) return;
        var d = dist(p.x, p.y, it.x, it.y);
        if (d <= bd) { bd = d; best = it; }
      });
      return best;
    }
    function hit(p) {
      var byId = starMap(c.items), order = ['text', 'star', 'line', 'circle'];
      for (var L = 0; L < order.length; L++) {
        for (var i = c.items.length - 1; i >= 0; i--) {
          var it = c.items[i];
          if (it.t !== order[L]) continue;
          if (it.t === 'text') { var b = textBox(it); if (p.x >= b.x - 6 && p.x <= b.x + b.w + 6 && p.y >= b.y - 6 && p.y <= b.y + b.h + 6) return it; }
          else if (it.t === 'star') { if (dist(p.x, p.y, it.x, it.y) <= Math.max(STAR_R[sizeOf(it)] + 7, 15)) return it; }
          else if (it.t === 'line') { if (segDist(p, ends(it, byId)) <= 12) return it; }
          else if (it.t === 'circle') { if (Math.abs(dist(p.x, p.y, it.x, it.y) - it.r) <= 12) return it; }
        }
      }
      return null;
    }
    function hitHandle(p) {
      var byId = starMap(c.items);
      for (var i = c.items.length - 1; i >= 0; i--) {
        var it = c.items[i];
        if (!sel[it.id]) continue;
        if (it.t === 'line') {
          var e = ends(it, byId);
          if (dist(p.x, p.y, e.x1, e.y1) <= 16) return { it: it, which: 1 };
          if (dist(p.x, p.y, e.x2, e.y2) <= 16) return { it: it, which: 2 };
        } else if (it.t === 'circle' && dist(p.x, p.y, it.x + it.r, it.y) <= 16) return { it: it, which: 'r' };
      }
      return null;
    }
    function anchor(it, byId) {
      if (it.t === 'line') { var e = ends(it, byId); return [[e.x1, e.y1], [e.x2, e.y2]]; }
      if (it.t === 'text') { var b = textBox(it); return [[b.x + b.w / 2, b.y + b.h / 2]]; }
      return [[it.x, it.y]];
    }
    function bbox(items) {
      var byId = starMap(items), x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      items.forEach(function (it) {
        var pts = it.t === 'circle' ? [[it.x - it.r, it.y - it.r], [it.x + it.r, it.y + it.r]]
          : it.t === 'text' ? (function (b) { return [[b.x, b.y], [b.x + b.w, b.y + b.h]]; })(textBox(it)) : anchor(it, byId);
        pts.forEach(function (q) { x1 = Math.min(x1, q[0]); y1 = Math.min(y1, q[1]); x2 = Math.max(x2, q[0]); y2 = Math.max(y2, q[1]); });
      });
      return { x1: x1, y1: y1, x2: x2, y2: y2 };
    }

    // ----- 그리기 -----
    function overlay() {
      var h = '', byId = starMap(c.items);
      var handle = function (x, y) { return '<rect x="' + r1(x - 8) + '" y="' + r1(y - 8) + '" width="16" height="16" rx="3" fill="' + C.bg + '" stroke="' + C.ui + '" stroke-width="2.5"/>'; };
      c.items.forEach(function (it) {
        if (!sel[it.id]) return;
        if (it.t === 'star') h += '<circle cx="' + r1(it.x) + '" cy="' + r1(it.y) + '" r="' + (STAR_R[sizeOf(it)] + 9) + '" fill="none" stroke="' + C.ui + '" stroke-width="2" stroke-dasharray="5 4"/>';
        else if (it.t === 'circle') h += '<circle cx="' + r1(it.x) + '" cy="' + r1(it.y) + '" r="' + r1(it.r + 9) + '" fill="none" stroke="' + C.ui + '" stroke-width="2" stroke-dasharray="5 4"/>' + handle(it.x + it.r, it.y);
        else if (it.t === 'text') { var b = textBox(it); h += '<rect x="' + r1(b.x - 6) + '" y="' + r1(b.y - 5) + '" width="' + r1(b.w + 12) + '" height="' + r1(b.h + 10) + '" fill="none" stroke="' + C.ui + '" stroke-width="2" stroke-dasharray="5 4"/>'; }
        else if (it.t === 'line') {
          var e = ends(it, byId);
          h += '<line x1="' + r1(e.x1) + '" y1="' + r1(e.y1) + '" x2="' + r1(e.x2) + '" y2="' + r1(e.y2) + '" stroke="' + C.ui + '" stroke-opacity=".22" stroke-width="14" stroke-linecap="round"/>' + handle(e.x1, e.y1) + handle(e.x2, e.y2);
        }
      });
      if (g && g.type === 'band' && g.p) {
        h += '<rect x="' + r1(Math.min(g.p0.x, g.p.x)) + '" y="' + r1(Math.min(g.p0.y, g.p.y)) + '" width="' + r1(Math.abs(g.p.x - g.p0.x)) + '" height="' + r1(Math.abs(g.p.y - g.p0.y)) + '" fill="rgba(255,210,204,.07)" stroke="' + C.ui + '" stroke-width="2" stroke-dasharray="6 5"/>';
      }
      var pl = pending || (g && g.type === 'line' ? g : null);
      if (pl && pl.cur) h += '<line x1="' + r1(pl.x1) + '" y1="' + r1(pl.y1) + '" x2="' + r1(pl.cur.x) + '" y2="' + r1(pl.cur.y) + '" stroke="' + (lineCol === 'w' ? C.white : C.line) + '" stroke-opacity=".75" stroke-width="4" stroke-dasharray="14 10" stroke-linecap="round"/>';
      if (g && g.type === 'circle' && g.r > 3) h += '<circle cx="' + r1(g.x) + '" cy="' + r1(g.y) + '" r="' + r1(g.r) + '" fill="none" stroke="' + (lineCol === 'w' ? C.white : C.red) + '" stroke-opacity=".75" stroke-width="4"/>';
      if (hover) h += '<circle cx="' + r1(hover.x) + '" cy="' + r1(hover.y) + '" r="' + (STAR_R[sizeOf(hover)] + 12) + '" fill="none" stroke="' + C.ui + '" stroke-width="3" opacity=".9"/>';
      return h;
    }
    // 슬라이더: 별 도구면 「별 크기」, 글자 도구면 「글자 크기」, 별·글자 하나를 고르면 그 크기를 보여 줌
    function syncSize() {
      var one = c.items.filter(function (it) { return sel[it.id]; });
      var pick = one.length === 1 && (one[0].t === 'star' || one[0].t === 'text') ? one[0] : null;
      if (pick) size = sizeOf(pick);
      var kind = pick ? pick.t : tool;
      el.querySelector('[data-sizet]').textContent = kind === 'text' ? '글자 크기' : kind === 'star' ? '별 크기' : '크기';
      sizeIn.value = size; sizeL.textContent = SIZE_LABEL[size];
    }
    function render() {
      syncSize();
      svg.innerHTML = body(c, 'scEd') + overlay();
      svg.setAttribute('class', 'starchart sc-canvas t-' + tool);
      undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length;
      bgBtn.classList.toggle('on', !!c.bg); bgBtn.setAttribute('aria-pressed', !!c.bg);
    }
    function renderHint() {
      hintEl.innerHTML = (restored ? '<div class="sc-restored">저장하지 않은 그림을 불러왔어요. <button type="button" class="btn small ghost" data-revert>저장된 그림으로 되돌리기</button></div>' : '') + HINT[tool];
      var rv = hintEl.querySelector('[data-revert]');
      if (rv) rv.onclick = function () {
        snapshot(); c = clone(saved); sel = {}; restored = false; dirty = false;
        if (opts.draftKey) try { localStorage.removeItem(opts.draftKey); } catch (e) {}
        render(); renderHint();
      };
    }
    function setTool(t) {
      tool = t; pending = null; hover = null; g = null;
      el.querySelectorAll('[data-tool]').forEach(function (b) { var on = b.dataset.tool === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      renderHint(); render();
    }

    // ----- 바꾸기 (되돌리기 기록 + 임시저장) -----
    function state() { return JSON.stringify({ items: c.items, bg: c.bg, bgFile: c.bgFile || null }); }
    function snapshot() { undo.push(state()); if (undo.length > 150) undo.shift(); redo = []; }
    function changed() {
      dirty = true;
      if (opts.draftKey) try { localStorage.setItem(opts.draftKey, JSON.stringify(c)); } catch (e) {}
      render();
    }
    function restore(s) { var x = JSON.parse(s); c.items = x.items; c.bg = x.bg; c.bgFile = x.bgFile || null; var ids = {}; c.items.forEach(function (it) { ids[it.id] = 1; }); Object.keys(sel).forEach(function (k) { if (!ids[k]) delete sel[k]; }); changed(); }
    function doUndo() { if (!undo.length) return; redo.push(state()); restore(undo.pop()); }
    function doRedo() { if (!redo.length) return; undo.push(state()); restore(redo.pop()); }
    function selCount() { return Object.keys(sel).length; }
    function selectAll() { sel = {}; c.items.forEach(function (it) { sel[it.id] = true; }); render(); }
    // 지울 때: 지우는 별에 붙어 있던 선 끝은 그 자리에 남김
    function removeIds(ids) {
      var byId = starMap(c.items);
      c.items.forEach(function (it) {
        if (it.t !== 'line' || ids[it.id]) return;
        var e = ends(it, byId);
        if (it.a && ids[it.a]) { it.x1 = e.x1; it.y1 = e.y1; delete it.a; }
        if (it.b && ids[it.b]) { it.x2 = e.x2; it.y2 = e.y2; delete it.b; }
      });
      c.items = c.items.filter(function (it) { return !ids[it.id]; });
      Object.keys(ids).forEach(function (k) { delete sel[k]; });
    }
    function deleteSel() { if (!selCount()) return; snapshot(); removeIds(Object.assign({}, sel)); changed(); }
    function copySel(cut) {
      var ids = Object.assign({}, sel), byId = starMap(c.items);
      var items = c.items.filter(function (it) { return ids[it.id]; }).map(function (it) {
        var x = clone(it);
        if (x.t === 'line') {
          var e = ends(it, byId);
          x.x1 = e.x1; x.y1 = e.y1; x.x2 = e.x2; x.y2 = e.y2;
          if (x.a && !ids[x.a]) delete x.a;
          if (x.b && !ids[x.b]) delete x.b;
        }
        return x;
      });
      if (!items.length) return;
      clipMem = items;
      try { localStorage.setItem(CLIP_KEY, JSON.stringify(items)); } catch (e) {}
      pasteN = 0;
      if (cut) { snapshot(); removeIds(ids); changed(); }
      CN.toast((cut ? '잘라냈어요' : '복사했어요') + ' (' + items.length + '개)', 1200);
    }
    // at: 붙여넣을 가운데 자리(없으면 원래 자리에서 조금씩 비켜서)
    function paste(at) {
      var items = getClip();
      if (!items || !items.length) return;
      var bb = bbox(items), dx, dy;
      if (at) { dx = at.x - (bb.x1 + bb.x2) / 2; dy = at.y - (bb.y1 + bb.y2) / 2; }
      else { pasteN++; dx = dy = 24 * pasteN; }
      snapshot();
      var map = {};
      items.forEach(function (it) { map[it.id] = nid(); });
      sel = {};
      items.forEach(function (src) {
        var it = clone(src);
        it.id = map[src.id];
        if (it.t === 'line') {
          it.x1 = clamp(it.x1 + dx, 0, W); it.y1 = clamp(it.y1 + dy, 0, H); it.x2 = clamp(it.x2 + dx, 0, W); it.y2 = clamp(it.y2 + dy, 0, H);
          if (it.a) { if (map[it.a]) it.a = map[it.a]; else delete it.a; }
          if (it.b) { if (map[it.b]) it.b = map[it.b]; else delete it.b; }
        } else { it.x = clamp(it.x + dx, 0, W); it.y = clamp(it.y + dy, 0, H); }
        c.items.push(it);
        sel[it.id] = true;
      });
      changed();
    }
    function finishLine(from, q) {
      pending = null; hover = null;
      if (dist(from.x1, from.y1, q.x, q.y) < 8 || (from.a && q.id === from.a)) { render(); return; }
      snapshot();
      var it = { id: nid(), t: 'line', x1: from.x1, y1: from.y1, x2: q.x, y2: q.y };
      if (from.a) it.a = from.a;
      if (lineCol === 'w') it.col = 'w';
      if (q.id) it.b = q.id;
      c.items.push(it);
      changed();
    }

    // ----- 작은 메뉴·입력창 -----
    function place(box, x, y) {
      box.style.left = Math.max(8, Math.min(x, innerWidth - box.offsetWidth - 8)) + 'px';
      box.style.top = Math.max(8, Math.min(y, innerHeight - box.offsetHeight - 8)) + 'px';
    }
    function closeMenus() { if (menuEl) { menuEl.remove(); menuEl = null; } }
    function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
    function showMenu(x, y, entries) {
      closeMenus(); closePop();
      menuEl = document.createElement('div');
      menuEl.className = 'sc-menu';
      menuEl.setAttribute('role', 'menu');
      menuEl.innerHTML = entries.map(function (e, i) { return '<button type="button" role="menuitem" data-i="' + i + '"' + (e[2] ? ' disabled' : '') + '>' + esc(e[0]) + '</button>'; }).join('');
      document.body.appendChild(menuEl);
      place(menuEl, x, y);
      menuEl.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
      menuEl.querySelectorAll('button').forEach(function (b) { b.onclick = function () { var e = entries[b.dataset.i]; closeMenus(); e[1](); }; });
    }
    function popup(x, y, html, onOk) {
      closeMenus(); closePop();
      popEl = document.createElement('div');
      popEl.className = 'sc-pop';
      popEl.innerHTML = html + '<button type="button" class="btn small primary" data-ok>확인</button><button type="button" class="btn small ghost" data-no>취소</button>';
      document.body.appendChild(popEl);
      place(popEl, x, y);
      var inp = popEl.querySelector('input');
      var ok = function () { var v = inp.value; closePop(); onOk(v); };
      popEl.querySelector('[data-ok]').onclick = ok;
      popEl.querySelector('[data-no]').onclick = closePop;
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.isComposing && ev.keyCode !== 229) { ev.preventDefault(); ok(); } });
      setTimeout(function () { inp.focus(); inp.select(); }, 0);
    }
    function splitLine(x, y, it) {
      popup(x, y, '<label class="sc-pop-l">몇 분할? <input type="number" min="1" max="30" step="1" inputmode="numeric" value="' + (it.div || 2) + '"></label><span class="sc-pop-s">1 = 분할 없음</span>', function (v) {
        var n = Math.round(Number(v));
        if (!isFinite(n) || n < 1) return;
        snapshot();
        if (n <= 1) delete it.div; else it.div = Math.min(n, 30);
        changed();
      });
    }
    function textAt(p, it) {
      var fs = TEXT_PX[it ? sizeOf(it) : size], cp = client(it ? { x: it.x, y: it.y - fs * 0.8 } : p);
      popup(cp.x, cp.y, '<input type="text" maxlength="40" placeholder="글자 입력" value="' + esc(it ? it.v : '') + '">', function (v) {
        v = v.trim();
        if (it) {
          if (v === it.v) return;
          snapshot();
          if (!v) { var ids = {}; ids[it.id] = 1; removeIds(ids); } else it.v = v;
          changed(); return;
        }
        if (!v) return;
        snapshot();
        c.items.push({ id: nid(), t: 'text', x: clamp(p.x, 0, W - 20), y: clamp(p.y + TEXT_PX[size] * 0.35, TEXT_PX[size], H), v: v, s: size });
        changed();
      });
    }

    // ----- 마우스·터치 -----
    svg.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      closeMenus(); closePop();
      try { svg.setPointerCapture(e.pointerId); } catch (x) {}
      var p = pt(e), add = e.shiftKey || e.ctrlKey || e.metaKey, it;
      lastP = p;
      if (tool === 'select') {
        var hh = hitHandle(p);
        if (hh) { g = { type: 'handle', it: hh.it, which: hh.which, moved: false }; return; }
        it = hit(p);
        if (it) {
          var now = Date.now();
          if (it.t === 'text' && lastDown.id === it.id && now - lastDown.t < 400) { lastDown = { t: 0, id: null }; textAt(p, it); return; }
          lastDown = { t: now, id: it.id };
          if (add) { if (sel[it.id]) delete sel[it.id]; else sel[it.id] = true; render(); return; }
          if (!sel[it.id]) { sel = {}; sel[it.id] = true; }
          g = { type: 'move', p0: p, moved: false };
          render(); return;
        }
        if (!add) sel = {};
        g = { type: 'band', p0: p, p: null, add: add };
        render(); return;
      }
      if (tool === 'star') { g = { type: 'star', p0: p }; return; }
      if (tool === 'line') {
        var s = nearestStar(p), q = s ? { x: s.x, y: s.y, id: s.id } : p;
        if (pending) { finishLine(pending, q); return; }
        g = { type: 'line', x1: q.x, y1: q.y, a: q.id || null, cur: q, p0: p };
        render(); return;
      }
      if (tool === 'circle') {
        it = hit(p);
        if (it && it.t === 'circle') { g = { type: 'resize', it: it, moved: false }; return; }
        g = { type: 'circle', x: p.x, y: p.y, r: 0 }; return;
      }
      if (tool === 'text') {
        it = hit(p);
        if (it && it.t === 'text') { textAt(p, it); return; }
        g = { type: 'text', p0: p };
      }
    });

    svg.addEventListener('pointermove', function (e) {
      var p = pt(e), s;
      lastP = p;
      if (!g) {
        if (tool === 'line') { hover = nearestStar(p); if (pending) pending.cur = hover ? { x: hover.x, y: hover.y } : p; render(); }
        return;
      }
      if (g.type === 'move') {
        var dx = p.x - g.p0.x, dy = p.y - g.p0.y;
        if (!g.moved) {
          if (Math.hypot(dx, dy) < 3) return;
          snapshot();
          // 옮기는 선의 끝이 안 옮기는 별에 붙어 있으면 떼어 냄
          var byId = starMap(c.items);
          g.orig = {};
          c.items.forEach(function (it) {
            if (!sel[it.id]) return;
            if (it.t === 'line') {
              var en = ends(it, byId);
              it.x1 = en.x1; it.y1 = en.y1; it.x2 = en.x2; it.y2 = en.y2;
              if (it.a && !sel[it.a]) delete it.a;
              if (it.b && !sel[it.b]) delete it.b;
              g.orig[it.id] = { x1: it.x1, y1: it.y1, x2: it.x2, y2: it.y2 };
            } else g.orig[it.id] = { x: it.x, y: it.y };
          });
          g.moved = true;
        }
        c.items.forEach(function (it) {
          var o = g.orig[it.id];
          if (!o) return;
          if (it.t === 'line') { it.x1 = clamp(o.x1 + dx, 0, W); it.y1 = clamp(o.y1 + dy, 0, H); it.x2 = clamp(o.x2 + dx, 0, W); it.y2 = clamp(o.y2 + dy, 0, H); }
          else { it.x = clamp(o.x + dx, 0, W); it.y = clamp(o.y + dy, 0, H); }
        });
        render(); return;
      }
      if (g.type === 'handle') {
        if (!g.moved) { snapshot(); g.moved = true; }
        var it = g.it;
        if (g.which === 'r') { it.r = Math.max(6, dist(p.x, p.y, it.x, it.y)); render(); return; }
        s = nearestStar(p, g.which === 1 ? it.b : it.a);
        var q = s || p;
        if (g.which === 1) { it.x1 = q.x; it.y1 = q.y; if (s) it.a = s.id; else delete it.a; }
        else { it.x2 = q.x; it.y2 = q.y; if (s) it.b = s.id; else delete it.b; }
        hover = s;
        render(); return;
      }
      if (g.type === 'resize') { if (!g.moved) { snapshot(); g.moved = true; } g.it.r = Math.max(6, dist(p.x, p.y, g.it.x, g.it.y)); render(); return; }
      if (g.type === 'band') { g.p = p; render(); return; }
      if (g.type === 'line') { s = nearestStar(p, g.a); hover = s; g.cur = s ? { x: s.x, y: s.y } : p; render(); return; }
      if (g.type === 'circle') { g.r = dist(p.x, p.y, g.x, g.y); render(); }
    });

    svg.addEventListener('pointerup', function (e) {
      if (!g) return;
      var p = pt(e), gg = g;
      g = null;
      if (gg.type === 'move' || gg.type === 'handle' || gg.type === 'resize') { hover = null; if (gg.moved) changed(); else render(); return; }
      if (gg.type === 'band') {
        if (gg.p) {
          var x1 = Math.min(gg.p0.x, gg.p.x), x2 = Math.max(gg.p0.x, gg.p.x), y1 = Math.min(gg.p0.y, gg.p.y), y2 = Math.max(gg.p0.y, gg.p.y), byId = starMap(c.items);
          c.items.forEach(function (it) {
            if (anchor(it, byId).every(function (q) { return q[0] >= x1 && q[0] <= x2 && q[1] >= y1 && q[1] <= y2; })) sel[it.id] = true;
          });
        }
        render(); return;
      }
      if (gg.type === 'star') {
        if (dist(p.x, p.y, gg.p0.x, gg.p0.y) > 14) return;
        snapshot();
        c.items.push({ id: nid(), t: 'star', x: gg.p0.x, y: gg.p0.y, s: size });
        changed(); return;
      }
      if (gg.type === 'line') {
        var s = nearestStar(p, gg.a), q = s ? { x: s.x, y: s.y, id: s.id } : p;
        // 거의 안 끌었으면: 끝점을 한 번 더 클릭하는 방식
        if (dist(gg.p0.x, gg.p0.y, p.x, p.y) < 10) { pending = { x1: gg.x1, y1: gg.y1, a: gg.a, cur: q }; render(); return; }
        finishLine(gg, q); return;
      }
      if (gg.type === 'circle') {
        snapshot();
        var ci = { id: nid(), t: 'circle', x: gg.x, y: gg.y, r: gg.r < 10 ? 45 : gg.r };
        if (lineCol === 'w') ci.col = 'w';
        c.items.push(ci);
        changed(); return;
      }
      if (gg.type === 'text') textAt(gg.p0, null);
    });
    svg.addEventListener('pointercancel', function () { g = null; hover = null; render(); });

    svg.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      g = null; pending = null; hover = null;
      var p = pt(e);
      lastP = p;
      if (tool === 'star') {
        var s = nearestStar(p, null, 24);
        if (s) { snapshot(); var ids = {}; ids[s.id] = 1; removeIds(ids); changed(); return; }
      }
      var it = hit(p);
      if (it) {
        if (!sel[it.id]) { sel = {}; sel[it.id] = true; }
        render();
        var list = [];
        if (it.t === 'line') {
          list.push(['분할…' + (it.div > 1 ? ' (지금 ' + it.div + '분할)' : ''), function () { splitLine(e.clientX, e.clientY, it); }]);
          list.push([it.arrow ? '화살표 빼기' : '끝에 화살표 넣기', function () { snapshot(); if (it.arrow) delete it.arrow; else it.arrow = true; changed(); }]);
          list.push([it.col === 'w' ? '붉은색으로 바꾸기' : '흰색으로 바꾸기', function () { snapshot(); if (it.col === 'w') delete it.col; else it.col = 'w'; changed(); }]);
          list.push([it.solid ? '점선으로 바꾸기' : '실선으로 바꾸기 (별자리 선)', function () { snapshot(); if (it.solid) delete it.solid; else it.solid = true; changed(); }]);
          list.push(['방향 뒤집기', function () {
            snapshot();
            var e2 = ends(it, starMap(c.items)), a = it.a, b = it.b;
            it.x1 = e2.x2; it.y1 = e2.y2; it.x2 = e2.x1; it.y2 = e2.y1;
            if (b) it.a = b; else delete it.a;
            if (a) it.b = a; else delete it.b;
            changed();
          }]);
        }
        if (it.t === 'circle') list.push([it.col === 'w' ? '붉은색으로 바꾸기' : '흰색으로 바꾸기', function () { snapshot(); if (it.col === 'w') delete it.col; else it.col = 'w'; changed(); }]);
        if (it.t === 'text') {
          list.push(['글자 고치기', function () { textAt(p, it); }]);
          [1, 2, 3].forEach(function (n) {
            if (n !== sizeOf(it)) list.push(['글자 크기: ' + SIZE_LABEL[n], function () { snapshot(); it.s = n; size = n; syncSize(); changed(); }]);
          });
        }
        list.push(['복사', function () { copySel(false); }], ['잘라내기', function () { copySel(true); }], ['삭제', deleteSel]);
        showMenu(e.clientX, e.clientY, list);
        return;
      }
      render();
      var cl = getClip();
      showMenu(e.clientX, e.clientY, [
        ['붙여넣기' + (cl && cl.length ? ' (' + cl.length + '개)' : ''), function () { paste(p); }, !(cl && cl.length)],
        ['모두 선택', selectAll, !c.items.length],
      ]);
    });

    function onDocDown(e) {
      if (menuEl && !menuEl.contains(e.target)) closeMenus();
      if (popEl && !popEl.contains(e.target)) closePop();
    }
    function onKey(e) {
      if (!document.body.contains(svg)) return;
      var backs = document.querySelectorAll('.modal-back');
      if (backs[backs.length - 1] !== m.back) return; // 위에 다른 창(불러오기 등)이 떠 있으면 그 창 차례
      if (e.key === 'Escape') {
        if (popEl || menuEl) { closePop(); closeMenus(); }
        else if (pending || g) { pending = null; g = null; hover = null; render(); }
        else if (selCount()) { sel = {}; render(); }
        else return; // 편집기 닫기(모달이 처리)
        e.preventDefault(); e.stopImmediatePropagation();
        return;
      }
      var t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range'))) return;
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
      else if (mod && e.code === 'KeyY') { e.preventDefault(); doRedo(); }
      else if (mod && e.code === 'KeyC' && selCount()) { e.preventDefault(); copySel(false); }
      else if (mod && e.code === 'KeyX' && selCount()) { e.preventDefault(); copySel(true); }
      else if (mod && e.code === 'KeyV') { e.preventDefault(); paste(null); }
      else if (mod && e.code === 'KeyA') { e.preventDefault(); selectAll(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selCount()) { e.preventDefault(); deleteSel(); }
      else if (/^Arrow/.test(e.key) && selCount() && (!t || t.type !== 'range')) {
        // 화살표 키로 조금씩 옮기기 (Shift: 크게)
        e.preventDefault();
        var step = e.shiftKey ? 10 : 2, dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        if (!e.repeat) snapshot();
        var byId = starMap(c.items);
        c.items.forEach(function (it) {
          if (!sel[it.id]) return;
          if (it.t === 'line') {
            var en = ends(it, byId);
            if (!(it.a && sel[it.a])) { it.x1 = clamp(en.x1 + dx, 0, W); it.y1 = clamp(en.y1 + dy, 0, H); delete it.a; }
            if (!(it.b && sel[it.b])) { it.x2 = clamp(en.x2 + dx, 0, W); it.y2 = clamp(en.y2 + dy, 0, H); delete it.b; }
          } else { it.x = clamp(it.x + dx, 0, W); it.y = clamp(it.y + dy, 0, H); }
        });
        changed();
      }
    }
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDocDown, true);

    // ----- 도구 막대 -----
    el.querySelectorAll('[data-tool]').forEach(function (b) { b.onclick = function () { setTool(b.dataset.tool); }; });
    sizeIn.addEventListener('input', function () { size = Number(sizeIn.value); sizeL.textContent = SIZE_LABEL[size]; });
    var colBtns = el.querySelectorAll('[data-col]');
    var showCol = function () { colBtns.forEach(function (b) { var on = b.dataset.col === lineCol; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); };
    colBtns.forEach(function (b) {
      b.onclick = function () {
        lineCol = b.dataset.col; showCol();
        // 고른 선이 있으면 그 선들도 이 색으로
        var targets = c.items.filter(function (it) { return sel[it.id] && (it.t === 'line' || it.t === 'circle') && (it.col === 'w' ? 'w' : 'r') !== lineCol; });
        if (!targets.length) { render(); return; }
        snapshot();
        targets.forEach(function (it) { if (lineCol === 'w') it.col = 'w'; else delete it.col; });
        changed();
      };
    });
    showCol();
    sizeIn.addEventListener('change', function () {
      size = Number(sizeIn.value); sizeL.textContent = SIZE_LABEL[size];
      var targets = c.items.filter(function (it) { return sel[it.id] && (it.t === 'star' || it.t === 'text') && sizeOf(it) !== size; });
      if (!targets.length) return;
      snapshot();
      targets.forEach(function (it) { it.s = size; });
      changed();
    });
    bgBtn.onclick = function () { snapshot(); c.bg = !c.bg; changed(); };
    undoBtn.onclick = doUndo;
    redoBtn.onclick = doRedo;
    el.querySelector('[data-clear]').onclick = function () {
      if (!c.items.length || !confirm('그림을 모두 지울까요? (↶ 되돌리기로 되살릴 수 있어요)')) return;
      snapshot(); c.items = []; sel = {}; changed();
    };
    el.querySelector('[data-cancel]').onclick = function () { m.close(); };

    // 다른 그림 불러오기 — 고른 그림의 요소를 같은 자리에 덧붙임(골라진 상태라 바로 옮기거나 지울 수 있음)
    var libBtn = el.querySelector('[data-lib]');
    if (libBtn) libBtn.onclick = function () {
      closeMenus(); closePop();
      var lib = (opts.library() || []).filter(function (x) { return CN.chartCount(x.chart); });
      var pm = CN.modal('<div class="modal-head"><div class="t">다른 그림 불러오기</div><button class="icon-btn" data-close>닫기</button></div>' +
        '<p class="hint" style="margin-top:0">고른 그림의 별·선·원·글자를 지금 그림에 <b>덧붙여요</b>. 필요 없는 건 지우고, 옮겨서 쓰면 돼요. (배경 사진은 가져오지 않아요)</p>' +
        '<input type="search" data-q placeholder="천체 이름으로 찾기" autocomplete="off" style="width:100%">' +
        '<div class="sc-lib" data-list></div>', { wide: true });
      var listEl = pm.el.querySelector('[data-list]'), q = pm.el.querySelector('[data-q]'), composing = false;
      var draw = function () {
        var k = q.value.replace(/\s+/g, '').toLowerCase();
        var hits = lib.filter(function (x) { return !k || (x.label + (x.sub || '') + (x.search || '')).replace(/\s+/g, '').toLowerCase().indexOf(k) >= 0; });
        listEl.innerHTML = hits.length ? hits.map(function (x) {
          return '<button type="button" class="sc-lib-item" data-i="' + lib.indexOf(x) + '">' + CN.chartSvg(x.chart) + '<span class="t">' + esc(x.label) + '</span>' + (x.sub ? '<span class="s">' + esc(x.sub) + '</span>' : '') + '</button>';
        }).join('') : '<p class="empty">' + (lib.length ? '찾는 그림이 없어요.' : '아직 그려 둔 호핑 그림이 없어요.') + '</p>';
        listEl.querySelectorAll('[data-i]').forEach(function (b) {
          b.onclick = function () {
            var src = norm(clone(lib[b.dataset.i].chart)).items, map = {};
            if (!src.length) return;
            snapshot();
            src.forEach(function (it) { map[it.id] = nid(); });
            sel = {};
            src.forEach(function (it) {
              it.id = map[it.id];
              if (it.a) it.a = map[it.a];
              if (it.b) it.b = map[it.b];
              c.items.push(it);
              sel[it.id] = true;
            });
            pm.close();
            setTool('select');
            changed();
            CN.toast(src.length + '개를 불러왔어요 — 골라진 채로 옮기거나 지울 수 있어요', 2600);
          };
        });
      };
      q.addEventListener('compositionstart', function () { composing = true; });
      q.addEventListener('compositionend', function () { composing = false; draw(); });
      q.addEventListener('input', function () { if (!composing) draw(); });
      draw();
    };

    // 배경 사진 (스텔라리움 캡처 등) — 드라이브에 올리고 그 위에 그림
    var bgPhotoBtn = el.querySelector('[data-bgphoto]'), bgFileIn = el.querySelector('[data-bgfile]'), stEl = el.querySelector('[data-st]');
    var pickBg = function () { bgFileIn.value = ''; bgFileIn.click(); };
    if (bgPhotoBtn) {
      bgPhotoBtn.onclick = function (e) {
        if (!c.bgFile) { pickBg(); return; }
        var r = bgPhotoBtn.getBoundingClientRect();
        showMenu(r.left, r.bottom + 4, [
          ['배경 사진 바꾸기', pickBg],
          ['배경 사진 빼기', function () { snapshot(); c.bgFile = null; changed(); }],
        ]);
        e.stopPropagation();
      };
      bgFileIn.onchange = async function () {
        var f = bgFileIn.files[0];
        if (!f) return;
        bgPhotoBtn.disabled = true;
        try {
          var fid = await CN.uploadPhoto(opts.uploadFolder, f, function (s) { stEl.textContent = s; });
          snapshot(); c.bgFile = fid; changed();
          stEl.textContent = '배경 사진을 넣었어요 (몇 초 뒤에 보일 수 있어요)';
        } catch (er) { stEl.textContent = er.message || String(er); }
        bgPhotoBtn.disabled = false;
      };
    }
    var saveBtn = el.querySelector('[data-save]'), errEl = el.querySelector('[data-err]');
    saveBtn.onclick = async function () {
      closeMenus(); closePop();
      errEl.classList.remove('show');
      saveBtn.disabled = true; saveBtn.textContent = '저장 중…';
      try {
        if (opts.onSave) await opts.onSave(clean(c));
        finished = true;
        if (opts.draftKey) try { localStorage.removeItem(opts.draftKey); } catch (e) {}
        m.close();
      } catch (er) {
        errEl.textContent = er.message || String(er); errEl.classList.add('show');
        saveBtn.disabled = false; saveBtn.textContent = '저장';
      }
    };

    setTool(c.items.length ? 'select' : 'star');
    return result;
  };
})();
