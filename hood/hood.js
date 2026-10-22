// 2026 코스모스 후드티 설문 — index.html(로그인+투표) / status.html(현황) 공용
// 데이터: years/{year}/cosmosHood/votes/{학번} = { name, grade, ban, num, designs:[1..7], designEtc, color, colorEtc, size, at }
(function () {
  var KEY = 'cosmosHoodAuth';

  window.DB_URL = 'https://gwangsu-on-default-rtdb.firebaseio.com';
  window.TEACHER_ID = '3000';
  window.TEACHER_NAME = '김병선';

  // 시안 = PDF 쪽 순서 (img/p-N.png)
  window.DESIGNS = [
    { key: 1, label: '별칭 + 공식명칭 + 알파벳 전부' },
    { key: 2, label: '별칭만 + 알파벳 전부' },
    { key: 3, label: '별칭만 + 알파벳 α만' },
    { key: 4, label: '별칭만 + 알파벳 없음' },
    { key: 5, label: '공식명칭만 + 알파벳 전부' },
    { key: 6, label: '공식명칭만 + 알파벳 α만' },
    { key: 7, label: '공식명칭만 + 알파벳 없음' },
  ];
  window.COLORS = [
    { key: 'blue',  label: '파랑(단색)', swatch: '#2f6fd6', note: '무료! (지혁이 아버지 만세!) · S/M/L만 가능' },
    { key: 'navy',  label: '네이비',     swatch: '#1b2650' },
    { key: 'black', label: '블랙',       swatch: '#111111' },
    { key: 'etc',   label: '그외 제안',  swatch: null },
  ];
  window.SIZES = ['S(90)', 'M(95)', 'L(100)', 'XL(105)', '2XL(110)', '3XL(115)', '4XL(120)'];
  window.BLUE_SIZES = ['S(90)', 'M(95)', 'L(100)'];

  window.getHoodUser = function () {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null');
      return d && d.id && d.name ? d : null;
    } catch (e) { return null; }
  };
  window.setHoodUser = function (s) { localStorage.setItem(KEY, JSON.stringify(s)); };
  window.clearHoodUser = function () { localStorage.removeItem(KEY); };

  window.whoLabel = function (s) {
    if (!s) return '';
    if (s.isTeacher) return s.name + ' 선생님';
    return s.grade + '학년 ' + s.ban + '반 ' + s.num + '번 ' + s.name;
  };

  window.esc = function (str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  var yearCache = null;
  window.loadYear = async function () {
    if (yearCache) return yearCache;
    var cfg = await fetch(DB_URL + '/config/current.json').then(function (r) { return r.json(); });
    yearCache = (cfg && cfg.year) || new Date().getFullYear();
    return yearCache;
  };
  window.hoodBase = async function () { return DB_URL + '/years/' + (await loadYear()) + '/cosmosHood'; };

  window.colorLabel = function (key) {
    var c = COLORS.find(function (x) { return x.key === key; });
    return c ? c.label : (key || '');
  };
})();
