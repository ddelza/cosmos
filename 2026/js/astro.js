// 천문 계산 — astronomy-engine(js/vendor/astronomy.browser.min.js, MIT) 위에 얇게 감싼 것
// 브라우저(전역 Astronomy)와 Node(require) 둘 다에서 동작 → tools/test-astro.mjs로 단위 테스트
(function (root) {
  'use strict';
  var A = root.Astronomy || (typeof require === 'function' ? require(process.env.ASTRONOMY_ENGINE_PATH || 'astronomy-engine') : null);

  var LOC = (root.CN && root.CN.LOC) || { lat: 37.47304, lon: 127.3196, elev: 50 };
  var observer = new A.Observer(LOC.lat, LOC.lon, LOC.elev);

  var DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];

  var Astro = {
    observer: observer,
    lat: LOC.lat,
    lon: LOC.lon,
    locName: LOC.name || '광수중학교',

    // 관측 위치 바꾸기 (nightly.html)
    setLocation: function (lat, lon, elev, name) {
      observer = new A.Observer(lat, lon, elev || 0);
      this.observer = observer; this.lat = lat; this.lon = lon; this.locName = name || '';
    },

    // 'YYYY-MM-DD' + 'HH:MM' (한국 표준시) → Date
    kst: function (dateStr, hhmm) { return new Date(dateStr + 'T' + hhmm + ':00+09:00'); },

    // 8방위: 북(337.5°~22.5°) · 북동 · 동 · 남동 · 남 · 남서 · 서 · 북서
    dir8: function (az) { return DIRS[Math.round((((az % 360) + 360) % 360) / 45) % 8]; },

    // 방향순 정렬 키: 남서 → 서 → 북서 → 북 → 북동 → 동 → 남동 → 남 (남서 구간 시작 202.5°부터)
    dirKey: function (az) { return (((az - 202.5) % 360) + 360) % 360; },

    // 팔을 뻗은 주먹 하나 ≈ 10° (70° 이상은 '천정 근처')
    fists: function (alt) {
      if (alt >= 70) return '천정 근처';
      var n = Math.round(alt / 5) / 2; // 0.5 단위
      if (n < 0.5) return '지평선 바로 위';
      var whole = Math.floor(n), half = n - whole >= 0.5;
      return '주먹 ' + (whole ? whole + '개' : '') + (half ? (whole ? ' 반' : '반 개') : '');
    },

    // 시각별 J2000→그날 기준 회전행렬 (세차·장동) — 같은 시각엔 재사용
    _rotCache: {},
    _rot: function (date) {
      var k = date.getTime();
      if (!this._rotCache[k]) this._rotCache[k] = A.Rotation_EQJ_EQD(A.MakeTime(date));
      return this._rotCache[k];
    },

    // 고정 천체(J2000 적경 h, 적위 °) → {alt, az}
    fixed: function (raH, decDeg, date) {
      var time = A.MakeTime(date);
      var vec = A.VectorFromSphere(new A.Spherical(decDeg, raH * 15, 1), time);
      var eqd = A.EquatorFromVector(A.RotateVector(this._rot(date), vec)); // ra는 시간 단위로 돌아옴
      var h = A.Horizon(time, observer, eqd.ra, eqd.dec, 'normal');
      return { alt: h.altitude, az: h.azimuth };
    },

    // 태양계 천체(astronomy-engine 이름: 'Saturn', 'Moon', 'Sun' …) → {alt, az, ra, dec, distAU}
    body: function (name, date) {
      var time = A.MakeTime(date);
      var eq = A.Equator(name, time, observer, true, true);
      var h = A.Horizon(time, observer, eq.ra, eq.dec, 'normal');
      return { alt: h.altitude, az: h.azimuth, ra: eq.ra, dec: eq.dec, distAU: eq.dist };
    },

    // 카탈로그 객체 하나의 위치
    position: function (obj, date) {
      if (obj.dynamic && obj.body) return this.body(obj.body, date);
      if (obj.ra == null || obj.dec == null) return null;
      return this.fixed(obj.ra, obj.dec, date);
    },

    // 행성 그날 밝기·거리
    planetNow: function (name, date) {
      var time = A.MakeTime(date);
      var il = A.Illumination(name, time);
      return { mag: il.mag, geoAU: il.geo_dist, helioAU: il.helio_dist, phase: il.phase_fraction };
    },

    // 달: 조명 비율, 월령(일), 위상 이름, 다음 월출·월몰
    moonInfo: function (date) {
      var time = A.MakeTime(date);
      var angle = A.MoonPhase(time);                // 0=삭, 90=상현, 180=망, 270=하현
      var illum = A.Illumination('Moon', time).phase_fraction;
      var age = angle / 360 * 29.530588;
      var name = angle < 10 || angle >= 350 ? '삭(그믐 직후)' : angle < 80 ? '초승달' : angle < 100 ? '상현달' : angle < 170 ? '상현~보름 사이(차오르는 달)'
        : angle < 190 ? '보름달' : angle < 260 ? '보름~하현 사이(기우는 달)' : angle < 280 ? '하현달' : '그믐달';
      var dayStart = new Date(date.getTime() - 12 * 3600e3);
      var rise = A.SearchRiseSet('Moon', observer, +1, A.MakeTime(dayStart), 2);
      var set = A.SearchRiseSet('Moon', observer, -1, A.MakeTime(dayStart), 2);
      return { angle: angle, illum: illum, age: age, name: name, rise: rise && rise.date, set: set && set.date };
    },

    // 해 고도로 하늘 상태
    sky: function (date) {
      var sun = this.body('Sun', date).alt;
      var s;
      if (sun > -0.8) s = { key: 'day', label: '낮', desc: '아직 해가 떠 있어요.' };
      else if (sun > -6) s = { key: 'civil', label: '시민박명', desc: '해가 막 졌어요. 하늘이 꽤 밝아서 행성과 1등성 정도만 보여요.' };
      else if (sun > -12) s = { key: 'nautical', label: '항해박명', desc: '하늘이 아직 푸르스름해요. 토성·밝은 별은 잘 보이지만 어두운 성운·은하는 보기 어려워요.' };
      else if (sun > -18) s = { key: 'astro', label: '천문박명', desc: '거의 어두워졌어요. 성단은 잘 보이고, 희미한 성운·은하는 조금 더 기다리면 좋아요.' };
      else s = { key: 'night', label: '완전한 밤', desc: '하늘이 완전히 어두워졌어요. 성운·은하까지 관측하기 좋은 시간이에요.' };
      s.sunAlt = sun;
      return s;
    },

    // 해 질 녘 시각들
    sunTimes: function (dateStr) {
      var noon = A.MakeTime(new Date(dateStr + 'T12:00:00+09:00'));
      var set = A.SearchRiseSet('Sun', observer, -1, noon, 1);
      var dark = A.SearchAltitude('Sun', observer, -1, noon, 1, -18);
      return { sunset: set && set.date, dark: dark && dark.date };
    },

    // 위도에서 볼 수 있는 최고 고도(남중 고도) — 0 미만이면 이 위도에선 안 뜸
    maxAlt: function (decDeg) { return 90 - Math.abs(this.lat - decDeg); },

    // base 시각이 들어 있는 밤(또는 그 다음 밤)의 일몰·박명·일출 — 기기 시간대 기준이 아니라 절대 시각(Date)
    // 해가 안 지거나 안 뜨는 곳(극지방)은 null 반환 항목이 생김
    nightWindow: function (base) {
      var start = new Date(base.getTime());
      // 오전(정오 전)이면 전날 밤으로 봄
      var noon = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0);
      if (start < noon) noon = new Date(noon.getTime() - 864e5);
      var t = A.MakeTime(noon);
      var set = A.SearchRiseSet('Sun', observer, -1, t, 1.2);
      var from = set ? set.date : new Date(noon.getTime() + 6 * 3600e3);
      var rise = A.SearchRiseSet('Sun', observer, +1, A.MakeTime(from), 1.2);
      var dark = A.SearchAltitude('Sun', observer, -1, t, 1.2, -18);
      var dawn = dark ? A.SearchAltitude('Sun', observer, +1, A.MakeTime(dark.date), 1.2, -18) : null;
      return { noon: noon, sunset: set && set.date, sunrise: rise && rise.date, dark: dark && dark.date, dawn: dawn && dawn.date };
    },

    // 한국 시각 HH:MM
    hhmm: function (d) {
      if (!d) return '';
      var k = new Date(d.getTime() + 9 * 3600e3);
      return String(k.getUTCHours()).padStart(2, '0') + ':' + String(k.getUTCMinutes()).padStart(2, '0');
    },
  };

  root.Astro = Astro;
  if (typeof module === 'object' && module.exports) module.exports = Astro;
})(typeof window !== 'undefined' ? window : globalThis);
