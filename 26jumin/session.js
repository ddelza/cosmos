// 2026 주민 천체관측회 — 로그인 세션 공용 스크립트 (sr-exhibition/session.js와 같은 구조)
// index.html에서 학번/이름 확인 후 setJmStudent()로 저장, 다른 페이지는 requireJmLogin()만 호출.
(function () {
  var KEY = 'jumin26Auth';

  window.DB_URL = 'https://gwangsu-on-default-rtdb.firebaseio.com';
  window.TEACHER_ID = '3000';

  window.getJmStudent = function () {
    try {
      var data = JSON.parse(localStorage.getItem(KEY) || 'null');
      return data && data.id && data.name ? data : null;
    } catch (e) { return null; }
  };
  window.setJmStudent = function (s) { localStorage.setItem(KEY, JSON.stringify(s)); };
  window.clearJmStudent = function () { localStorage.removeItem(KEY); };

  window.requireJmLogin = function () {
    var s = window.getJmStudent();
    if (!s) {
      alert('먼저 메인 페이지에서 학번과 이름으로 입장해 주세요.');
      location.href = location.pathname.replace(/[^/]*$/, '') + 'index.html';
      return null;
    }
    return s;
  };

  window.jmWhoLabel = function (s) {
    if (!s) return '';
    if (s.isTeacher) return s.name + ' 선생님 (교사 계정)';
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
  // 이 행사 데이터 루트
  window.jmBase = async function () { return DB_URL + '/years/' + (await loadYear()) + '/jumin26'; };

  // 게시판 장소 정의 — index.html / board.html / roles.html 공용
  window.PLACES = [
    { key: 'lab',  icon: '🔬', title: '과학실', sub: '전시, 교육 등' },
    { key: 'deck', icon: '🔭', title: '3층 데크', sub: '쌍안경 등' },
    { key: 'roof', icon: '🌌', title: '옥상', sub: '천체관측' },
  ];
})();
