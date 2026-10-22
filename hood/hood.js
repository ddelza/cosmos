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
  // 코스모스 멤버 — 현황 페이지에서 투표함(초록)/아직(빨강) 표시
  window.MEMBERS = [
    '최지혁', '이하리', '박예승', '김태연', '심가온', '유승연', '박혜나', '백서후',
    '정다율', '배주은', '이효서', '이예원', '이세은', '이세아', '윤나현', '한율', '예연희', '안예찬',
    '이시유', '김재혁', '박서이', '오지훈', '최지원', '이동빈', '윤서연', '정다빈',
    '이상호', '강승현', '김인구', '이석호', '이문혁', '박도윤', '홍다연', '이연우', '이이나', '박재인',
    '박찬율', '임주영', '최재우', '곽서율', '박가빈', '문하은', '김병선',
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
