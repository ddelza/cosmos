// 카탈로그(AI 입력 기본 정보) + 작년 자료(seed) + 학생 편집 내용(DB) 불러오기
(function () {
  'use strict';
  var CN = window.CN;

  CN.TYPES = {
    star:    { ko: '별',   icon: '⭐', order: 2 },
    planet:  { ko: '행성', icon: '🪐', order: 1 },
    moon:    { ko: '위성', icon: '🌙', order: 1.5 },
    cluster: { ko: '성단', icon: '✨', order: 3 },
    nebula:  { ko: '성운', icon: '☁️', order: 4 },
    galaxy:  { ko: '은하', icon: '🌀', order: 5 },
    other:   { ko: '기타', icon: '•', order: 6 },
    constellation: { ko: '별자리', icon: '✦', order: 7 },
  };

  // 종류 칩: '전체'는 혼자, 나머지는 여러 개 함께 선택 (★추천은 다른 종류와 '그리고'로 겹침)
  CN.typeFilter = {
    toggle: function (types, t) {
      if (t === 'all') return [];
      var i = types.indexOf(t), next = types.slice();
      if (i >= 0) next.splice(i, 1); else next.push(t);
      return next;
    },
    // planetWithMoon: '행성' 칩이 달·위성까지 포함하는 화면(미리보기)
    match: function (state, o, types, planetWithMoon) {
      if (!types || !types.length) return true;
      if (types.indexOf('featured') >= 0 && !CN.isFeatured(state, o)) return false;
      var ts = types.filter(function (t) { return t !== 'featured'; });
      if (!ts.length) return true;
      return ts.some(function (t) { return t === o.type || (planetWithMoon && t === 'planet' && o.type === 'moon'); });
    },
    // chips: [[값, 표시]] — 컨테이너에 그리고 바뀌면 onChange(types)
    render: function (el, chips, types, onChange) {
      var draw = function () {
        el.innerHTML = chips.map(function (x) {
          var on = x[0] === 'all' ? !types.length : types.indexOf(x[0]) >= 0;
          return '<button class="chip' + (on ? ' on' : '') + '" data-type="' + x[0] + '" aria-pressed="' + on + '">' + x[1] + '</button>';
        }).join('');
        el.querySelectorAll('[data-type]').forEach(function (b) {
          b.onclick = function () { types = CN.typeFilter.toggle(types, b.dataset.type); draw(); onChange(types); };
        });
      };
      draw();
    },
  };
  CN.SECTIONS = { points: '관측포인트', description: '설명', story: '관련 이야기' };
  CN.PLACES = { lab: '과학실', deck: '3층 데크', roof: '옥상' };
  CN.GEAR = { eye: '맨눈', binoc: '쌍안경', scope: '소형 망원경', dob: '10인치 돕소니안', smart: '스마트 망원경(촬영)' };
  CN.LEVELS = ['최하', '하', '중하', '중', '중상', '상', '최상', '∞'];

  async function getJson(path, fallback) {
    try {
      var r = await fetch(path + (path.indexOf('?') < 0 ? '?v=' : '&v=') + CN.VERSION, { cache: 'no-cache' });
      if (!r.ok) return fallback;
      return await r.json();
    } catch (e) { return fallback; }
  }

  var cache = null;
  // 반환: {list, byId, credits, seed, content, config, dbOk}
  // onUpdate(state): DB 내용이 정적 스냅숏보다 늦게 도착하면 다시 호출됨
  CN.loadAll = async function (onUpdate) {
    if (cache) return cache;
    var res = await Promise.all([
      getJson(CN.asset('data/catalog.json'), []),
      getJson(CN.asset('data/credits.json'), {}),
      getJson(CN.asset('data/seed.json'), {}),
      getJson(CN.asset('data/content.json'), {}),
      getJson(CN.asset('img/uploads/manifest.json'), {}),
      CN.getConfig(),
      getJson(CN.asset('data/constellations.json'), []),
      getJson(CN.asset('data/nightly-picks.json'), { groups: {} }),
    ]);
    var list = (res[0] || []).concat(res[6] || []);
    var byId = {};
    list.forEach(function (o) { byId[o.id] = o; });
    CN.staticPhotos = res[4] || {};
    var picks = res[7] || { groups: {} };
    var pickSet = {};
    Object.keys(picks.groups || {}).forEach(function (g) { (picks.groups[g] || []).forEach(function (id) { pickSet[id] = g; }); });
    var state = { list: list, byId: byId, credits: res[1] || {}, seed: res[2] || {}, content: res[3] || {}, config: res[5], dbOk: false, nightlyPicks: pickSet, nightlyInfo: picks };
    cache = state;

    // DB 편집 내용(최신) — 실패해도 스냅숏으로 동작
    var dbPromise = CN.db.get(CN.path('objects')).then(function (objs) {
      state.content = objs || {};
      state.dbOk = true;
      return state;
    }).catch(function () { return state; });

    // 스냅숏이 비어 있으면 DB를 기다렸다가 반환, 있으면 먼저 반환하고 나중에 갱신
    if (!Object.keys(state.content).length) { await dbPromise; }
    else if (onUpdate) { dbPromise.then(function (s) { if (s.dbOk) onUpdate(s); }); }
    return state;
  };

  // 한 천체의 편집 내용 + 작년 자료를 화면용으로 합치기
  CN.contentOf = function (state, id) {
    var c = state.content[id] || {};
    var s = state.seed[id] || {};
    var out = { meta: c.meta || {}, basic: c.basic || {}, photos: c.photos || {}, hopping: c.hopping || {} };
    Object.keys(CN.SECTIONS).forEach(function (k) {
      if (c[k] && c[k].v) out[k] = { v: c[k].v, by: c[k].by, at: c[k].at };
      else if (s[k] && s[k].v) out[k] = { v: s[k].v, seed: true, src: s[k].src };
      else out[k] = null;
    });
    // 난이도: DB 우선, 없으면 작년 자료
    if (!out.meta.eye && s.difficulty) { out.seedDifficulty = s.difficulty; }
    return out;
  };

  CN.sortedPhotos = function (photos) {
    return Object.keys(photos || {}).map(function (k) { return Object.assign({ key: k }, photos[k]); })
      .filter(function (p) { return p.fileId; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0) || (a.at || 0) - (b.at || 0); });
  };

  // 추천은 두 가지: 11/3 행사용 「관측회 추천」(meta.featured) / 밤하늘 관측 도우미용 「코스모스 추천」(meta.nightly)
  // 페이지가 window.CN_FEATURED_MODE = 'nightly' 로 정하면 isFeatured가 코스모스 추천을 씀
  CN.featuredMode = window.CN_FEATURED_MODE || 'event';
  CN.featuredLabel = function () { return CN.featuredMode === 'nightly' ? '코스모스 추천' : '관측회 추천'; };
  CN.isNightlyFeatured = function (state, o) {
    var m = (state.content[o.id] || {}).meta || {};
    return m.nightly === undefined || m.nightly === null ? !!(state.nightlyPicks && state.nightlyPicks[o.id]) : !!m.nightly;
  };
  CN.isFeatured = function (state, o) {
    if (CN.featuredMode === 'nightly') return CN.isNightlyFeatured(state, o);
    return CN.isEventFeatured(state, o);
  };
  CN.isEventFeatured = function (state, o) {
    var m = (state.content[o.id] || {}).meta || {};
    return m.featured === undefined ? !!o.featured : !!m.featured;
  };

  // 목록용 썸네일 <img> — 학생 사진 > 기본 사진 > 별 그림 > 아이콘
  CN.thumbHtml = function (state, o, w) {
    w = w || 250;
    var photos = CN.sortedPhotos((state.content[o.id] || {}).photos);
    var fallback = state.credits[o.id] ? CN.asset('img/objects/' + o.id + '.jpg') : (o.type === 'star' ? CN.starImg(o.bv, o.mag) : '');
    if (photos.length) return CN.driveImgTag(photos[0].fileId, w, 'photo thumb', fallback, o.nameKo);
    if (fallback) return '<img class="photo thumb' + (o.type === 'star' ? ' no-night-dim' : '') + '" loading="lazy" decoding="async" src="' + CN.esc(fallback) + '" alt="' + CN.esc(o.nameKo) + '">';
    return '<div class="thumb ph-icon">' + (CN.TYPES[o.type] || CN.TYPES.other).icon + '</div>';
  };

  CN.typeLabel = function (o) {
    var t = CN.TYPES[o.type] || CN.TYPES.other;
    return o.subtype || t.ko;
  };

  // 검색용 문자열
  CN.searchText = function (o) {
    return [o.nameKo, o.nameEn, o.catalog, o.altCatalog, (o.aliasesKo || []).join(' '), o.constellationKo, o.subtype, o.id]
      .join(' ').toLowerCase().replace(/\s+/g, '');
  };
})();
