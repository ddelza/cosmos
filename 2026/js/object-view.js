// 천체 상세 화면(페이지·팝업 공용) + 관리자 편집기
(function () {
  'use strict';
  var CN = window.CN, esc = CN.esc;

  var editingCount = 0;           // 편집창이 열려 있으면 외부 갱신으로 다시 그리지 않음
  CN.isEditing = function () { return editingCount > 0; };

  function who() { var a = CN.admin(); return a ? a.who.label : ''; }
  function draftKey(id, sec) { return 'cn26d:' + id + ':' + sec; }
  function getDraft(id, sec) { try { return localStorage.getItem(draftKey(id, sec)); } catch (e) { return null; } }
  function setDraft(id, sec, v) { try { localStorage.setItem(draftKey(id, sec), v); } catch (e) {} }
  function clearDraft(id, sec) { try { localStorage.removeItem(draftKey(id, sec)); } catch (e) {} }

  // 편집 기록 (천체당 최근 20개)
  async function pushHistory(id, section, prev) {
    try {
      await CN.db.post(CN.path('history', id), { section: section, prev: prev === undefined ? null : prev, by: who(), at: Date.now() });
      var keys = Object.keys((await CN.db.get(CN.path('history', id), { shallow: true })) || {}).sort();
      for (var i = 0; i < keys.length - 20; i++) await CN.db.del(CN.path('history', id, keys[i]));
    } catch (e) { /* 기록 실패는 저장을 막지 않음 */ }
  }

  // ===== 기본 정보 표 =====
  // [key, 라벨, 표시함수(o, val)] — basic 덮어쓰기 가능한 숫자/글 필드
  var BASIC_EDITABLE = {
    mag: { label: '겉보기 등급', type: 'number' },
    absMag: { label: '절대 등급', type: 'number' },
    distanceLy: { label: '거리(광년)', type: 'number' },
    sizeArcmin: { label: '겉보기 크기(각분)', type: 'number' },
    spectral: { label: '분광형', type: 'text' },
    diameterKm: { label: '지름(km)', type: 'number' },
    moons: { label: '위성 수', type: 'number' },
    orbitYears: { label: '공전 주기(년)', type: 'number' },
    subtype: { label: '세부 분류', type: 'text' },
    constellationKo: { label: '별자리', type: 'text' },
  };
  var BASIC_BY_TYPE = {
    star: ['subtype', 'constellationKo', 'mag', 'absMag', 'distanceLy', 'spectral'],
    planet: ['subtype', 'diameterKm', 'moons', 'orbitYears'],
    moon: ['subtype', 'diameterKm'],
    cluster: ['subtype', 'constellationKo', 'mag', 'distanceLy', 'sizeArcmin'],
    nebula: ['subtype', 'constellationKo', 'mag', 'distanceLy', 'sizeArcmin'],
    galaxy: ['subtype', 'constellationKo', 'mag', 'distanceLy', 'sizeArcmin'],
    other: ['subtype', 'constellationKo', 'mag', 'distanceLy', 'sizeArcmin'],
    constellation: ['subtype'],
  };

  var CON_CRITERIA =
    '<details class="crit"><summary>분류 기준 보기</summary><div class="crit-body">' +
    '<p>별자리 경계는 국제천문연맹(IAU)의 88개 별자리 경계를 쓰고, <strong>서울(북위 37.57°)</strong>에서 보이는 정도로 나눴어요.</p><ul>' +
    '<li><strong>주극성(항상 보임)</strong>: 별자리 넓이의 80% 이상이 서울에서 지평선 아래로 지지 않는 별자리 (서울에서는 적위 +52.4°보다 북쪽이 지지 않아요)</li>' +
    '<li><strong>전몰성(한국에서 안 보임)</strong>: 별자리의 북쪽 끝이 서울에서 가장 높이 떠도 10°가 안 되는 별자리 (건물·산에 가려 사실상 보이지 않아요)</li>' +
    '<li><strong>계절 별자리</strong>: 나머지는 별자리 중심이 초저녁 남쪽 하늘 높이 오는 계절로 나눴어요 — 중심 적경 3~9시 겨울, 9~15시 봄, 15~21시 여름, 21~3시 가을. 경계에 걸친 <strong>페르세우스자리(가을)</strong>, <strong>게자리(봄)</strong>는 흔히 쓰는 분류를 따랐어요.</li>' +
    '<li>일부만 항상 보이거나 일부만 떠오르는 별자리는 「서울에서」 칸에 따로 적었어요.</li></ul></div></details>';

  function withBasic(o, basic) {
    var x = Object.assign({}, o);
    Object.keys(basic || {}).forEach(function (k) { if (BASIC_EDITABLE[k] && basic[k] !== '' && basic[k] != null) x[k] = basic[k]; });
    return x;
  }

  function basicRows(state, o0, c, opts) {
    var o = withBasic(o0, c.basic);
    var edited = function (k) { return c.basic && c.basic[k] != null && c.basic[k] !== '' ? ' <span class="badge" title="AI 입력값: ' + esc(o0[k] == null ? '없음' : o0[k]) + '">수정됨</span>' : ''; };
    var rows = [];
    var add = function (label, val, k) { if (val !== '' && val != null) rows.push([label, val + (k ? edited(k) : '')]); };
    var t = CN.TYPES[o.type] || CN.TYPES.other;
    add('분류', esc(t.ko + (o.subtype && o.subtype !== t.ko ? ' · ' + o.subtype : '')), 'subtype');
    if (o.type === 'constellation') {
      add('국제 약자', esc(o.catalog) + ' · ' + esc(o.nameEn));
      add('서울에서', esc(o.subtype) + (o.visNote ? '<br><span class="hint-inline">' + esc(o.visNote) + '</span>' : ''));
      (o.asterisms || []).forEach(function (x) { add(esc(x.name), esc(x.text)); });
      var inside = state.list.filter(function (x) { return x.type !== 'constellation' && x.constellationKo === o.nameKo; })
        .sort(function (a, b) { return (a.mag == null ? 99 : a.mag) - (b.mag == null ? 99 : b.mag); });
      if (inside.length) add('이 별자리의 천체', '<span class="rel">' + inside.map(function (x) { return '<a href="#" data-related="' + esc(x.id) + '">' + esc(x.nameKo) + '</a>'; }).join('') + '</span>');
      return rows;
    }
    if (o.constellationKo) add('별자리', esc(o.constellationKo), 'constellationKo');
    if (o.ra != null) { add('적경 (J2000)', CN.fmtRA(o.ra)); add('적위 (J2000)', CN.fmtDec(o.dec)); }

    if (o.type === 'planet') {
      if (o.magRange) add('밝기 등급 (범위)', CN.fmtMag(o.magRange[0]) + ' ~ ' + CN.fmtMag(o.magRange[1]));
      if (o.distanceAU) add('태양으로부터 거리', (Math.round(o.distanceAU[0] * 100) / 100) + ' ~ ' + (Math.round(o.distanceAU[1] * 100) / 100) + ' AU');
      if (o.body && window.Astro) {
        var t0 = refDate(state, opts), p = Astro.planetNow(o.body, t0);
        add(refLabel(state, opts) + ' 밤 밝기', CN.fmtMag(p.mag) + ' <span class="hint-inline">(계산)</span>');
        add(refLabel(state, opts) + ' 지구로부터 거리', (Math.round(p.geoAU * 100) / 100) + ' AU ≈ ' + CN.fmtKm(p.geoAU * 149597870.7) + ' <span class="hint-inline">(계산)</span>');
      }
      if (o.diameterKm) add('지름', CN.fmtKm(o.diameterKm), 'diameterKm');
      if (o.moons != null) add('위성 수', o.moons + '개', 'moons');
      if (o.orbitYears) add('공전 주기', o.orbitYears + '년', 'orbitYears');
    } else if (o.type === 'moon') {
      if (o.magRange) add('밝기 등급 (범위)', CN.fmtMag(o.magRange[0]) + ' ~ ' + CN.fmtMag(o.magRange[1]));
      else if (o.mag != null) add('밝기 등급', CN.fmtMag(o.mag));
      var parent = o.parent && state.byId[o.parent];
      var from = o.parent === 'earth' || !parent ? '지구' : parent.nameKo;
      if (o.distanceKm) add(CN.josa(from, '으로', '로') + '부터 거리', o.distanceKm[0] === o.distanceKm[1] ? CN.fmtKm(o.distanceKm[0]) : CN.fmtKm(o.distanceKm[0]) + ' ~ ' + CN.fmtKm(o.distanceKm[1]));
      if (o.diameterKm) add('지름', CN.fmtKm(o.diameterKm), 'diameterKm');
      if (o.id === 'moon' && window.Astro) {
        var mi = Astro.moonInfo(refDate(state, opts));
        add(refLabel(state, opts) + ' 달', esc(mi.name) + ' · 밝은 부분 ' + Math.round(mi.illum * 100) + '% · 월령 약 ' + Math.round(mi.age) + '일 <span class="hint-inline">(계산)</span>');
      }
    } else {
      if (o.components && o.components.length) {
        add('겉보기 등급', o.components.map(function (x) { return esc(x.nameKo) + ' ' + CN.fmtMag(x.mag); }).join(', '));
        if (o.components.some(function (x) { return x.distanceLy; }))
          add('거리', o.components.map(function (x) { return esc(x.nameKo) + ' ' + CN.fmtLy(x.distanceLy); }).join(', '));
      } else {
        if (o.mag != null) add('겉보기 등급', CN.fmtMag(o.mag), 'mag');
        if (o.distanceLy) add('지구로부터 거리', CN.fmtLy(o.distanceLy), 'distanceLy');
      }
      if (o.type === 'star') {
        if (o.absMag != null) add('절대 등급', CN.fmtMag(o.absMag) + ' <span class="hint-inline">(10파섹 거리에서의 밝기)</span>', 'absMag');
        if (o.spectral) add('분광형', esc(o.spectral), 'spectral');
        if (o.radiusSun) add('반지름', '태양의 약 ' + o.radiusSun + '배');
      } else if (o.sizeArcmin) {
        add('겉보기 크기', CN.fmtArcmin(o.sizeArcmin) + ' <span class="hint-inline">(보름달 ≈ 31′)</span>', 'sizeArcmin');
        var r = CN.radiusLy(o.sizeArcmin, o.distanceLy);
        if (r) add('실제 반지름', '약 ' + CN.fmtRadius(r) + ' <span class="hint-inline">(거리·크기로 계산)</span>');
      }
      if (o.id === 'sun') add('지구로부터 거리', '약 1억 5,000만 km (1 AU)');
    }
    return rows;
  }

  // ===== 그날 밤 위치 =====
  // opts.sky = { title, times: [{label, date}], highlight: 번호, refDate } — 없으면 행사 날 미리보기 시각
  function skyTimes(state, opts) {
    if (opts && opts.sky) return opts.sky.times;
    return state.config.previewTimes.map(function (hm) { return { label: hm, date: Astro.kst(state.config.eventDate, hm) }; });
  }
  function refDate(state, opts) { return opts && opts.sky && opts.sky.refDate ? opts.sky.refDate : Astro.kst(state.config.eventDate, '20:30'); }
  function refLabel(state, opts) { return opts && opts.sky && opts.sky.dayLabel ? opts.sky.dayLabel : CN.dateShort(state.config.eventDate); }

  function tonightHtml(state, o, opts) {
    if (!window.Astro) return '';
    if (o.id === 'sun') return '<p class="sub">해는 밤에는 볼 수 없어요. 절대로 망원경이나 쌍안경으로 해를 직접 보면 안 돼요!</p>';
    var parent = o.type === 'moon' && o.parent && o.parent !== 'earth' ? state.byId[o.parent] : null;
    var hl = opts && opts.sky ? opts.sky.highlight : -1;
    var rows = skyTimes(state, opts).map(function (t, i) {
      var hm = t.label, p = Astro.position(o, t.date);
      if (!p) return '';
      var st = p.alt >= 20 ? '<span class="vis ok">잘 보임</span>' : p.alt >= 0 ? '<span class="vis low">낮음</span>' : '<span class="vis no">지평선 아래</span>';
      return '<tr' + (i === hl ? ' class="hl"' : '') + '><td>' + esc(hm) + '</td><td>' + (p.alt >= 0 ? esc(Astro.dir8(p.az)) + '쪽 <span class="hint-inline">' + Math.round(p.az) + '°</span>' : '—') +
        '</td><td>' + (p.alt >= 0 ? Math.round(p.alt) + '°' : '—') + '</td><td>' + st + '</td></tr>';
    }).join('');
    var note = '';
    if (o.type === 'constellation') {
      note = '<p class="hint">위치는 별자리 중심 기준이에요.</p>' + (o.visibility === 'never' ? '<p class="warn-note"><strong>우리나라에서는 볼 수 없는 별자리</strong>예요.</p>' : '');
    } else if (o.dec != null) {
      var ma = Astro.maxAlt(o.dec);
      note = ma < 0 ? '<p class="warn-note">' + (o.dec < Astro.lat ? '남쪽' : '북쪽') + ' 하늘 아주 낮은 곳에 있어서 <strong>' + esc(Astro.locName || '이곳') + '에서는 볼 수 없는 천체</strong>예요.</p>'
        : ma < 20 ? '<p class="hint">' + esc(Astro.locName || '이곳') + '에서 가장 높이 떠도 ' + Math.round(ma) + '°라서 ' + (o.dec < Astro.lat ? '남쪽' : '북쪽') + ' 지평선 가까이에서만 보여요.</p>' : '';
    }
    if (parent) note += '<p class="hint">' + esc(CN.josa(o.nameKo, '은', '는')) + ' ' + esc(parent.nameKo) + ' 바로 옆에 있어요. 위치는 ' + esc(parent.nameKo) + ' 기준이고, 망원경이 있어야 보여요.</p>';
    return '<table class="tonight"><thead><tr><th>시각</th><th>방향</th><th>높이</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' + note;
  }

  // ===== 렌더링 =====
  function sectionHead(title, sec, admin, extra) {
    return '<div class="sec-head"><h2>' + title + '</h2>' + (extra || '') + (admin && sec ? '<button class="btn small ghost" data-edit="' + sec + '">✎ 편집</button>' : '') + '</div>';
  }

  function metaLine(x) {
    if (!x) return '';
    if (x.seed) return '<div class="seed-note">작년 자료 · 검토 필요 (' + esc(x.src || '') + ')</div>';
    return x.by ? '<div class="by">✎ ' + esc(x.by) + ' · ' + CN.fmtWhen(x.at) + '</div>' : '';
  }

  CN.renderObject = function (root, state, o, opts) {
    opts = opts || {};
    var admin = CN.isAdmin();
    var c = CN.contentOf(state, o.id);
    var photos = CN.sortedPhotos(c.photos);
    var t = CN.TYPES[o.type] || CN.TYPES.other;
    var meta = c.meta || {};
    var featured = CN.isFeatured(state, o);
    var defaultImg = state.credits[o.id] ? CN.asset('img/objects/' + o.id + '.jpg') : (o.type === 'star' ? CN.starImg(o.bv, o.mag) : '');

    var h = '';
    // 머리
    h += '<header class="obj-head">';
    h += '<div class="cover">' + (photos.length ? CN.driveImgTag(photos[0].fileId, 1600, 'photo', defaultImg, o.nameKo)
      : defaultImg ? '<img class="photo" src="' + esc(defaultImg) + '" alt="' + esc(o.nameKo) + '">' : '<div class="ph-icon big">' + t.icon + '</div>') + '</div>';
    if (photos.length && (photos[0].caption || photos[0].credit)) h += '<div class="cap">' + esc([photos[0].caption, photos[0].credit].filter(Boolean).join(' · ')) + '</div>';
    else if (!photos.length && state.credits[o.id]) h += '<div class="cap">기본 사진: ' + esc(state.credits[o.id].author || '') + ' (' + esc(state.credits[o.id].license || '') + ')</div>';
    h += '<h1>' + esc(o.nameKo) + ' <span class="cat">' + esc(o.catalog || '') + '</span></h1>';
    h += '<div class="tags"><span class="badge solid">' + t.icon + ' ' + esc(CN.typeLabel(o)) + '</span>' +
      (o.constellationKo ? '<span class="badge">' + esc(o.constellationKo) + '</span>' : '') +
      (featured ? '<span class="badge star-feat">★ ' + CN.featuredLabel() + '</span>' : '') +
      Object.keys(meta.places || {}).filter(function (k) { return meta.places[k]; }).map(function (k) { return '<span class="badge">📍 ' + esc(CN.PLACES[k]) + '</span>'; }).join('') + '</div>';
    var sub = [o.nameEn, o.altCatalog].concat(o.aliasesKo || []).filter(Boolean);
    if (sub.length) h += '<p class="en">' + esc(sub.join(' · ')) + '</p>';
    if (opts.popup) h += '<a class="btn small ghost" href="' + CN.esc(opts.fullHref ? opts.fullHref(o) : CN.asset('objects.html?id=' + encodeURIComponent(o.id))) + '">전체 페이지로 보기 →</a>';
    h += '</header>';

    // 사진 모음
    if (photos.length > 1 || admin) {
      h += '<section data-sec="photos">' + sectionHead('사진', 'photos', admin) + '<div class="sec-body">';
      h += photos.length ? '<div class="gallery">' + photos.map(function (p) {
        return '<figure><a href="' + esc(CN.photoUrl(p.fileId, 1600)) + '" target="_blank" rel="noopener">' + CN.driveImgTag(p.fileId, 500, 'photo', '', p.caption) + '</a>' +
          (p.caption || p.credit ? '<figcaption>' + esc([p.caption, p.credit].filter(Boolean).join(' · ')) + '</figcaption>' : '') + '</figure>';
      }).join('') + '</div>' : '<p class="empty-sec">아직 올린 사진이 없어요. 직접 찍은 사진이나 출처가 분명한 사진을 올려 주세요.</p>';
      h += '</div></section>';
    }

    // 그날 밤 위치
    h += '<section data-sec="tonight">' + sectionHead(esc(opts.sky ? opts.sky.title : CN.dateShort(state.config.eventDate) + ' 밤, 광수중에서')) + '<div class="sec-body">' + tonightHtml(state, o, opts) + (opts.sky && opts.sky.note ? '<p class="hint">' + esc(opts.sky.note) + '</p>' : '') + '</div></section>';

    // 텍스트 섹션 + 호핑법
    var order = ['points', 'hopping', 'description', 'story'];
    order.forEach(function (sec) {
      if (sec === 'hopping') {
        var steps = CN.sortedPhotos ? Object.keys(c.hopping).map(function (k) { return Object.assign({ key: k }, c.hopping[k]); }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); }) : [];
        if (!steps.length && !admin) return;
        h += '<section data-sec="hopping">' + sectionHead('밤하늘에서 찾는 법 (호핑법)', 'hopping', admin) + '<div class="sec-body">';
        root._hopCharts = steps.map(function (s) { return s.chart; });
        h += steps.length ? '<ol class="hop">' + steps.map(function (s, i) {
          return '<li class="hop-step"><div class="hop-img">' + (CN.chartCount(s.chart) ? '<button type="button" class="hop-chart" data-chart-zoom="' + i + '" title="크게 보기">' + CN.chartSvg(s.chart, '호핑 ' + (i + 1) + '단계 그림') + '</button>'
            : s.fileId ? '<a href="' + esc(CN.photoUrl(s.fileId, 1600)) + '" target="_blank" rel="noopener">' + CN.driveImgTag(s.fileId, 800, 'photo', '', '호핑 ' + (i + 1) + '단계') + '</a>' : '<div class="ph-icon">' + (i + 1) + '</div>') +
            '</div><div class="hop-text"><div class="hop-n">' + (i + 1) + '단계</div>' + CN.md(s.text) + '</div></li>';
        }).join('') + '</ol>' : '<p class="empty-sec">아직 작성 전이에요. 별자리 사진을 왼쪽에, 찾아가는 방법을 오른쪽에 단계별로 적어 주세요.</p>';
        h += '</div></section>';
        return;
      }
      var x = c[sec];
      if (!x && !admin) return;
      h += '<section data-sec="' + sec + '">' + sectionHead(CN.SECTIONS[sec], sec, admin) + '<div class="sec-body">' +
        (x ? '<div class="prose">' + CN.md(x.v) + '</div>' + metaLine(x) : '<p class="empty-sec">아직 작성 전이에요.</p>') + '</div></section>';
    });

    // 관측 난이도·장비·장소
    var eye = meta.eye || (c.seedDifficulty && c.seedDifficulty.eye), photoLv = meta.photo || (c.seedDifficulty && c.seedDifficulty.photo);
    var gear = Object.keys(meta.gear || {}).filter(function (k) { return meta.gear[k]; });
    if (eye || photoLv || gear.length || admin) {
      h += '<section data-sec="meta">' + sectionHead('관측 난이도 · 추천 장비', 'meta', admin) + '<div class="sec-body"><dl class="kv">';
      h += '<dt>눈으로 보기(안시)</dt><dd>' + (eye ? '<span class="lv">' + esc(eye) + '</span>' : '—') + '</dd>';
      h += '<dt>사진 찍기(촬영)</dt><dd>' + (photoLv ? '<span class="lv">' + esc(photoLv) + '</span>' : '—') + '</dd>';
      h += '<dt>추천 장비</dt><dd>' + (gear.length ? gear.map(function (k) { return esc(CN.GEAR[k]); }).join(', ') : '—') + '</dd>';
      h += '</dl>' + (!meta.eye && c.seedDifficulty ? '<div class="seed-note">작년 자료 · 검토 필요</div>' : '') + '</div></section>';
    }

    // 기본 정보
    var rows = basicRows(state, o, c, opts);
    h += '<section data-sec="basic">' + sectionHead('기본 정보', 'basic', admin) + '<div class="sec-body"><dl class="kv">' +
      rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>' +
      (o.type === 'constellation' ? CON_CRITERIA : '<p class="hint">기본 정보는 AI가 공개 천문 자료(OpenNGC, HYG 별 목록, 위키백과 등)를 바탕으로 입력했어요. 틀린 곳이 있으면 동아리에 알려 주세요.</p>') + '</div></section>';

    if (admin) h += '<div class="obj-admin"><button class="btn small ghost" data-history>🕘 수정 기록 보기</button></div>';

    root.innerHTML = '<article class="obj">' + h + '</article>';
    bind(root, state, o, opts);
  };

  // ===== 편집기 연결 =====
  function rerender(root, state, o, opts) {
    CN.renderObject(root, state, o, opts);
    if (opts.onChange) opts.onChange();
  }

  function bind(root, state, o, opts) {
    root.querySelectorAll('[data-edit]').forEach(function (b) {
      b.onclick = function () {
        var sec = b.dataset.edit, box = root.querySelector('section[data-sec="' + sec + '"] .sec-body');
        b.disabled = true;
        if (CN.SECTIONS[sec]) editText(box, state, o, sec, root, opts);
        else if (sec === 'photos') editPhotos(box, state, o, root, opts);
        else if (sec === 'hopping') editHopping(box, state, o, root, opts);
        else if (sec === 'meta') editMeta(box, state, o, root, opts);
        else if (sec === 'basic') editBasic(box, state, o, root, opts);
      };
    });
    var hb = root.querySelector('[data-history]');
    if (hb) hb.onclick = function () { openHistory(state, o, root, opts); };
    root.querySelectorAll('[data-chart-zoom]').forEach(function (b) {
      b.onclick = function () {
        var n = Number(b.dataset.chartZoom);
        CN.modal('<div class="modal-head"><div class="t">' + esc(o.nameKo) + ' · 호핑 ' + (n + 1) + '단계</div><button class="icon-btn" data-close>닫기</button></div>' +
          CN.chartSvg((root._hopCharts || [])[n], '호핑 ' + (n + 1) + '단계 그림'), { wide: true });
      };
    });
    root.querySelectorAll('[data-related]').forEach(function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        if (opts.openRelated) opts.openRelated(a.dataset.related);
        else location.href = CN.asset('objects.html?id=' + encodeURIComponent(a.dataset.related));
      };
    });
  }

  function ensureContent(state, id) { if (!state.content[id]) state.content[id] = {}; return state.content[id]; }

  // 호핑 단계 목록 (순서대로)
  function hopSteps(hop) {
    return Object.keys(hop || {}).map(function (k) { return Object.assign({ key: k }, hop[k]); }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  // 불러온 단계는 다른 천체와 같은 사진을 함께 쓸 수 있음 → 다른 곳에서 안 쓸 때만 휴지통으로
  function fileInUse(state, fid, objId, key) {
    return Object.keys(state.content).some(function (id) {
      var c = state.content[id] || {};
      return Object.keys(c.hopping || {}).some(function (k) {
        if (id === objId && k === key) return false;
        var s = c.hopping[k] || {};
        return s.fileId === fid || (s.chart && s.chart.bgFile === fid);
      }) || Object.keys(c.photos || {}).some(function (k) { return (c.photos[k] || {}).fileId === fid; });
    });
  }
  function safeTrash(state, fid, objId, key) { if (fid && !fileInUse(state, fid, objId, key)) CN.trashPhoto(fid); }
  // 그림 편집기의 「다른 그림 불러오기」 목록: 모든 천체의 호핑 그림
  function chartLibrary(state, curId, curKey) {
    var out = [];
    Object.keys(state.content).forEach(function (id) {
      var o = state.byId[id];
      hopSteps((state.content[id] || {}).hopping).forEach(function (s, i) {
        if (!CN.chartCount(s.chart) || (id === curId && s.key === curKey)) return;
        out.push({ chart: s.chart, label: (o ? o.nameKo : id) + ' · ' + (i + 1) + '단계', sub: id === curId ? '이 천체' : (o && o.catalog) || '', search: o ? CN.searchText(o) : id });
      });
    });
    return out.sort(function (a, b) { return (a.sub === '이 천체' ? 0 : 1) - (b.sub === '이 천체' ? 0 : 1) || a.label.localeCompare(b.label, 'ko'); });
  }

  // --- 글 섹션 (조건부 저장) ---
  async function editText(box, state, o, sec, root, opts) {
    editingCount++;
    var path = CN.path('objects', o.id, sec);
    box.innerHTML = '<div class="loading">불러오는 중…</div>';
    var tagged;
    try { tagged = await CN.db.getTagged(path); } catch (e) { box.innerHTML = '<div class="msg err show">' + esc(e.message) + '</div>'; editingCount--; return; }
    var cur = tagged.data && tagged.data.v ? tagged.data.v : '';
    var seed = !cur && state.seed[o.id] && state.seed[o.id][sec] ? state.seed[o.id][sec].v : '';
    var draft = getDraft(o.id, sec);
    var start = draft != null && draft !== cur ? draft : (cur || seed);
    var etag = tagged.etag;

    box.innerHTML =
      (draft != null && draft !== cur ? '<div class="msg ok show">저장하지 않은 글을 불러왔어요.</div>' : '') +
      (seed && !cur ? '<div class="msg ok show">작년 자료를 불러왔어요. 고쳐서 저장하면 내 글로 바뀌어요.</div>' : '') +
      '<textarea class="ed" rows="8">' + esc(start) + '</textarea>' +
      '<div class="hint">빈 줄 = 문단 나누기 · 줄 앞에 "- " = 목록 · **굵게** · 저장하면 편집자 이름(' + esc(who()) + ')이 남아요</div>' +
      '<div class="ed-preview prose"></div>' +
      '<div class="ed-actions"><button class="btn primary small" data-save>저장</button><button class="btn ghost small" data-cancel>취소</button></div>' +
      '<div class="msg err" data-err></div>';
    var ta = box.querySelector('textarea'), pv = box.querySelector('.ed-preview');
    var upd = function () { pv.innerHTML = CN.md(ta.value) || '<span class="hint">미리보기</span>'; };
    var t;
    ta.addEventListener('input', function () { upd(); clearTimeout(t); t = setTimeout(function () { setDraft(o.id, sec, ta.value); }, 400); });
    upd(); ta.focus();

    var done = function () { editingCount = Math.max(0, editingCount - 1); rerender(root, state, o, opts); };
    box.querySelector('[data-cancel]').onclick = function () {
      if (ta.value !== start && !confirm('저장하지 않은 내용은 이 기기에 임시로 남아 있어요. 편집을 닫을까요?')) return;
      done();
    };
    box.querySelector('[data-save]').onclick = async function () {
      var btn = this, err = box.querySelector('[data-err]');
      var text = ta.value.trim();
      btn.disabled = true; btn.textContent = '저장 중…'; err.classList.remove('show');
      try {
        var value = text ? { v: text, by: who(), at: Date.now() } : null;
        var res = await CN.db.putIfMatch(path, value, etag);
        if (res.conflict) {
          var other = res.current && res.current.v ? res.current : null;
          var choice = await conflictDialog(other, text);
          if (choice === 'mine') {
            res = await CN.db.putIfMatch(path, value, res.etag);
            if (res.conflict) throw new Error('또 다른 저장이 있었어요. 다시 시도해 주세요.');
            cur = other ? other.v : '';
          } else {
            setDraft(o.id, sec, text);
            ensureContent(state, o.id)[sec] = res.current;
            CN.toast('상대 글을 보여줄게요. 내 글은 이 기기에 임시저장돼 있어요.', 3500);
            done();
            return;
          }
        }
        await pushHistory(o.id, sec, cur ? { v: cur } : null);
        clearDraft(o.id, sec);
        var co = ensureContent(state, o.id);
        if (value) co[sec] = value; else delete co[sec];
        CN.toast('저장했어요');
        done();
      } catch (e) {
        err.textContent = e.message; err.classList.add('show');
        btn.disabled = false; btn.textContent = '저장';
      }
    };
  }

  function conflictDialog(other, mine) {
    return new Promise(function (resolve) {
      var m = CN.modal(
        '<div class="modal-head"><div class="t">다른 사람이 먼저 저장했어요</div></div>' +
        '<p class="sub">' + (other ? esc(other.by || '누군가') + ' · ' + CN.fmtWhen(other.at) : '이 칸을 누군가 비웠어요') + '</p>' +
        '<h3>먼저 저장된 글</h3><div class="card prose">' + (other ? CN.md(other.v) : '<span class="hint">(비어 있음)</span>') + '</div>' +
        '<h3>내가 쓴 글</h3><div class="card prose">' + (CN.md(mine) || '<span class="hint">(비어 있음)</span>') + '</div>' +
        '<div class="ed-actions"><button class="btn primary small" data-mine>내 글로 저장</button><button class="btn ghost small" data-theirs>먼저 저장된 글 유지</button></div>' +
        '<p class="hint">"먼저 저장된 글 유지"를 고르면 내 글은 이 기기에 임시저장돼서, 다시 편집을 누르면 불러올 수 있어요.</p>',
        { narrow: true, onClose: function () { resolve('theirs'); } });
      m.el.querySelector('[data-mine]').onclick = function () { resolve('mine'); m.close(); };
      m.el.querySelector('[data-theirs]').onclick = function () { resolve('theirs'); m.close(); };
    });
  }

  // --- 사진 (키별 저장이라 충돌 없음) ---
  function editPhotos(box, state, o, root, opts) {
    editingCount++;
    var co = ensureContent(state, o.id);
    co.photos = co.photos || {};
    var draw = function () {
      var list = CN.sortedPhotos(co.photos);
      box.innerHTML =
        '<div class="ph-edit">' + list.map(function (p, i) {
          return '<div class="ph-item" data-k="' + esc(p.key) + '">' + CN.driveImgTag(p.fileId, 250, 'photo', '', '') +
            '<div class="ph-fields"><input type="text" data-f="caption" placeholder="설명 (예: 10인치 돕소니안으로 본 모습)" value="' + esc(p.caption || '') + '">' +
            '<input type="text" data-f="credit" placeholder="촬영자·출처 (예: 2108 백서후 촬영)" value="' + esc(p.credit || '') + '">' +
            '<div class="ph-btns"><button class="btn small ghost" data-mv="-1"' + (i === 0 ? ' disabled' : '') + '>◀ 앞으로</button><button class="btn small ghost" data-mv="1"' + (i === list.length - 1 ? ' disabled' : '') + '>뒤로 ▶</button><button class="btn small ghost" data-del>삭제</button></div></div></div>';
        }).join('') + '</div>' +
        '<label class="btn small" style="margin-top:10px">＋ 사진 올리기<input type="file" accept="image/*" multiple hidden></label>' +
        '<div class="hint">첫 번째 사진이 대표 사진(목록·팝업)으로 쓰여요. 인터넷 사진은 출처를 꼭 적어 주세요.</div>' +
        '<div class="msg ok" data-st></div><div class="ed-actions"><button class="btn primary small" data-done>편집 마치기</button></div>';
      box.querySelectorAll('.ph-item').forEach(function (el) {
        var k = el.dataset.k;
        el.querySelectorAll('input[data-f]').forEach(function (inp) {
          inp.addEventListener('change', async function () {
            try { await CN.db.patch(CN.path('objects', o.id, 'photos', k), { [inp.dataset.f]: inp.value.trim() }); co.photos[k][inp.dataset.f] = inp.value.trim(); CN.toast('저장했어요'); }
            catch (e) { CN.toast(e.message); }
          });
        });
        el.querySelectorAll('[data-mv]').forEach(function (b) {
          b.onclick = async function () {
            var arr = CN.sortedPhotos(co.photos), i = arr.findIndex(function (p) { return p.key === k; }), j = i + Number(b.dataset.mv);
            if (j < 0 || j >= arr.length) return;
            var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            var patch = {};
            arr.forEach(function (p, n) { patch[p.key + '/order'] = n; co.photos[p.key].order = n; });
            try { await CN.db.patch(CN.path('objects', o.id, 'photos'), patch); draw(); } catch (e) { CN.toast(e.message); }
          };
        });
        el.querySelector('[data-del]').onclick = async function () {
          if (!confirm('이 사진을 지울까요? (드라이브 휴지통으로 옮겨져서 선생님이 되살릴 수 있어요)')) return;
          var p = co.photos[k];
          try {
            await CN.db.del(CN.path('objects', o.id, 'photos', k));
            await pushHistory(o.id, 'photos', p);
            delete co.photos[k];
            CN.trashPhoto(p.fileId);
            draw();
          } catch (e) { CN.toast(e.message); }
        };
      });
      var fileInput = box.querySelector('input[type=file]');
      fileInput.onchange = async function () {
        var files = Array.from(fileInput.files || []), st = box.querySelector('[data-st]');
        var base = CN.sortedPhotos(co.photos).length;
        for (var n = 0; n < files.length; n++) {
          st.classList.add('show');
          try {
            var fid = await CN.uploadPhoto(o.id, files[n], function (s) { st.textContent = (n + 1) + '/' + files.length + ' ' + s; });
            var key = 'p' + CN.uid();
            var rec = { fileId: fid, caption: '', credit: '', order: base + n, by: who(), at: Date.now() };
            await CN.db.put(CN.path('objects', o.id, 'photos', key), rec);
            co.photos[key] = rec;
          } catch (e) { st.textContent = e.message; CN.toast(e.message, 4000); }
        }
        st.classList.remove('show');
        draw();
      };
      box.querySelector('[data-done]').onclick = function () { editingCount = Math.max(0, editingCount - 1); rerender(root, state, o, opts); };
    };
    draw();
  }

  // --- 호핑법 (단계별 키 저장) ---
  function editHopping(box, state, o, root, opts) {
    editingCount++;
    var co = ensureContent(state, o.id);
    co.hopping = co.hopping || {};
    var steps = function () { return Object.keys(co.hopping).map(function (k) { return Object.assign({ key: k }, co.hopping[k]); }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); };
    var draw = function () {
      var list = steps();
      box.innerHTML = '<ol class="hop edit">' + list.map(function (s, i) {
        var dk = getDraft(o.id, 'hop-' + s.key);
        var hasChart = CN.chartCount(s.chart) > 0;
        return '<li class="hop-step" data-k="' + esc(s.key) + '"><div class="hop-img">' +
          (hasChart ? CN.chartSvg(s.chart) : s.fileId ? CN.driveImgTag(s.fileId, 500, 'photo', '', '') : '<div class="ph-icon">' + (i + 1) + '</div>') +
          '<div class="ph-btns"><button type="button" class="btn small ghost" data-chart>' + (hasChart ? '✎ 그림 고치기' : '✎ 그림 그리기') + '</button>' +
          '<label class="btn small ghost">' + (s.fileId ? '사진 바꾸기' : hasChart ? '사진으로 바꾸기' : '＋ 사진') + '<input type="file" accept="image/*" hidden></label></div></div>' +
          '<div class="hop-text"><div class="hop-n">' + (i + 1) + '단계</div><textarea rows="5" placeholder="예) 카시오페이아자리 W의 오른쪽 두 별을 이은 선을 따라 내려가면…">' + esc(dk != null ? dk : (s.text || '')) + '</textarea>' +
          '<div class="ph-btns"><button class="btn small primary" data-save>글 저장</button><button class="btn small ghost" data-mv="-1"' + (i === 0 ? ' disabled' : '') + '>▲</button><button class="btn small ghost" data-mv="1"' + (i === list.length - 1 ? ' disabled' : '') + '>▼</button><button class="btn small ghost" data-del>단계 삭제</button></div></div></li>';
      }).join('') + '</ol>' +
        '<div class="ph-btns"><button class="btn small" data-add>＋ 단계 추가</button><button class="btn small ghost" data-import>📥 다른 천체 호핑법 불러오기</button></div><div class="msg ok" data-st></div>' +
        '<div class="ed-actions"><button class="btn primary small" data-done>편집 마치기</button></div>';

      box.querySelectorAll('.hop-step').forEach(function (el) {
        var k = el.dataset.k, ta = el.querySelector('textarea');
        ta.addEventListener('input', function () { setDraft(o.id, 'hop-' + k, ta.value); });
        el.querySelector('[data-save]').onclick = async function () {
          try {
            var prev = co.hopping[k].text || '';
            await CN.db.patch(CN.path('objects', o.id, 'hopping', k), { text: ta.value.trim(), by: who(), at: Date.now() });
            if (prev && prev !== ta.value.trim()) pushHistory(o.id, 'hopping', { key: k, text: prev });
            co.hopping[k].text = ta.value.trim(); clearDraft(o.id, 'hop-' + k); CN.toast('저장했어요');
          } catch (e) { CN.toast(e.message); }
        };
        // 그림 도구 (사진 대신 별·점선·붉은 원·글자)
        el.querySelector('[data-chart]').onclick = async function () {
          var cur = co.hopping[k];
          if (cur.fileId && !CN.chartCount(cur.chart) && !confirm('그림을 저장하면 지금 사진 대신 그림이 보여요. (사진은 드라이브 휴지통으로 옮겨져요) 그림을 그릴까요?')) return;
          setDraft(o.id, 'hop-' + k, ta.value);
          var n = steps().findIndex(function (s) { return s.key === k; }) + 1;
          var saved = await CN.openChartEditor(cur.chart, {
            title: o.nameKo + ' · 호핑 ' + n + '단계 그림',
            draftKey: draftKey(o.id, 'hopchart-' + k),
            uploadFolder: o.id,
            library: function () { return chartLibrary(state, o.id, k); },
            onSave: async function (chart) {
              var empty = !chart.items.length, old = co.hopping[k];
              var patch = { chart: empty ? null : chart, by: who(), at: Date.now() };
              if (!empty && old.fileId) patch.fileId = null;
              await CN.db.patch(CN.path('objects', o.id, 'hopping', k), patch);
              if (CN.chartCount(old.chart)) pushHistory(o.id, 'hopping', { key: k, chart: old.chart });
              if (patch.fileId === null) { pushHistory(o.id, 'hopping', { key: k, fileId: old.fileId }); safeTrash(state, old.fileId, o.id, k); delete old.fileId; }
              if (empty) delete old.chart; else old.chart = chart;
              CN.toast(empty ? '그림을 지웠어요' : '그림을 저장했어요');
            },
          });
          if (saved) draw();
        };
        el.querySelector('input[type=file]').onchange = async function () {
          var f = this.files[0], st = box.querySelector('[data-st]');
          if (!f) return;
          var hadChart = CN.chartCount(co.hopping[k].chart) > 0;
          if (hadChart && !confirm('사진으로 바꾸면 이 단계의 그림은 지워져요. (수정 기록에 남아요) 바꿀까요?')) { this.value = ''; return; }
          st.classList.add('show');
          try {
            var fid = await CN.uploadPhoto(o.id, f, function (s) { st.textContent = s; });
            var old = co.hopping[k].fileId, oldChart = co.hopping[k].chart;
            await CN.db.patch(CN.path('objects', o.id, 'hopping', k), { fileId: fid, chart: null, by: who(), at: Date.now() });
            co.hopping[k].fileId = fid;
            delete co.hopping[k].chart;
            if (hadChart) pushHistory(o.id, 'hopping', { key: k, chart: oldChart });
            if (old) { pushHistory(o.id, 'hopping', { key: k, fileId: old }); safeTrash(state, old, o.id, k); }
            setDraft(o.id, 'hop-' + k, ta.value);
            draw();
          } catch (e) { st.textContent = e.message; }
        };
        el.querySelectorAll('[data-mv]').forEach(function (b) {
          b.onclick = async function () {
            setDraft(o.id, 'hop-' + k, ta.value);
            var arr = steps(), i = arr.findIndex(function (s) { return s.key === k; }), j = i + Number(b.dataset.mv);
            if (j < 0 || j >= arr.length) return;
            var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            var patch = {};
            arr.forEach(function (s, n) { patch[s.key + '/order'] = n; co.hopping[s.key].order = n; });
            try { await CN.db.patch(CN.path('objects', o.id, 'hopping'), patch); draw(); } catch (e) { CN.toast(e.message); }
          };
        });
        el.querySelector('[data-del]').onclick = async function () {
          if (!confirm('이 단계를 지울까요?')) return;
          var s = co.hopping[k];
          try {
            await CN.db.del(CN.path('objects', o.id, 'hopping', k));
            await pushHistory(o.id, 'hopping', s);
            delete co.hopping[k]; clearDraft(o.id, 'hop-' + k);
            if (s.fileId) safeTrash(state, s.fileId, o.id, k);
            draw();
          } catch (e) { CN.toast(e.message); }
        };
      });
      box.querySelector('[data-add]').onclick = async function () {
        box.querySelectorAll('.hop-step').forEach(function (el) { setDraft(o.id, 'hop-' + el.dataset.k, el.querySelector('textarea').value); });
        var key = 'h' + CN.uid(), rec = { text: '', order: steps().length, by: who(), at: Date.now() };
        try { await CN.db.put(CN.path('objects', o.id, 'hopping', key), rec); co.hopping[key] = rec; draw(); } catch (e) { CN.toast(e.message); }
      };
      box.querySelector('[data-import]').onclick = function () {
        box.querySelectorAll('.hop-step').forEach(function (el) { setDraft(o.id, 'hop-' + el.dataset.k, el.querySelector('textarea').value); });
        importHopping(state, o, co, function () { draw(); });
      };
      box.querySelector('[data-done]').onclick = function () {
        var unsaved = Array.from(box.querySelectorAll('.hop-step')).some(function (el) { return el.querySelector('textarea').value.trim() !== (co.hopping[el.dataset.k].text || ''); });
        if (unsaved && !confirm('「글 저장」을 누르지 않은 단계가 있어요. 그래도 닫을까요? (쓰던 글은 이 기기에 임시저장돼 있어요)')) return;
        editingCount = Math.max(0, editingCount - 1); rerender(root, state, o, opts);
      };
    };
    draw();
  }

  // --- 다른 천체의 호핑법 단계 불러오기 (글·그림·사진을 복사해서 이 천체 단계 뒤에 붙임) ---
  function importHopping(state, o, co, after) {
    var srcs = Object.keys(state.content).filter(function (id) { return id !== o.id; }).map(function (id) {
      var steps = hopSteps((state.content[id] || {}).hopping).filter(function (s) { return (s.text || '').trim() || s.fileId || CN.chartCount(s.chart); });
      var x = state.byId[id];
      return steps.length ? { id: id, o: x, name: x ? x.nameKo : id, steps: steps } : null;
    }).filter(Boolean).sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
    var m = CN.modal('<div class="modal-head"><div class="t">다른 천체 호핑법 불러오기</div><button class="icon-btn" data-close>닫기</button></div><div class="hop-import" data-body></div>', { wide: true });
    var body = m.el.querySelector('[data-body]');

    var showList = function () {
      body.innerHTML = '<p class="hint" style="margin-top:0">고른 천체의 호핑법 단계를 <b>' + esc(o.nameKo) + '</b> 호핑법 뒤에 복사해 붙여요. 원래 천체의 글은 바뀌지 않아요. 불러온 뒤에는 이 천체에 맞게 글과 그림을 고쳐 주세요.</p>' +
        '<input type="search" data-q placeholder="천체 이름으로 찾기 (예: 카시오페이아, M31)" autocomplete="off" style="width:100%"><div data-list></div>';
      var q = body.querySelector('[data-q]'), list = body.querySelector('[data-list]'), composing = false;
      var draw = function () {
        var k = q.value.replace(/\s+/g, '').toLowerCase();
        var hits = srcs.filter(function (s) { return !k || (s.o ? CN.searchText(s.o) : s.id).indexOf(k) >= 0; });
        list.innerHTML = hits.length ? hits.map(function (s) {
          var nc = s.steps.filter(function (x) { return CN.chartCount(x.chart); }).length, np = s.steps.filter(function (x) { return x.fileId && !CN.chartCount(x.chart); }).length;
          return '<button type="button" class="imp-obj" data-id="' + esc(s.id) + '"><span>' + esc(s.name) + (s.o && s.o.catalog ? ' <span class="cat">' + esc(s.o.catalog) + '</span>' : '') + '</span>' +
            '<span class="n">' + s.steps.length + '단계' + (nc ? ' · 그림 ' + nc : '') + (np ? ' · 사진 ' + np : '') + '</span></button>';
        }).join('') : '<p class="empty">' + (srcs.length ? '찾는 천체가 없어요.' : '아직 호핑법을 쓴 다른 천체가 없어요.') + '</p>';
        list.querySelectorAll('[data-id]').forEach(function (b) { b.onclick = function () { showSteps(srcs.find(function (s) { return s.id === b.dataset.id; })); }; });
      };
      q.addEventListener('compositionstart', function () { composing = true; });
      q.addEventListener('compositionend', function () { composing = false; draw(); });
      q.addEventListener('input', function () { if (!composing) draw(); });
      draw();
      setTimeout(function () { q.focus(); }, 50);
    };

    var showSteps = function (src) {
      body.innerHTML = '<button type="button" class="btn small ghost" data-back>← 다른 천체 고르기</button>' +
        '<h3 style="margin:12px 0 0">' + esc(src.name) + '의 호핑법</h3><p class="hint" style="margin:2px 0 0">불러올 단계를 고르세요.</p>' +
        '<ol class="imp-steps">' + src.steps.map(function (s, i) {
          var img = CN.chartCount(s.chart) ? CN.chartSvg(s.chart) : s.fileId ? CN.driveImgTag(s.fileId, 400, 'photo', '', '') : '<div class="ph-icon">' + (i + 1) + '</div>';
          return '<li><input type="checkbox" class="cb" data-i="' + i + '" checked aria-label="' + (i + 1) + '단계 불러오기"><div class="im">' + img + '</div>' +
            '<div class="tx"><div class="hop-n">' + (i + 1) + '단계</div>' + (s.text ? CN.md(s.text) : '<p class="hint">(글 없음)</p>') + '</div></li>';
        }).join('') + '</ol>' +
        '<div class="ed-actions"><button type="button" class="btn primary small" data-go></button></div><div class="msg err" data-err></div>';
      var go = body.querySelector('[data-go]'), cbs = body.querySelectorAll('.cb');
      var count = function () { var n = Array.from(cbs).filter(function (c) { return c.checked; }).length; go.textContent = '고른 ' + n + '단계 불러오기'; go.disabled = !n; };
      cbs.forEach(function (c) { c.onchange = count; });
      count();
      body.querySelector('[data-back]').onclick = showList;
      go.onclick = async function () {
        var pick = src.steps.filter(function (s, i) { return cbs[i].checked; });
        var base = Object.keys(co.hopping).reduce(function (mx, k) { return Math.max(mx, (co.hopping[k].order || 0) + 1); }, 0);
        var patch = {}, now = Date.now();
        pick.forEach(function (s, i) {
          var rec = { text: s.text || '', order: base + i, by: who(), at: now, from: src.id };
          if (CN.chartCount(s.chart)) rec.chart = JSON.parse(JSON.stringify(s.chart));
          else if (s.fileId) rec.fileId = s.fileId;
          patch['h' + CN.uid() + i] = rec;
        });
        go.disabled = true; go.textContent = '불러오는 중…';
        try {
          await CN.db.patch(CN.path('objects', o.id, 'hopping'), patch);
          Object.keys(patch).forEach(function (k) { co.hopping[k] = patch[k]; });
          m.close();
          CN.toast(src.name + '에서 ' + pick.length + '단계를 불러왔어요. ' + o.nameKo + '에 맞게 고쳐 주세요', 3200);
          after();
        } catch (e) {
          var er = body.querySelector('[data-err]'); er.textContent = e.message; er.classList.add('show'); count();
        }
      };
    };
    showList();
  }

  // --- 난이도·장비·장소·추천 (필드별 즉시 저장) ---
  function editMeta(box, state, o, root, opts) {
    editingCount++;
    var co = ensureContent(state, o.id);
    var meta = co.meta = co.meta || {};
    var seedD = (state.seed[o.id] || {}).difficulty || {};
    var lvOpts = function (v) { return '<option value="">—</option>' + CN.LEVELS.map(function (l) { return '<option' + (l === v ? ' selected' : '') + '>' + l + '</option>'; }).join(''); };
    var feat = CN.isEventFeatured(state, o), nfeat = CN.isNightlyFeatured(state, o);
    box.innerHTML =
      '<label class="field">추천</label><div class="chips">' +
      '<button class="chip' + (feat ? ' on' : '') + '" data-feat aria-pressed="' + feat + '">★ 관측회 추천 (11/3 행사)</button>' +
      '<button class="chip' + (nfeat ? ' on' : '') + '" data-nfeat aria-pressed="' + nfeat + '">★ 코스모스 추천 (밤하늘 관측 도우미)</button></div>' +
      '<div class="hint">관측회 추천은 「시간대별 천체 미리보기」(11/3 행사) 맨 위에, 코스모스 추천은 「밤하늘 관측 도우미」 맨 위에 고정돼요. 둘은 따로 켜고 꺼요.</div>' +
      '<label class="field">관측 장소</label><div class="chips">' + Object.keys(CN.PLACES).map(function (k) { var on = !!(meta.places || {})[k]; return '<button class="chip' + (on ? ' on' : '') + '" data-place="' + k + '" aria-pressed="' + on + '">' + CN.PLACES[k] + '</button>'; }).join('') + '</div>' +
      '<label class="field">눈으로 보기(안시) 난이도</label><select data-lv="eye">' + lvOpts(meta.eye || seedD.eye) + '</select>' +
      '<label class="field">사진 찍기(촬영) 난이도</label><select data-lv="photo">' + lvOpts(meta.photo || seedD.photo) + '</select>' +
      '<label class="field">추천 장비</label><div class="chips">' + Object.keys(CN.GEAR).map(function (k) { var on = !!(meta.gear || {})[k]; return '<button class="chip' + (on ? ' on' : '') + '" data-gear="' + k + '" aria-pressed="' + on + '">' + CN.GEAR[k] + '</button>'; }).join('') + '</div>' +
      '<div class="ed-actions"><button class="btn primary small" data-done>편집 마치기</button></div>';
    var save = async function (patch) {
      patch.by = who(); patch.at = Date.now();
      try { await CN.db.patch(CN.path('objects', o.id, 'meta'), patch); Object.assign(meta, patch); CN.toast('저장했어요', 1200); } catch (e) { CN.toast(e.message); }
    };
    var toggle = function (btn, on) { btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on); };
    box.querySelector('[data-feat]').onclick = function () { feat = !feat; toggle(this, feat); save({ featured: feat }); };
    box.querySelector('[data-nfeat]').onclick = function () { nfeat = !nfeat; toggle(this, nfeat); save({ nightly: nfeat }); };
    box.querySelectorAll('[data-place]').forEach(function (b) { b.onclick = function () { var k = b.dataset.place, on = !(meta.places || {})[k]; toggle(b, on); var p = {}; p['places/' + k] = on || null; meta.places = meta.places || {}; meta.places[k] = on; save(p); }; });
    box.querySelectorAll('[data-gear]').forEach(function (b) { b.onclick = function () { var k = b.dataset.gear, on = !(meta.gear || {})[k]; toggle(b, on); var p = {}; p['gear/' + k] = on || null; meta.gear = meta.gear || {}; meta.gear[k] = on; save(p); }; });
    box.querySelectorAll('[data-lv]').forEach(function (s) { s.onchange = function () { var p = {}; p[s.dataset.lv] = s.value || null; save(p); }; });
    box.querySelector('[data-done]').onclick = function () { editingCount = Math.max(0, editingCount - 1); rerender(root, state, o, opts); };
  }

  // --- 기본 정보 바로잡기 ---
  function editBasic(box, state, o, root, opts) {
    editingCount++;
    var co = ensureContent(state, o.id);
    var basic = co.basic = co.basic || {};
    var keys = BASIC_BY_TYPE[o.type] || BASIC_BY_TYPE.other;
    box.innerHTML = '<p class="hint">AI가 넣은 값이 틀렸을 때만 고쳐 주세요. 빈칸으로 두면 AI 값을 써요. (출처를 확인한 값만!)</p>' +
      keys.map(function (k) {
        var f = BASIC_EDITABLE[k];
        return '<label class="field">' + f.label + ' <span class="hint-inline">AI 값: ' + esc(o[k] == null ? '없음' : o[k]) + '</span></label>' +
          '<input type="' + (f.type === 'number' ? 'text" inputmode="decimal' : 'text') + '" data-k="' + k + '" value="' + esc(basic[k] == null ? '' : basic[k]) + '">';
      }).join('') +
      '<div class="ed-actions"><button class="btn primary small" data-save>저장</button><button class="btn ghost small" data-cancel>취소</button></div><div class="msg err" data-err></div>';
    box.querySelector('[data-cancel]').onclick = function () { editingCount = Math.max(0, editingCount - 1); rerender(root, state, o, opts); };
    box.querySelector('[data-save]').onclick = async function () {
      var patch = {}, err = box.querySelector('[data-err]');
      try {
        box.querySelectorAll('input[data-k]').forEach(function (inp) {
          var k = inp.dataset.k, v = inp.value.trim();
          if (v === '') { patch[k] = null; return; }
          if (BASIC_EDITABLE[k].type === 'number') { var n = Number(v.replace(/,/g, '')); if (isNaN(n)) throw new Error(BASIC_EDITABLE[k].label + ': 숫자만 입력해 주세요.'); patch[k] = n; }
          else patch[k] = v.slice(0, 60);
        });
        await pushHistory(o.id, 'basic', Object.assign({}, basic));
        patch.by = who(); patch.at = Date.now();
        await CN.db.patch(CN.path('objects', o.id, 'basic'), patch);
        Object.keys(patch).forEach(function (k) { if (patch[k] === null) delete basic[k]; else basic[k] = patch[k]; });
        CN.toast('저장했어요');
        editingCount = Math.max(0, editingCount - 1); rerender(root, state, o, opts);
      } catch (e) { err.textContent = e.message; err.classList.add('show'); }
    };
  }

  // --- 수정 기록 ---
  async function openHistory(state, o, root, opts) {
    var m = CN.modal('<div class="modal-head"><div class="t">수정 기록 · ' + esc(o.nameKo) + '</div><button class="icon-btn" data-close>닫기</button></div><div data-list class="loading">불러오는 중…</div>');
    var listEl = m.el.querySelector('[data-list]');
    try {
      var hist = (await CN.db.get(CN.path('history', o.id))) || {};
      var keys = Object.keys(hist).sort().reverse();
      listEl.className = '';
      if (!keys.length) { listEl.innerHTML = '<p class="empty">아직 기록이 없어요.</p>'; return; }
      var label = function (s) { return CN.SECTIONS[s] || { photos: '사진', hopping: '호핑법', basic: '기본 정보', meta: '난이도·장비' }[s] || s; };
      listEl.innerHTML = '<p class="hint">각 항목은 "그 시점에 바뀌기 <strong>전</strong> 내용"이에요. 글 항목은 되돌릴 수 있어요.</p>' + keys.map(function (k) {
        var h = hist[k], prev = h.prev;
        var preview = prev == null ? '(비어 있었음)' : prev.v != null ? prev.v : prev.text != null ? prev.text : prev.caption != null ? '사진 ' + (prev.caption || '') :
          prev.chart ? '호핑 그림 (요소 ' + CN.chartCount(prev.chart) + '개)' : prev.fileId ? '사진 (드라이브 휴지통)' : JSON.stringify(prev);
        return '<div class="card hist"><div class="hist-h"><strong>' + esc(label(h.section)) + '</strong> · ' + esc(h.by || '') + ' · ' + CN.fmtWhen(h.at) + '</div>' +
          '<div class="hist-p">' + esc(String(preview).slice(0, 300)) + '</div>' +
          (CN.SECTIONS[h.section] ? '<button class="btn small ghost" data-restore="' + k + '">이 내용으로 되돌리기</button>' : '') + '</div>';
      }).join('');
      listEl.querySelectorAll('[data-restore]').forEach(function (b) {
        b.onclick = async function () {
          var h = hist[b.dataset.restore];
          if (!confirm(label(h.section) + ' 칸을 이 시점 내용으로 되돌릴까요?')) return;
          try {
            var path = CN.path('objects', o.id, h.section);
            var curNow = await CN.db.get(path);
            await pushHistory(o.id, h.section, curNow && curNow.v ? { v: curNow.v } : null);
            var value = h.prev && h.prev.v ? { v: h.prev.v, by: who() + ' (되돌림)', at: Date.now() } : null;
            await CN.db.put(path, value);
            var co = ensureContent(state, o.id);
            if (value) co[h.section] = value; else delete co[h.section];
            m.close(); CN.toast('되돌렸어요'); rerender(root, state, o, opts);
          } catch (e) { CN.toast(e.message); }
        };
      });
    } catch (e) { listEl.className = ''; listEl.innerHTML = '<div class="msg err show">' + esc(e.message) + '</div>'; }
  }

  // 팝업으로 열기 (시간대별 미리보기에서 사용)
  CN.openObjectModal = function (state, id, extra) {
    var o = state.byId[id];
    if (!o) return;
    var m = CN.modal('<div class="modal-head"><div class="t">' + esc(o.nameKo) + '</div><button class="icon-btn" data-close>닫기</button></div><div data-obj></div>', {
      beforeClose: function () { return !CN.isEditing() || confirm('편집 중인 내용이 있어요. 닫을까요? (쓰던 글은 이 기기에 임시저장돼 있어요)'); },
      onClose: function () { editingCount = 0; },
    });
    var x = Object.assign({}, extra || {});
    if (!x.openRelated) x.openRelated = function (rid) { CN.openObjectModal(state, rid, extra); };
    CN.renderObject(m.el.querySelector('[data-obj]'), state, o, Object.assign({ popup: true }, x));
    return m;
  };
})();
