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
    ]);
    var list = res[0] || [];
    var byId = {};
    list.forEach(function (o) { byId[o.id] = o; });
    CN.staticPhotos = res[4] || {};
    var state = { list: list, byId: byId, credits: res[1] || {}, seed: res[2] || {}, content: res[3] || {}, config: res[5], dbOk: false };
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

  CN.isFeatured = function (state, o) {
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
