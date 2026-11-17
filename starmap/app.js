// 3D 우리은하 성도 — 지구에서 본 하늘(Stellarium식) ↔ 은하에서 본 모습
// 좌표: 모든 천체를 J2000 적도 직교좌표(태양 중심, 광년)에 두고, 카메라만 옮긴다.
//  · 지구 모드: 카메라 = 태양(원점), 평사도법(Stellarium 기본 투영)
//  · 은하 모드: 카메라가 은하 좌표계에서 표적 둘레를 도는 원근 투영
// 별: data/stars.bin(Stellarium 카탈로그에서 추출) · 대상 천체: ../2026/data/catalog.json(밤하늘 관측 도우미와 같은 목록)
(function () {
  'use strict';
  var A = window.Astronomy, CN = window.CN, esc = CN.esc;
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var LY_KPC = 3261.56, R0 = 26700, SUN_Z = 65;          // 태양–은하 중심 거리, 태양의 은하면 위 높이(광년)
  // 적도(J2000) → 은하 좌표 회전행렬 (행 우선)
  var G = [-0.0548755604, -0.8734370902, -0.4838350155, 0.4941094279, -0.4448296300, 0.7469822445, -0.8676661490, -0.1980763734, 0.4559837762];
  var GT = m3T(G);
  var GC_W = m3v(GT, [R0, 0, -SUN_Z]);                    // 은하 중심의 위치
  var GAL_FOV = 50;

  // ---------- 작은 수학 도구 ----------
  function m3T(m) { return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]; }
  function m3v(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
  function m3mul(a, b) {
    var o = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return o;
  }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function sph(lonDeg, latDeg) { var l = lonDeg * D2R, b = latDeg * D2R; return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)]; }
  // 앞 방향 f(단위벡터)와 위쪽 기준(z축)으로 보기 행렬: 행 = 오른쪽, 위, −앞
  function viewFrom(f) {
    var r = norm(cross(f, [0, 0, 1])), u = cross(r, f);
    return [r[0], r[1], r[2], u[0], u[1], u[2], -f[0], -f[1], -f[2]];
  }
  function m2q(m) {
    var t = m[0] + m[4] + m[8], q;
    if (t > 0) { var s = Math.sqrt(t + 1) * 2; q = [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, s / 4]; }
    else if (m[0] > m[4] && m[0] > m[8]) { var s1 = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; q = [s1 / 4, (m[1] + m[3]) / s1, (m[2] + m[6]) / s1, (m[7] - m[5]) / s1]; }
    else if (m[4] > m[8]) { var s2 = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; q = [(m[1] + m[3]) / s2, s2 / 4, (m[5] + m[7]) / s2, (m[2] - m[6]) / s2]; }
    else { var s3 = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; q = [(m[2] + m[6]) / s3, (m[5] + m[7]) / s3, s3 / 4, (m[3] - m[1]) / s3]; }
    return q;
  }
  function q2m(q) {
    var x = q[0], y = q[1], z = q[2], w = q[3];
    return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
  }
  function mslerp(a, b, t) {
    if (t <= 0) return a; if (t >= 1) return b;
    var p = m2q(a), q = m2q(b), d = p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3];
    if (d < 0) { q = q.map(function (x) { return -x; }); d = -d; }
    var th = Math.acos(clamp(d, -1, 1)), s = Math.sin(th), wa, wb;
    if (s < 1e-5) { wa = 1 - t; wb = t; } else { wa = Math.sin((1 - t) * th) / s; wb = Math.sin(t * th) / s; }
    var r = [0, 1, 2, 3].map(function (i) { return wa * p[i] + wb * q[i]; }), l = Math.hypot(r[0], r[1], r[2], r[3]);
    return q2m(r.map(function (x) { return x / l; }));
  }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function niceStep(x) { var p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
  var pad = function (n) { return String(n).padStart(2, '0'); };

  // ---------- 상태 ----------
  var KEY = 'cnStarmap';
  var S = {
    mode: 'earth', mount: 'az', fov: 70, lon: 180, lat: 28,         // 지구 모드 시선: 방위·고도(또는 적경·적위)
    time: Date.now(), rate: 1, playing: true,
    lat0: CN.LOC.lat, lon0: CN.LOC.lon, place: CN.LOC.name,
    f: { conLines: true, conNames: true, bounds: false, eqGrid: false, azGrid: false, ecliptic: false, galEq: false,
      ground: true, atm: false, cardinal: true, dso: true, starNames: true, planets: true, milky: true,
      gNames: true, arms: true, rings: true, stems: false, sight: true },
    types: { star: true, cluster: true, nebula: true, galaxy: true },
    center: 'gc',
  };
  try {
    var sv = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (sv) { ['mount', 'lat0', 'lon0', 'place'].forEach(function (k) { if (sv[k] !== undefined) S[k] = sv[k]; }); Object.assign(S.f, sv.f || {}); Object.assign(S.types, sv.types || {}); }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ mount: S.mount, lat0: S.lat0, lon0: S.lon0, place: S.place, f: S.f, types: S.types })); } catch (e) {} }

  var O = { yaw: 0, pitch: 0.6, dist: 130000, target: [0, 0, 0] };   // 은하 모드 궤도 카메라(은하 좌표계 각도, 표적은 적도 좌표)
  var tr = 0;                 // 0 = 지구, 1 = 은하 (전환 중엔 사이값)
  var anim = null, sel = null, tracking = false;
  var observer = new A.Observer(S.lat0, S.lon0, 50);
  var W = 1, H = 1, dpr = 1;
  var M = [1, 0, 0, 0, 1, 0, 0, 0, 1], cam = [0, 0, 0], Fhor = M, fovRad = 1, sunHor = [0, 0, -1], dayF = 0, twF = 0;
  var state = null, objs = [], bodies = [], cons = [], sky = null;
  var starN = 0, sPos = null, sMag = null, sAbs = null, sBv = null, sHip = null, starObj = {};
  var caption = { text: '', until: 0 };

  // ---------- WebGL ----------
  var glc = document.getElementById('gl'), ov = document.getElementById('ov'), ctx = ov.getContext('2d');
  var gl = glc.getContext('webgl', { antialias: true, alpha: false, premultipliedAlpha: false });
  if (!gl) { document.getElementById('loading').textContent = '이 브라우저는 WebGL을 지원하지 않아 성도를 그릴 수 없어요.'; return; }

  var PROJ = [
    'uniform mat3 uM; uniform vec3 uCam; uniform float uFov, uAspect, uProj;',
    'vec4 project(vec3 v) {',
    '  vec3 n = v / max(length(v), 1e-9);',
    '  float ks = 1.0 / (2.0 * tan(uFov * 0.25)), kp = 1.0 / tan(uFov * 0.5);',
    '  vec4 s = vec4(2.0 * n.xy / max(1.0 - n.z, 1e-3) * ks, 0.0, 1.0);',
    '  vec4 p = vec4(n.xy * kp, 0.0, -n.z);',
    '  vec4 o = mix(s, p, uProj); o.x /= uAspect;',
    '  if (uProj < 0.5 && n.z > 0.8) o.z = 2.0 * o.w;',
    '  return o;',
    '}'].join('\n');
  function prog(vs, fs, attrs) {
    var p = gl.createProgram();
    [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, 'precision mediump float;\n' + fs]].forEach(function (x) {
      var s = gl.createShader(x[0]); gl.shaderSource(s, x[1]); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    });
    attrs.forEach(function (a, i) { gl.bindAttribLocation(p, i, a); });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
    return { p: p, u: u };
  }
  var pStar = prog('precision highp float;\nattribute vec3 aPos; attribute float aMag; attribute vec3 aCol;\n' + PROJ +
    'uniform float uLim, uDpr, uFloor; varying vec4 vCol;\n' +
    'void main() { vec3 v = uM * (aPos - uCam); float d = length(v);\n' +
    '  float m = aMag + 5.0 * log(max(d, 1e-4) / 32.6156) / 2.302585;\n' +
    '  float lum = pow(10.0, 0.4 * (uLim - m));\n' +
    '  float r = clamp(0.95 * pow(lum, 0.25), 0.0, 15.0);\n' +
    '  float a = max(pow(clamp(lum, 0.0, 1.0), 1.4), uFloor);\n' +
    '  gl_PointSize = (max(r, 0.9) * 2.0 + 2.0) * uDpr;\n' +
    '  vCol = vec4(mix(vec3(1.0), aCol, 0.8), a);\n' +
    '  gl_Position = project(v);\n' +
    '  if (d < 1e-3 || a < 0.0015) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }',
    'varying vec4 vCol; void main() { float q = length(gl_PointCoord - 0.5) * 2.0; float g = exp(-q * q * 5.0) - 0.007; if (g <= 0.0) discard; gl_FragColor = vec4(vCol.rgb * vCol.a * g * 1.25, 1.0); }',
    ['aPos', 'aMag', 'aCol']);
  var pGal = prog('precision highp float;\nattribute vec3 aPos; attribute vec3 aCol; attribute float aSize;\n' + PROJ +
    'uniform float uDpr, uPxRad, uGalA, uNearA, uNearB, uSizeK; varying vec3 vCol;\n' +
    'void main() { vec3 v = uM * (aPos - uCam); float d = length(v);\n' +
    '  float dia = 2.0 * aSize * uSizeK / d * uPxRad * uDpr, mx = 90.0 * uDpr;\n' +
    '  float a = uGalA * clamp(dia / 2.5, 0.07, 1.0);\n' +
    '  if (dia > mx) a *= (mx / dia) * (mx / dia);\n' +
    '  a *= smoothstep(uNearA, uNearB, d);\n' +
    '  gl_PointSize = clamp(dia, 2.5, mx); vCol = aCol * a;\n' +
    '  gl_Position = project(v); }',
    'varying vec3 vCol; void main() { float q = length(gl_PointCoord - 0.5) * 2.0; float g = exp(-q * q * 3.2) - 0.04; if (g <= 0.0) discard; gl_FragColor = vec4(vCol * g, 1.0); }',
    ['aPos', 'aCol', 'aSize']);
  var pLine = prog('precision highp float;\nattribute vec3 aPos;\n' + PROJ +
    'uniform mat3 uPre; uniform float uScale, uDir; uniform vec3 uOff;\n' +
    'void main() { vec3 p = uPre * (aPos * uScale) + uOff; gl_Position = project(uM * (p - uCam * (1.0 - uDir))); }',
    'uniform vec4 uColor; void main() { gl_FragColor = vec4(uColor.rgb * uColor.a, 1.0); }', ['aPos']);
  var pSky = prog('attribute vec2 aPos; varying vec2 vN; void main() { vN = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }',
    'varying vec2 vN; uniform mat3 uToHor; uniform vec3 uSun; uniform float uFov, uAspect, uPass, uAtm, uAlpha;\n' +
    'void main() { float k = 2.0 * tan(uFov * 0.25); vec2 X = vec2(vN.x * uAspect, vN.y) * k; float r2 = dot(X, X);\n' +
    '  vec3 h = uToHor * (vec3(4.0 * X, r2 - 4.0) / (r2 + 4.0)); float alt = h.z;\n' +
    '  float day = smoothstep(-0.10, 0.12, uSun.z), tw = smoothstep(-0.31, -0.02, uSun.z);\n' +
    '  if (uPass < 0.5) { if (alt < 0.0) discard; float up = pow(clamp(alt, 0.0, 1.0), 0.45);\n' +
    '    vec3 dayC = mix(vec3(0.62, 0.76, 0.93), vec3(0.16, 0.36, 0.78), up);\n' +
    '    vec3 twC = mix(vec3(0.20, 0.16, 0.22), vec3(0.02, 0.04, 0.12), up);\n' +
    '    float toward = max(dot(normalize(h.xy + 1e-5), normalize(uSun.xy + 1e-5)), 0.0);\n' +
    '    vec3 glow = vec3(0.9, 0.42, 0.12) * pow(toward, 3.0) * (1.0 - up) * tw * (1.0 - day) * 0.8;\n' +
    '    gl_FragColor = vec4(mix(twC * tw + glow, dayC, day) * uAlpha, 1.0);\n' +
    '  } else { if (alt >= 0.0) discard;\n' +
    '    vec3 g = mix(vec3(0.030, 0.037, 0.028), vec3(0.17, 0.21, 0.13), day * uAtm);\n' +
    '    g *= 1.0 + 0.9 * smoothstep(-0.07, 0.0, alt);\n' +
    '    gl_FragColor = vec4(g, uAlpha); } }', ['aPos']);

  function buf(data, usage) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW); return b; }
  function colM(m) { return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]); }
  var ID = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  var B = {};
  B.quad = buf(new Float32Array([-1, -1, 3, -1, -1, 3]));

  // 격자(경도 15°·위도 10° 간격), 단위원, 십자
  (function () {
    var g = [], a, b, st = 3;
    for (a = 0; a < 360; a += 15) for (b = -90; b < 90; b += st) g.push.apply(g, sph(a, b).concat(sph(a, b + st)));
    for (b = -80; b <= 80; b += 10) for (a = 0; a < 360; a += st) g.push.apply(g, sph(a, b).concat(sph(a + st, b)));
    B.grid = buf(new Float32Array(g)); B.gridN = g.length / 3;
    var c = [];
    for (a = 0; a < 360; a += 2) c.push.apply(c, sph(a, 0).concat(sph(a + 2, 0)));
    B.circle = buf(new Float32Array(c)); B.circleN = c.length / 3;
    B.crossB = buf(new Float32Array([-1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1, 0])); B.crossN = 4;
    B.dyn = gl.createBuffer(); B.stems = gl.createBuffer(); B.stemsN = 0;
  })();

  // ---------- 은하 모형(입자) ----------
  // 팔: ln R = ln R0 − β·tanψ (β = 은하 중심에서 본 방위각, 태양 방향 0, 회전 방향 +). 값은 메이저 시차 측정(Reid 외 2019)을 따라 잡은 개략 모형.
  var ARMS = [
    { ko: '페르세우스 팔', r0: 10.0, pitch: 9.5, lab: -22 },
    { ko: '궁수자리 팔', r0: 6.9, pitch: 11, lab: 30 },
    { ko: '방패–센타우루스 팔', r0: 5.4, pitch: 12, lab: -38 },
    { ko: '직각자 팔', r0: 4.4, pitch: 9.5, lab: 50, lab2: { b: -330, ko: '바깥 팔' } },
  ];
  var LOCAL = { ko: '오리온 팔 (우리가 사는 곳)', r0: 8.45, pitch: 11.4, b0: -28, b1: 48 };
  function armR(a, b) { return a.r0 * Math.exp(-b * Math.tan(a.pitch * D2R)); }
  function gcToW(x, y, z) { return m3v(GT, [x * LY_KPC + R0, y * LY_KPC, z * LY_KPC - SUN_Z]); }   // 은하 중심 직교(kpc) → 적도(광년)
  function armPoint(a, bDeg) { var b = bDeg * D2R, r = armR(a, b); return gcToW(-r * Math.cos(b), r * Math.sin(b), 0); }
  (function buildGalaxy() {
    var R = rng(20261117), pos = [], col = [], size = [];
    function gauss() { var u = 0, v = 0; while (!u) u = R(); v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    function add(x, y, z, c, s, k) { var w = gcToW(x, y, z); pos.push(w[0], w[1], w[2]); col.push(c[0] * k, c[1] * k, c[2] * k); size.push(s); }
    var i, ba = 27 * D2R, bx = -Math.cos(ba), by = Math.sin(ba);
    for (i = 0; i < 9000; i++) {            // 막대
      var u = gauss() * 1.5, v = gauss() * 0.55;
      add(bx * u - by * v, by * u + bx * v, gauss() * 0.4, [1, 0.82, 0.55], 260 + R() * 260, 0.36);
    }
    for (i = 0; i < 5000; i++) add(gauss() * 0.7, gauss() * 0.7, gauss() * 0.55, [1, 0.85, 0.6], 300 + R() * 300, 0.4);   // 팽대부
    for (i = 0; i < 16000; i++) {           // 원반
      var r = -3.0 * Math.log(R() * R() + 1e-9); if (r > 17) { i--; continue; }
      var t = R() * 2 * Math.PI;
      add(r * Math.cos(t), r * Math.sin(t), gauss() * 0.36, [1, 0.9, 0.76], 280 + R() * 240, 0.5);
    }
    function arm(a, b0, b1, n) {
      for (var k = 0; k < n; k++) {
        var b = lerp(b0, b1, R()), r = armR(a, b);
        if (R() > r / 16 * Math.exp(-(r - 3) / 6.5) * 2.2) { k--; continue; }   // 호 길이 × 바깥으로 갈수록 성기게
        var w = 0.22 + 0.035 * r, rr = r + gauss() * w, bb = b + gauss() * w / r * 0.5;
        var hii = R() < 0.05;
        add(-rr * Math.cos(bb), rr * Math.sin(bb), gauss() * 0.2, hii ? [1, 0.42, 0.55] : [0.66, 0.78, 1], hii ? 110 + R() * 80 : 200 + R() * 220, hii ? 1.5 : 0.85);
      }
    }
    ARMS.forEach(function (a) {
      var tn = Math.tan(a.pitch * D2R);
      arm(a, -Math.log(16 / a.r0) / tn, Math.log(a.r0 / 3.2) / tn, 7000);
    });
    arm(LOCAL, LOCAL.b0 * D2R, LOCAL.b1 * D2R, 1300);
    B.gal = buf(new Float32Array(pos)); B.galCol = buf(new Float32Array(col)); B.galSize = buf(new Float32Array(size)); B.galN = size.length;
  })();

  // ---------- 자료 불러오기 ----------
  var TYPE_COL = { galaxy: '#ff6a6a', nebula: '#5fe07a', cluster: '#ffe14a', star: '#ffffff', other: '#c9d2e6' };
  var BODY = { Sun: ['#ffe9a0', 9], Moon: ['#d9d9d2', 7], Mercury: ['#c9b8a0', 3], Venus: ['#fff6d8', 4.5], Mars: ['#ff7a4a', 3.5], Jupiter: ['#f1d9b0', 4.5], Saturn: ['#ead9a0', 4], Uranus: ['#aee6e6', 3], Neptune: ['#8ab4ff', 3] };

  Promise.all([
    fetch('data/stars.bin?v=1').then(function (r) { return r.arrayBuffer(); }),
    fetch('data/sky.json?v=1').then(function (r) { return r.json(); }),
    CN.loadAll(function () {}),
  ]).then(function (res) {
    sky = res[1]; state = res[2];
    initStars(res[0]); initObjects(); initLines();
    document.getElementById('loading').remove();
    var id = CN.qs('id');
    if (id && state.byId[id]) selectObj(state.byId[id], true);
    buildTools(); updateInfo(); resize();
    requestAnimationFrame(frame);
  }).catch(function (e) { document.getElementById('loading').textContent = '자료를 불러오지 못했어요: ' + e.message; });

  function initStars(ab) {
    var dv = new DataView(ab), n = ab.byteLength / 20;
    starN = n + 1;                                   // 마지막 = 태양
    sPos = new Float32Array(starN * 3); sMag = new Float32Array(starN); sAbs = new Float32Array(starN); sBv = new Float32Array(starN); sHip = new Uint32Array(starN);
    var col = new Uint8Array(starN * 3);
    for (var i = 0; i < starN; i++) {
      var o = i * 20, x = 0, y = 0, z = 0, mag = -26.74, bv = 0.656, hip = 0, abs = 4.83;
      if (i < n) {
        x = dv.getFloat32(o, true); y = dv.getFloat32(o + 4, true); z = dv.getFloat32(o + 8, true);
        mag = dv.getInt16(o + 12, true) / 1000; bv = dv.getInt16(o + 14, true) / 1000; hip = dv.getUint32(o + 16, true);
        abs = mag - 5 * Math.log10(Math.hypot(x, y, z) / 32.6156);
      }
      sPos[i * 3] = x; sPos[i * 3 + 1] = y; sPos[i * 3 + 2] = z; sMag[i] = mag; sAbs[i] = abs; sBv[i] = bv; sHip[i] = hip;
      var c = CN.bvToRgb(bv); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    B.star = buf(sPos); B.starMag = buf(sAbs); B.starCol = buf(col);
  }
  function starP(i) { return [sPos[i * 3], sPos[i * 3 + 1], sPos[i * 3 + 2]]; }

  function initObjects() {
    state.list.forEach(function (o) {
      if (o.type === 'constellation') { o._dir = sph(o.ra * 15, o.dec); cons.push(o); return; }
      if (o.dynamic) {
        if ((o.parent && o.parent !== 'earth') || A.Body[o.body] === undefined) return;
        o._body = true; o._dir = [1, 0, 0]; o._p = [0, 0, 0]; bodies.push(o); return;
      }
      if (o.ra == null || o.dec == null) return;
      o._dir = sph(o.ra * 15, o.dec);
      o._ly = o.distanceLy || null;
      o._p = o._dir.map(function (c) { return c * (o._ly || 1000); });
      if (o.type === 'star') {                       // 카탈로그 별 ↔ 별 자료 짝짓기(가장 밝은 것)
        var cosTol = Math.cos(0.2 * D2R);
        for (var i = 0; i < Math.min(starN - 1, 12000); i++) {
          var p = starP(i), l = Math.hypot(p[0], p[1], p[2]);
          if ((p[0] * o._dir[0] + p[1] * o._dir[1] + p[2] * o._dir[2]) / l > cosTol && Math.abs(sMag[i] - (o.mag == null ? sMag[i] : o.mag)) < 1.6) { o._star = i; o._p = p; o._ly = l; starObj[i] = o; break; }
        }
      }
      o._col = o.type === 'star' ? 'rgb(' + CN.bvToRgb(o.bv).join(',') + ')' : (TYPE_COL[o.type] || TYPE_COL.other);
      objs.push(o);
    });
    objs.sort(function (a, b) { return prio(b) - prio(a); });
  }
  function prio(o) { return (CN.isFeatured(state, o) ? 100 : 0) - (o.mag == null ? 9 : o.mag); }
  function typeOn(o) { return S.types[o.type] !== false || o.type === 'other'; }
  function isDso(o) { return o.type !== 'star'; }

  function initLines() {
    var v = [], SUB = 6;
    sky.constellations.forEach(function (c) {
      var sum = [0, 0, 0], n = 0;
      c.lines.forEach(function (l) {
        for (var i = 0; i < l.length - 1; i++) {
          var a = starP(l[i]), b = starP(l[i + 1]);
          for (var k = 0; k < SUB; k++) { v.push.apply(v, lerp3(a, b, k / SUB)); v.push.apply(v, lerp3(a, b, (k + 1) / SUB)); }
        }
        l.forEach(function (s) { var p = starP(s); sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; n++; });
      });
      var o = cons.filter(function (x) { return x.catalog === c.abbr; })[0];
      if (o) o._p = sum.map(function (x) { return x / n; });
    });
    B.con = buf(new Float32Array(v)); B.conN = v.length / 3;
    v = [];
    sky.boundaries.forEach(function (p) { for (var i = 0; i + 5 < p.length; i += 3) v.push(p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5]); });
    B.bound = buf(new Float32Array(v)); B.boundN = v.length / 3;
  }
  function rebuildStems() {
    var v = [];
    objs.forEach(function (o) {
      if (!o._ly || o._ly > 3e5 || !typeOn(o)) return;
      var g = m3v(G, o._p), foot = m3v(GT, [g[0], g[1], -SUN_Z]);
      v.push(o._p[0], o._p[1], o._p[2], foot[0], foot[1], foot[2]);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, B.stems); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW); B.stemsN = v.length / 3;
  }

  // ---------- 시각·시선 ----------
  var bodyT = null;
  function updateSky() {
    var t = A.MakeTime(new Date(S.time));
    var rot = A.Rotation_EQJ_HOR(t, observer).rot;
    Fhor = [rot[0][0], rot[1][0], rot[2][0], rot[0][1], rot[1][1], rot[2][1], rot[0][2], rot[1][2], rot[2][2]];
    if (bodyT === null || Math.abs(S.time - bodyT) > 20000) {
      bodyT = S.time;
      bodies.forEach(function (o) {
        var eq = A.Equator(o.body, t, observer, false, true);
        o._dir = sph(eq.ra * 15, eq.dec); o._au = eq.dist;
        if (o.body !== 'Sun' && o.body !== 'Moon') { try { o._mag = A.Illumination(o.body, t).mag; } catch (e) {} }
        if (o.body === 'Moon') o._phase = A.Illumination('Moon', t).phase_fraction;
      });
    }
    var sun = bodies.filter(function (o) { return o.body === 'Sun'; })[0];
    sunHor = sun ? m3v(Fhor, sun._dir) : [0, 0, -1];
    var sa = Math.asin(clamp(sunHor[2], -1, 1)) * R2D;
    dayF = sstep(-6, 7, sa); twF = sstep(-18, -1, sa);
  }
  function earthM() {
    if (S.mount === 'az') { var a = S.lat * D2R, z = S.lon * D2R; return m3mul(viewFrom([Math.cos(a) * Math.cos(z), -Math.cos(a) * Math.sin(z), Math.sin(a)]), Fhor); }
    return viewFrom(sph(S.lon, S.lat));
  }
  function fwdW(m) { m = m || earthM(); return [-m[6], -m[7], -m[8]]; }
  function setViewDir(d) {             // 적도 단위벡터 방향을 화면 가운데로
    if (S.mount === 'az') { var h = m3v(Fhor, d); S.lat = clamp(Math.asin(clamp(h[2], -1, 1)) * R2D, -89.5, 89.5); S.lon = (Math.atan2(-h[1], h[0]) * R2D + 360) % 360; }
    else { S.lat = clamp(Math.asin(clamp(d[2], -1, 1)) * R2D, -89.5, 89.5); S.lon = (Math.atan2(d[1], d[0]) * R2D + 360) % 360; }
  }
  // 세로 화면에서는 가로 시야가 50°가 되게 넓힌다
  function galFov() { var a = W / H; return a >= 1 ? GAL_FOV : 2 * Math.atan(Math.tan(GAL_FOV / 2 * D2R) / a) * R2D; }
  function orbitU() { return [Math.cos(O.pitch) * Math.cos(O.yaw), Math.cos(O.pitch) * Math.sin(O.yaw), Math.sin(O.pitch)]; }
  function orbitM() { var u = orbitU(); return m3mul(viewFrom([-u[0], -u[1], -u[2]]), G); }

  function selDir() {
    if (!sel) return null;
    if (sel.kind === 'star') return norm(starP(sel.i));
    return sel.o._dir;
  }
  function selPos() {
    if (!sel) return null;
    if (sel.kind === 'star') return starP(sel.i);
    if (sel.o._body) return [0, 0, 0];
    return sel.o._p || null;
  }

  // ---------- 애니메이션 ----------
  function startAnim(dur, step, done, lock) { anim = { t0: performance.now(), dur: dur, step: step, done: done, lock: lock }; }
  function ease(e) { return e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2; }
  function angLerp(a, b, t) { var d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; }
  // 궤도 카메라를 to{target,dist,yaw,pitch}로. 표적 이동은 거리(로그)에 맞춰 — 가까이 볼 땐 표적이 화면 밖으로 튀지 않게.
  function tweenOrbit(to, dur, onStep, done, lock) {
    var fr = { target: O.target.slice(), dist: O.dist, yaw: O.yaw, pitch: O.pitch };
    if (to.yaw === undefined) to.yaw = fr.yaw; if (to.pitch === undefined) to.pitch = fr.pitch; if (!to.target) to.target = fr.target;
    var L = Math.hypot(to.target[0] - fr.target[0], to.target[1] - fr.target[1], to.target[2] - fr.target[2]);
    var sf = function (d) { return sstep(Math.log(0.15 * L + 1e-9), Math.log(3 * L + 1e-9), Math.log(d)); };
    var sa = sf(fr.dist), sb = sf(to.dist);
    startAnim(dur, function (e) {
      O.dist = Math.exp(lerp(Math.log(fr.dist), Math.log(to.dist), e));
      O.yaw = angLerp(fr.yaw, to.yaw, e); O.pitch = lerp(fr.pitch, to.pitch, e);
      var w = L < 1e-6 ? 1 : Math.abs(sb - sa) < 0.5 ? e : (sf(O.dist) - sa) / (sb - sa);
      O.target = lerp3(fr.target, to.target, clamp(w, 0, 1));
      if (onStep) onStep(e);
    }, done, lock);
  }
  function centerOn(d, dur) {          // 지구 모드: 방향 d로 부드럽게
    var f0 = fwdW();
    startAnim(dur || 700, function (e) { setViewDir(norm(lerp3(f0, d, e))); });
  }

  var PRESETS = [
    { ko: '태양 근처', dist: 60, c: 'sun', cap: '태양에서 수십 광년 — 가장 가까운 이웃 별들' },
    { ko: '별자리 별들', dist: 1800, c: 'sun', cap: '맨눈으로 보는 별은 거의 다 수천 광년 안에 있어요' },
    { ko: '오리온 팔', dist: 14000, c: 'sun', cap: '태양이 속한 오리온 팔과 가까운 성단·성운' },
    { ko: '우리은하', dist: 130000, c: 'gc', minPitch: 38, cap: '우리은하 전체 — 지름 약 10만 광년' },
    { ko: '국부 은하군', dist: 6.5e6, c: 'gc', minPitch: 25, cap: '국부 은하군 — 안드로메다은하까지 약 250만 광년' },
    { ko: '먼 은하', dist: 1.6e8, c: 'gc', minPitch: 25, cap: '수천만 광년 떨어진 이웃 은하들' },
  ];
  function centerPoint(c) { return c === 'sun' ? [0, 0, 0] : c === 'gc' ? GC_W : (selPos() || [0, 0, 0]); }
  function goPreset(p, dur, onStep, done, lock) {
    S.center = p.c;
    var pitch = O.pitch;
    if (p.minPitch && Math.abs(pitch) < p.minPitch * D2R) pitch = p.minPitch * D2R * (pitch < -0.05 ? -1 : 1);
    tweenOrbit({ target: centerPoint(p.c), dist: p.dist, pitch: pitch }, dur || 2200, onStep, done, lock);
    say(p.cap, 6000); buildTools();
  }
  function say(text, ms) { caption.text = text; caption.until = performance.now() + (ms || 5000); var el = document.getElementById('caption'); el.textContent = text; el.style.opacity = 1; }

  function enterGalaxy() {
    if (S.mode === 'galaxy' || (anim && anim.lock)) return;
    var u = m3v(G, fwdW().map(function (x) { return -x; }));
    O.pitch = Math.asin(clamp(u[2], -1, 1)); O.yaw = Math.atan2(u[1], u[0]); O.target = [0, 0, 0]; O.dist = 0.02;
    S.mode = 'galaxy'; tracking = false;
    rebuildStems();
    goPreset(PRESETS[3], 7000, function (e) {
      tr = sstep(0, 0.1, e);
      var d = O.dist;
      var c = d < 30 ? '지구(태양계)를 떠나 뒤로 물러나는 중…' : d < 2500 ? '별자리를 이루던 별들이 앞뒤로 흩어져요 — 별자리는 지구에서 볼 때만 그 모양' : d < 40000 ? '맨눈으로 보이던 별 전체가 작은 구름 하나로…' : '우리은하 전체 — 태양은 중심에서 약 2만 6,700광년';
      if (c !== caption.text) say(c, 8000);
    }, function () { tr = 1; }, true);
    buildTools(); updateInfo();
  }
  function enterEarth() {
    if (S.mode === 'earth' || (anim && anim.lock)) return;
    var d = selDir();
    if (d) { updateSky(); setViewDir(d); }
    var u = m3v(G, fwdW().map(function (x) { return -x; }));
    say('태양계로 돌아가는 중…', 4000);
    tweenOrbit({ target: [0, 0, 0], dist: 0.02, yaw: Math.atan2(u[1], u[0]), pitch: Math.asin(clamp(u[2], -1, 1)) }, 4500, function (e) { tr = 1 - sstep(0.9, 1, e); },
      function () { tr = 0; S.mode = 'earth'; buildTools(); updateInfo(); say(sel ? '지구에서 본 ' + selName() : '지구에서 본 하늘', 3000); }, true);
  }

  // ---------- 그리기 ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    [glc, ov].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    gl.viewport(0, 0, glc.width, glc.height);
  }
  window.addEventListener('resize', resize);

  function setCommon(p, m, dirOnly) {
    gl.useProgram(p.p);
    gl.uniformMatrix3fv(p.u.uM, false, colM(m || M));
    gl.uniform3fv(p.u.uCam, cam); gl.uniform1f(p.u.uFov, fovRad); gl.uniform1f(p.u.uAspect, W / H); gl.uniform1f(p.u.uProj, tr);
    if (p.u.uDir) gl.uniform1f(p.u.uDir, dirOnly ? 1 : 0);
  }
  function attr(i, b, size, type, normd) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, size, type || gl.FLOAT, !!normd, 0, 0); }
  function lines(b, n, m, color, o) {
    o = o || {};
    setCommon(pLine, m, o.dir);
    gl.uniformMatrix3fv(pLine.u.uPre, false, colM(o.pre || ID));
    gl.uniform1f(pLine.u.uScale, o.scale || 1); gl.uniform3fv(pLine.u.uOff, o.off || [0, 0, 0]);
    gl.uniform4fv(pLine.u.uColor, color);
    attr(0, b, 3); gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
    gl.drawArrays(gl.LINES, 0, n);
  }
  function pxPerRad() { return lerp(1 / (2 * Math.tan(fovRad / 4)), 1 / Math.tan(fovRad / 2), tr) * H / 2; }

  // 적도 좌표(또는 방향) → 화면 CSS 픽셀. 셰이더 project()와 같은 식.
  function proj(p, dirOnly, m) {
    m = m || M;
    var x = p[0] - (dirOnly ? 0 : cam[0]), y = p[1] - (dirOnly ? 0 : cam[1]), z = p[2] - (dirOnly ? 0 : cam[2]);
    var vx = m[0] * x + m[1] * y + m[2] * z, vy = m[3] * x + m[4] * y + m[5] * z, vz = m[6] * x + m[7] * y + m[8] * z;
    var d = Math.hypot(vx, vy, vz); if (d < 1e-12) return null;
    vx /= d; vy /= d; vz /= d;
    if (tr < 0.5 && vz > 0.8) return null;
    var ks = 1 / (2 * Math.tan(fovRad / 4)), kp = 1 / Math.tan(fovRad / 2), den = Math.max(1 - vz, 1e-3);
    var w = lerp(1, -vz, tr); if (w < 1e-4) return null;
    var ox = lerp(2 * vx / den * ks, vx * kp, tr) / w, oy = lerp(2 * vy / den * ks, vy * kp, tr) / w;
    return [(ox / (W / H) * 0.5 + 0.5) * W, (0.5 - oy * 0.5) * H, d];
  }
  function inRange(o) { var t = O.target; return Math.hypot(o._p[0] - t[0], o._p[1] - t[1], o._p[2] - t[2]) < O.dist * 5; }
  function onScreen(q, mrg) { mrg = mrg || 0; return q && q[0] > -mrg && q[0] < W + mrg && q[1] > -mrg && q[1] < H + mrg; }

  var lastT = performance.now(), lastStatus = 0;
  function frame(now) {
    var dt = Math.min(now - lastT, 200); lastT = now;
    if (S.playing) S.time += dt * S.rate;
    updateSky();
    if (anim) { var e = Math.min(1, (now - anim.t0) / anim.dur); anim.step(ease(e)); if (e >= 1) { var dn = anim.done; anim = null; if (dn) dn(); } }
    if (S.mode === 'earth' && tracking && sel && !anim) { var sd = selDir(); if (sd) setViewDir(sd); }
    if (S.mode === 'galaxy' && S.center === 'sel' && !anim && selPos()) O.target = selPos();

    var Me = earthM();
    if (S.mode === 'earth') { M = Me; cam = [0, 0, 0]; fovRad = S.fov * D2R; }
    else {
      var Mo = orbitM(), u = m3v(GT, orbitU());
      M = mslerp(Me, Mo, tr);
      cam = [O.target[0] + u[0] * O.dist, O.target[1] + u[1] * O.dist, O.target[2] + u[2] * O.dist];
      fovRad = lerp(S.fov, galFov(), tr) * D2R;
    }
    render(); overlay();
    if (now - lastStatus > 250) { lastStatus = now; updateStatus(); if (sel) updateInfo(); }
    if (caption.until && now > caption.until && S.mode === 'earth') { caption.until = 0; document.getElementById('caption').style.opacity = 0; }
    requestAnimationFrame(frame);
  }

  function render() {
    var earth = 1 - tr, f = S.f;
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    var toHor = m3mul(Fhor, m3T(M));
    function skyPass(pass) {
      gl.useProgram(pSky.p);
      gl.uniformMatrix3fv(pSky.u.uToHor, false, colM(toHor)); gl.uniform3fv(pSky.u.uSun, sunHor);
      gl.uniform1f(pSky.u.uFov, fovRad); gl.uniform1f(pSky.u.uAspect, W / H); gl.uniform1f(pSky.u.uPass, pass);
      gl.uniform1f(pSky.u.uAtm, f.atm ? 1 : 0); gl.uniform1f(pSky.u.uAlpha, earth);
      attr(0, B.quad, 2); gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    var atm = f.atm ? earth : 0;
    if (atm > 0) skyPass(0);

    // 은하(입자)
    if (f.milky || tr > 0) {
      setCommon(pGal);
      gl.uniform1f(pGal.u.uDpr, dpr); gl.uniform1f(pGal.u.uPxRad, pxPerRad());
      var ga = lerp((f.milky ? 0.017 : 0) * Math.pow(1 - twF * atm, 2), 0.1, tr);
      gl.uniform1f(pGal.u.uGalA, ga); gl.uniform1f(pGal.u.uSizeK, lerp(1, 1.7, tr)); gl.uniform1f(pGal.u.uNearA, lerp(250, Math.max(250, O.dist * 0.25), tr)); gl.uniform1f(pGal.u.uNearB, lerp(1600, Math.max(1600, O.dist * 0.9), tr));
      attr(0, B.gal, 3); attr(1, B.galCol, 3); attr(2, B.galSize, 1);
      gl.drawArrays(gl.POINTS, 0, B.galN);
    }
    // 별
    setCommon(pStar);
    var lim = 6.0 + 1.5 * Math.log2(70 / (fovRad * R2D)) - atm * (5 * twF + 8 * dayF);
    gl.uniform1f(pStar.u.uLim, lim); gl.uniform1f(pStar.u.uDpr, dpr);
    gl.uniform1f(pStar.u.uFloor, tr * clamp(500 / Math.max(O.dist, 1), 0, 0.13));
    attr(0, B.star, 3); attr(1, B.starMag, 1); attr(2, B.starCol, 3, gl.UNSIGNED_BYTE, true);
    gl.drawArrays(gl.POINTS, 0, starN);
    render.lim = lim;

    // 선
    var dim = 1 - 0.6 * dayF * atm;
    if (f.conLines) { var ca = lerp(0.55, 0.3 * (1 - sstep(Math.log(4000), Math.log(40000), Math.log(Math.max(O.dist, 1)))), tr); if (ca > 0.01) lines(B.con, B.conN, M, [0.32, 0.42, 0.95, ca * dim]); }
    if (earth > 0.01) {
      var Mhor = m3mul(M, m3T(Fhor));          // 지평 좌표 → 화면
      if (f.bounds) lines(B.bound, B.boundN, M, [0.55, 0.2, 0.2, 0.7 * earth], { dir: 1 });
      if (f.eqGrid) lines(B.grid, B.gridN, M, [0.2, 0.3, 0.8, 0.55 * earth], { dir: 1 });
      if (f.azGrid) lines(B.grid, B.gridN, Mhor, [0.0, 0.42, 0.28, 0.6 * earth], { dir: 1 });
      if (f.eqGrid) lines(B.circle, B.circleN, M, [0.3, 0.5, 1.0, 0.8 * earth], { dir: 1 });
      if (f.ecliptic) { var ob = 23.4393 * D2R; lines(B.circle, B.circleN, M, [0.9, 0.6, 0.2, 0.8 * earth], { dir: 1, pre: [1, 0, 0, 0, Math.cos(ob), -Math.sin(ob), 0, Math.sin(ob), Math.cos(ob)] }); }
      if (f.galEq) lines(B.circle, B.circleN, M, [0.6, 0.38, 0.15, 0.85 * earth], { dir: 1, pre: GT });
      if (f.azGrid || !f.ground) lines(B.circle, B.circleN, Mhor, [0.2, 0.6, 0.2, 0.7 * earth], { dir: 1 });
    }
    if (tr > 0.3) {
      var ga2 = sstep(0.3, 1, tr);
      if (f.rings) {
        var c = S.center === 'sun' ? [0, 0, 0] : O.target, st = niceStep(O.dist * 0.16);
        for (var k = 1; k <= 4; k++) lines(B.circle, B.circleN, M, [0.35, 0.5, 0.75, 0.42 * ga2], { pre: GT, scale: st * k, off: c });
        if (S.center === 'sun') lines(B.crossB, B.crossN, M, [0.35, 0.5, 0.75, 0.42 * ga2], { pre: GT, scale: st * 4, off: c });
      }
      if (f.stems && B.stemsN && O.dist < 6e5) lines(B.stems, B.stemsN, M, [0.6, 0.6, 0.7, 0.35 * ga2]);
      var sp = selPos();
      if (f.sight && sp && Math.hypot(sp[0], sp[1], sp[2]) > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, B.dyn); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, sp[0], sp[1], sp[2]]), gl.DYNAMIC_DRAW);
        lines(B.dyn, 2, M, [1.0, 0.75, 0.3, 0.9 * ga2]);
      }
    }
    if (f.ground && earth > 0) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); skyPass(1); }
  }

  // ---------- 2D 덧그림(이름표·표식) ----------
  var placed = [];
  function label(x, y, text, color, o) {
    o = o || {};
    var size = o.size || 12, w, h = size + 2, lx, ly;
    ctx.font = (o.bold ? '700 ' : '') + size + 'px ' + FONT;
    w = ctx.measureText(text).width;
    lx = o.center ? x - w / 2 : x + (o.dx === undefined ? 7 : o.dx); ly = o.center ? y - h / 2 : y - h - 1 + (o.dy || 0);
    if (!o.force) {
      for (var i = 0; i < placed.length; i++) { var r = placed[i]; if (lx < r[0] + r[2] && lx + w > r[0] && ly < r[1] + r[3] && ly + h > r[1]) return false; }
    }
    placed.push([lx - 2, ly - 1, w + 4, h + 2]);
    ctx.fillStyle = color; ctx.textBaseline = 'top';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(text, lx, ly); ctx.shadowBlur = 0;
    return true;
  }
  var FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  function altOf(d) { return Fhor[6] * d[0] + Fhor[7] * d[1] + Fhor[8] * d[2]; }

  function dsoMark(o, x, y, r) {
    ctx.strokeStyle = o._col; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.9;
    ctx.beginPath();
    if (o.type === 'galaxy') ctx.ellipse(x, y, r * 1.3, r * 0.65, -0.5, 0, 6.2832);
    else if (o.type === 'cluster') {
      if (o.subtype === '구상성단') { ctx.arc(x, y, r, 0, 6.2832); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); }
      else { ctx.setLineDash([3, 2.5]); ctx.arc(x, y, r, 0, 6.2832); }
    } else if (o.type === 'nebula') {
      if (o.subtype === '행성상성운') { ctx.arc(x, y, r * 0.7, 0, 6.2832); for (var k = 0; k < 4; k++) { var a = k * Math.PI / 2; ctx.moveTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7); ctx.lineTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); } }
      else ctx.rect(x - r, y - r, r * 2, r * 2);
    } else { ctx.setLineDash([2, 3]); ctx.arc(x, y, r, 0, 6.2832); }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  function reticle(x, y, r) {
    var t = performance.now() / 500, rr = r + 5 + Math.sin(t) * 1.5;
    ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 1.6;
    for (var k = 0; k < 4; k++) { var a = k * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.arc(x, y, rr, a - 0.45, a + 0.45); ctx.stroke(); }
  }
  function selName() {
    if (!sel) return '';
    if (sel.kind === 'star') { var n = starNames(sel.i); return n[0]; }
    return sel.o.nameKo;
  }
  function starNames(i) {
    if (starObj[i]) return [starObj[i].nameKo, starObj[i].catalog || ''];
    if (i === starN - 1) return ['태양', ''];
    var hip = sHip[i] & 0x7fffffff, nm = sky.names[hip] || [], main = nm[1] || nm[0] || (hip ? 'HIP ' + hip : '이름 없는 별');
    return [main, [nm[1] ? nm[0] : null, hip && (nm[0] || nm[1]) ? 'HIP ' + hip : null].filter(Boolean).join(' · ')];
  }

  function overlay() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    placed = [[0, H - 86, W, 86], [W - 215, 0, 215, 98]];
    var ir = document.getElementById('info').getBoundingClientRect(); placed.push([ir.left, ir.top, ir.width, ir.height]);
    if (tr < 0.5) overlayEarth(); else overlayGalaxy();
  }

  function overlayEarth() {
    var f = S.f, a = 1 - sstep(0, 0.5, tr), ppr = pxPerRad(), fovD = fovRad * R2D, q, i;
    ctx.globalAlpha = a;
    var hide = function (d) { return f.ground && altOf(d) < -0.01; };
    // 고른 천체
    var sd = selDir();
    if (sd && (q = proj(sd, true)) && onScreen(q, 30)) { reticle(q[0], q[1], 9); label(q[0], q[1], selName(), '#fff', { bold: true, size: 13, dx: 14, force: true }); }
    // 방위
    if (f.cardinal) [['북', 0], ['동', 90], ['남', 180], ['서', 270]].forEach(function (c) {
      var d = m3v(m3T(Fhor), [Math.cos(c[1] * D2R), -Math.sin(c[1] * D2R), 0]), p = proj(d, true);
      if (onScreen(p)) label(p[0], p[1] + 14, c[0], '#e2452f', { bold: true, size: 17, center: true, force: true });
    });
    // 태양계
    if (f.planets) bodies.forEach(function (o) {
      if (hide(o._dir) || !(q = proj(o._dir, true)) || !onScreen(q, 20)) return;
      var b = BODY[o.body] || ['#ddd', 3], r = b[1];
      if (o.body === 'Sun' || o.body === 'Moon') r = Math.max(r, 0.0046 * ppr);
      else if (o._mag != null) r = clamp(4.4 - o._mag * 0.55, 2.2, 6);
      if (o.body === 'Moon') drawMoon(o, q[0], q[1], r);
      else {
        if (o.body === 'Sun') { var g = ctx.createRadialGradient(q[0], q[1], r * 0.5, q[0], q[1], r * 3.2); g.addColorStop(0, 'rgba(255,230,150,.55)'); g.addColorStop(1, 'rgba(255,230,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], r * 3.2, 0, 6.2832); ctx.fill(); }
        ctx.fillStyle = b[0]; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 6.2832); ctx.fill();
      }
      label(q[0], q[1], o.nameKo, '#c9b8ff', { size: 13, dx: r + 4, force: true });
    });
    // 별자리 이름
    if (f.conNames && fovD > 12) cons.forEach(function (o) {
      if (hide(o._dir) || !(q = proj(o._dir, true)) || !onScreen(q)) return;
      label(q[0], q[1], o.nameKo.replace(/자리$/, ''), 'rgba(120,165,235,.95)', { size: fovD > 100 ? 11 : 13, center: true });
    });
    // 대상 천체
    var magLab = 2.2 + 1.6 * Math.log2(70 / fovD);
    for (i = 0; i < objs.length; i++) {
      var o = objs[i], dso = isDso(o);
      if (dso ? (!f.dso || (f.atm && twF > 0.75)) : !f.starNames) continue;
      if (!typeOn(o) || hide(o._dir) || !(q = proj(o._dir, true)) || !onScreen(q, 10)) continue;
      var feat = CN.isFeatured(state, o);
      if (dso) {
        var r = Math.max(5, (o.sizeArcmin || 0) / 60 * D2R * ppr / 2);
        if (r > Math.max(W, H)) continue;
        dsoMark(o, q[0], q[1], r);
        if (feat || fovD < 45 || (o.mag != null && o.mag < 4.5 + 2 * Math.log2(70 / fovD))) label(q[0], q[1], dsoLabel(o, fovD), 'rgba(110,200,215,.98)', { dx: Math.min(r, 60) + 3 });
      } else if (o.mag == null || o.mag < magLab || (feat && fovD < 100)) label(q[0], q[1], o.nameKo, 'rgba(235,235,215,.95)', { dx: 6 });
    }
    // 격자 눈금
    if (f.eqGrid || f.azGrid) gridLabels();
    ctx.globalAlpha = 1;
  }
  function dsoLabel(o, fovD) { return fovD < 60 || !/^(M|NGC|IC)\s?\d/.test(o.catalog || '') ? o.nameKo : o.catalog; }
  function drawMoon(o, x, y, r) {
    var sun = bodies.filter(function (b) { return b.body === 'Sun'; })[0], ang = 0, k = o._phase == null ? 1 : o._phase;
    var qs = sun && proj(lerp3(o._dir, sun._dir, 0.02), true);
    if (qs) ang = Math.atan2(qs[1] - y, qs[0] - x);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = '#2a2a2c'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#e4e2d8'; ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    var rx = Math.max(0.01, r * Math.abs(1 - 2 * k));
    if (k < 0.5) ctx.ellipse(0, 0, rx, r, 0, Math.PI / 2, -Math.PI / 2, true); else ctx.ellipse(0, 0, rx, r, 0, Math.PI / 2, 1.5 * Math.PI, false);
    ctx.fill(); ctx.restore();
  }
  function gridLabels() {
    var f = S.f, fw = fwdW(), q, a, b;
    function along(toW, lon0, lat0, lonFmt, latFmt, color) {
      var bl = clamp(Math.round(lat0 / 10) * 10, -80, 80), al = Math.round(lon0 / 15) * 15;
      var vis = function (d) { return !(f.ground && altOf(d) < 0) && (q = proj(d, true)) && onScreen(q); };
      for (a = 0; a < 360; a += 15) if (vis(toW(a, bl))) label(q[0], q[1], lonFmt(a), color, { size: 10, dx: 3 });
      for (b = -80; b <= 80; b += 10) if (b !== bl && vis(toW(al, b))) label(q[0], q[1], latFmt(b), color, { size: 10, dx: 3 });
    }
    var sg = function (x) { return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x) + '°'; };
    if (f.eqGrid) along(function (l, b) { return sph(l, b); }, Math.atan2(fw[1], fw[0]) * R2D, Math.asin(fw[2]) * R2D, function (l) { return l / 15 + 'h'; }, sg, 'rgba(110,140,255,.9)');
    if (f.azGrid) { var h = m3v(Fhor, fw), FT = m3T(Fhor); along(function (l, b) { return m3v(FT, [Math.cos(b * D2R) * Math.cos(l * D2R), -Math.cos(b * D2R) * Math.sin(l * D2R), Math.sin(b * D2R)]); }, Math.atan2(-h[1], h[0]) * R2D, Math.asin(h[2]) * R2D, function (l) { return l + '°'; }, sg, 'rgba(60,200,140,.9)'); }
  }

  function overlayGalaxy() {
    var f = S.f, a = sstep(0.5, 1, tr), q, i, ppr = pxPerRad();
    ctx.globalAlpha = a;
    var sp = selPos();
    // 고른 천체, 태양, 은하 중심
    if (sp && (q = proj(sp)) && onScreen(q, 30)) { reticle(q[0], q[1], 8); label(q[0], q[1], selName(), '#fff', { bold: true, size: 13, dx: 14, force: true }); }
    if ((q = proj([0, 0, 0])) && onScreen(q)) {
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(q[0], q[1], 1.6, 0, 6.2832); ctx.fill();
      label(q[0], q[1], O.dist > 2e6 ? '우리은하' : '태양 (우리가 있는 곳)', '#ffd24a', { bold: true, size: 13, dx: 10 });
    }
    if (O.dist > 9000 && O.dist < 2e6 && (q = proj(GC_W)) && onScreen(q)) {
      ctx.strokeStyle = '#ffb070'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q[0] - 6, q[1]); ctx.lineTo(q[0] + 6, q[1]); ctx.moveTo(q[0], q[1] - 6); ctx.lineTo(q[0], q[1] + 6); ctx.stroke();
      label(q[0], q[1], '은하 중심 (궁수자리 A*)', '#ffb070', { size: 12, dx: 9 });
    }
    // 은하 팔 이름
    if (f.arms && O.dist > 12000 && O.dist < 7e5) {
      ARMS.forEach(function (ar) {
        if ((q = proj(armPoint(ar, ar.lab))) && onScreen(q)) label(q[0], q[1], ar.ko, 'rgba(160,195,255,.95)', { size: 12, center: true });
        if (ar.lab2 && (q = proj(armPoint(ar, ar.lab2.b))) && onScreen(q)) label(q[0], q[1], ar.lab2.ko, 'rgba(160,195,255,.95)', { size: 12, center: true });
      });
      if ((q = proj(armPoint(LOCAL, 30))) && onScreen(q)) label(q[0], q[1], LOCAL.ko, 'rgba(160,195,255,.95)', { size: 12, center: true });
    }
    // 거리 눈금
    if (f.rings) {
      var c = S.center === 'sun' ? [0, 0, 0] : O.target, st = niceStep(O.dist * 0.16);
      for (var k = 1; k <= 4; k++) { var p = [c[0] + GT[1] * st * k * -0.7071 + GT[0] * st * k * 0.7071, c[1] + GT[4] * st * k * -0.7071 + GT[3] * st * k * 0.7071, c[2] + GT[7] * st * k * -0.7071 + GT[6] * st * k * 0.7071]; if ((q = proj(p)) && onScreen(q)) label(q[0], q[1], CN.fmtLy(st * k), 'rgba(140,170,215,.9)', { size: 10, dx: 3 }); }
      if (S.center === 'sun') [[1, 0, '은하 중심 쪽 (궁수자리)'], [0, 1, '백조자리 쪽'], [-1, 0, '은하 바깥쪽 (마차부자리)'], [0, -1, '돛자리 쪽']].forEach(function (d) {
        var p = m3v(GT, [d[0] * st * 4, d[1] * st * 4, 0]); if ((q = proj(p)) && onScreen(q)) label(q[0], q[1], d[2], 'rgba(140,170,215,.95)', { size: 11, center: true });
      });
    }
    // 대상 천체
    for (i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (!o._ly || !typeOn(o) || !inRange(o) || !(q = proj(o._p)) || !onScreen(q, 10)) continue;
      var feat = CN.isFeatured(state, o), r = o.type === 'star' ? 2.4 : 3.2;
      ctx.fillStyle = o._col; ctx.globalAlpha = a * 0.95;
      if (o.type === 'galaxy') { ctx.beginPath(); ctx.ellipse(q[0], q[1], r * 1.7, r * 0.9, -0.5, 0, 6.2832); ctx.fill(); }
      else if (o.type === 'nebula') ctx.fillRect(q[0] - r, q[1] - r, r * 2, r * 2);
      else { ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 6.2832); ctx.fill(); }
      ctx.globalAlpha = a;
      if (f.gNames) label(q[0], q[1], o.nameKo, o.type === 'star' ? 'rgba(235,235,215,.95)' : o._col, { size: 11, dx: 6 });
    }
    // 축척 막대
    var ly = niceStep(130 / ppr * O.dist), px = ly / O.dist * ppr, x0 = W / 2 - px / 2, y0 = H - 100;
    ctx.strokeStyle = '#cfd6e6'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y0); ctx.lineTo(x0 + px, y0); ctx.lineTo(x0 + px, y0 - 4); ctx.stroke();
    label(W / 2, y0 - 12, CN.fmtLy(ly), '#cfd6e6', { size: 12, center: true, force: true });
    ctx.globalAlpha = 1;
  }

  // ---------- 고르기 ----------
  function pick(x, y) {
    var best = null, bd = 1e9, q, d, i;
    var galaxy = S.mode === 'galaxy';
    function tryIt(q, s, tol) { if (!q) return; d = Math.hypot(q[0] - x, q[1] - y); if (d < tol && d < bd) { bd = d; best = s; } }
    if (!galaxy && S.f.planets) bodies.forEach(function (o) { tryIt(proj(o._dir, true), { kind: 'obj', o: o }, 16); });
    objs.forEach(function (o) {
      if (!typeOn(o) || (galaxy ? (!o._ly || !inRange(o)) : (isDso(o) && !S.f.dso))) return;
      tryIt(galaxy ? proj(o._p) : proj(o._dir, true), { kind: 'obj', o: o }, 14);
    });
    if (best) return best;
    var lim = render.lim + 0.5, score = 1e9;
    if (galaxy && O.dist > 20000) return null;
    for (i = 0; i < starN; i++) {
      var p = [sPos[i * 3], sPos[i * 3 + 1], sPos[i * 3 + 2]], dc = Math.hypot(p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]);
      if (dc < 1e-3) continue;
      var m = sAbs[i] + 5 * Math.log10(dc / 32.6156);
      if (m > lim && !galaxy) continue;
      q = proj(p); if (!q) continue;
      d = Math.hypot(q[0] - x, q[1] - y);
      if (d < 12 && d + m * 1.5 < score) { score = d + m * 1.5; best = starObj[i] ? { kind: 'obj', o: starObj[i] } : { kind: 'star', i: i }; }
    }
    if (best) return best;
    if (!galaxy && S.f.conNames) cons.forEach(function (o) { tryIt(proj(o._dir, true), { kind: 'con', o: o }, 22); });
    return best;
  }
  function selectObj(o, center) {
    sel = o.type === 'constellation' ? { kind: 'con', o: o } : { kind: 'obj', o: o };
    afterSelect(center);
  }
  function afterSelect(center) {
    tracking = false; updateInfo(); buildTools();
    if (!center || !sel) return;
    if (S.mode === 'earth') { var d = selDir(); if (d) { updateSky(); centerOn(d); tracking = true; } }
    else if (selPos() && !(anim && anim.lock)) {
      var p = selPos(), far = Math.hypot(p[0], p[1], p[2]);
      S.center = 'sel';
      tweenOrbit({ target: p, dist: clamp(far * 0.9, 40, 5e9) }, 1800);
      buildTools();
    }
  }

  // ---------- 정보창 ----------
  function fmtDeg(x, signed) { var s = x < 0 ? '−' : signed ? '+' : ''; x = Math.abs(x); var d = Math.floor(x), m = Math.round((x - d) * 60); if (m === 60) { d++; m = 0; } return s + d + '° ' + pad(m) + '′'; }
  function galText(p) {
    var g = m3v(G, p), d = Math.hypot(g[0], g[1], g[2]);
    if (d < 1e-6) return [];
    var out = [['은하 좌표', '경도 ' + ((Math.atan2(g[1], g[0]) * R2D + 360) % 360).toFixed(1) + '°, 위도 ' + (Math.asin(g[2] / d) * R2D).toFixed(1).replace('-', '−') + '°']];
    if (d > 2.5e5) { out.push(['우리은하에서', '은하 밖 — 우리은하 지름의 약 ' + Math.round(d / 1e5).toLocaleString('ko-KR') + '배 거리']); return out; }
    var R = Math.hypot(g[0] - R0, g[1]), z = g[2] + SUN_Z;
    out.push(['은하 중심에서', CN.fmtLy(Math.round(R / 100) * 100) + (R > R0 + 300 ? ' (태양보다 바깥)' : R < R0 - 300 ? ' (태양보다 안쪽)' : ' (태양과 비슷)')]);
    out.push(['은하면에서', Math.abs(z) < 30 ? '거의 은하면 위' : (z > 0 ? '위(북)로 ' : '아래(남)로 ') + CN.fmtLy(Math.abs(z) < 1000 ? Math.round(Math.abs(z) / 10) * 10 : Math.round(Math.abs(z) / 100) * 100)]);
    return out;
  }
  var infoHtml = '', infoParts = null, infoMin = window.innerWidth < 640;
  document.getElementById('info').classList.toggle('min', infoMin);
  function updateInfo() {
    var el = document.getElementById('info'), h = '';
    if (!sel) {
      h = S.mode === 'earth' ? '<div class="tip">끌어서 하늘 돌리기 · 휠(두 손가락)로 확대<br>별이나 천체를 누르면 정보가 나와요</div>' : '<div class="tip">끌어서 돌려 보기 · 휠(두 손가락)로 멀리/가까이<br>천체를 누르면 은하 속 위치를 알려 줘요</div>';
    } else {
      var rows = [], title, sub, d = selDir(), p = selPos(), o = sel.o, thumb = '';
      if (sel.kind === 'star') {
        var i = sel.i, nm = starNames(i), ly = Math.hypot(sPos[i * 3], sPos[i * 3 + 1], sPos[i * 3 + 2]), bad = sHip[i] & 0x80000000;
        title = nm[0]; sub = '별' + (nm[1] ? ' · ' + nm[1] : '');
        rows.push(['밝기', CN.fmtMag(sMag[i]) + ' (절대등급 ' + sAbs[i].toFixed(1).replace('-', '−') + ')']);
        rows.push(['거리', bad ? '수천 광년 이상 (시차가 너무 작아 불확실)' : CN.fmtLy(ly)]);
      } else {
        title = o.nameKo; sub = [o.catalog !== o.nameKo ? o.catalog : '', CN.typeLabel(o), o.constellationKo && o.type !== 'constellation' ? o.constellationKo : ''].filter(Boolean).join(' · ');
        if (o._body) { if (o._mag != null) rows.push(['밝기', CN.fmtMag(o._mag)]); if (o._au) rows.push(['거리', o.body === 'Moon' ? CN.fmtKm(o._au * 149597870.7) : o._au.toFixed(2) + ' AU (' + CN.fmtKm(o._au * 149597870.7) + ')']); }
        else if (sel.kind === 'obj') {
          if (o.mag != null) rows.push(['밝기', CN.fmtMag(o.mag)]);
          rows.push(['거리', o.distanceLy ? CN.fmtLy(o.distanceLy) : '거리를 하나로 정할 수 없는 천체']);
          if (o.sizeArcmin) rows.push(['겉보기 크기', CN.fmtArcmin(o.sizeArcmin)]);
        }
        if (sel.kind !== 'con') thumb = '<div class="im">' + CN.thumbHtml(state, o, 150) + '</div>';
      }
      if (d) {
        rows.push(['적경/적위', CN.fmtRA(((Math.atan2(d[1], d[0]) * R2D + 360) % 360) / 15) + ' / ' + fmtDeg(Math.asin(clamp(d[2], -1, 1)) * R2D, true)]);
        if (S.mode === 'earth') { var hh = m3v(Fhor, d), alt = Math.asin(clamp(hh[2], -1, 1)) * R2D; rows.push(['방위/고도', window.Astro.dir8((Math.atan2(-hh[1], hh[0]) * R2D + 360) % 360) + '쪽 ' + fmtDeg((Math.atan2(-hh[1], hh[0]) * R2D + 360) % 360) + ' / ' + fmtDeg(alt, true) + (alt < 0 ? ' (지평선 아래)' : '')]); }
      }
      if (p && sel.kind !== 'con' && !(o && o._body) && !(sel.kind === 'obj' && !o._ly)) rows = rows.concat(galText(p));
      h = [thumb + '<h2>' + esc(title) + '</h2><div class="sub">' + esc(sub) + '</div>',
        rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join(''),
        (sel.kind !== 'star' ? '<button class="sbtn" data-act="detail">자세히</button>' : '') +
        '<button class="sbtn" data-act="center">가운데로<kbd>Space</kbd></button><button class="sbtn" data-act="clear">선택 해제</button>'];
    }
    // 시각이 흐르면 숫자만 바뀌므로 조각별로 갱신 — 버튼을 누르는 도중에 다시 그려져 클릭이 사라지지 않게
    if (typeof h === 'string') { if (h !== infoHtml) { infoHtml = h; el.innerHTML = h; infoParts = null; } return; }
    if (!infoParts) { infoHtml = ''; el.innerHTML = '<div></div><dl></dl><div class="acts"></div>'; infoParts = ['', '', '']; }
    h.forEach(function (x, i) { if (x !== infoParts[i]) { infoParts[i] = x; el.children[i].innerHTML = x; } });
  }
  document.getElementById('info').addEventListener('click', function (ev) {
    if (ev.target.closest('h2')) { infoMin = !infoMin; this.classList.toggle('min', infoMin); return; }
    var b = ev.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'clear') { sel = null; tracking = false; if (S.center === 'sel') S.center = 'sun'; updateInfo(); buildTools(); }
    else if (b.dataset.act === 'center') afterSelect(true);
    else if (b.dataset.act === 'detail') openDetail();
  });
  function openDetail() {
    if (!sel || sel.kind === 'star') return;
    window.Astro.setLocation(S.lat0, S.lon0, 50, S.place);
    var base = new Date(S.time), win = window.Astro.nightWindow(base), hours = [];
    var from = win.sunset || new Date(win.noon.getTime() + 6 * 3600e3), to = win.sunrise || new Date(win.noon.getTime() + 18 * 3600e3);
    var h = new Date(from.getTime()); h.setMinutes(0, 0, 0); if (h < from) h = new Date(h.getTime() + 3600e3);
    for (; h <= to && hours.length < 24; h = new Date(h.getTime() + 3600e3)) hours.push(h);
    CN.openObjectModal(state, sel.o.id, { sky: {
      title: (win.noon.getMonth() + 1) + '월 ' + win.noon.getDate() + '일 밤, ' + S.place + ' — 정각마다',
      times: hours.map(function (x) { return { label: pad(x.getHours()) + ':00', date: x }; }), highlight: -1, refDate: base,
      dayLabel: (win.noon.getMonth() + 1) + '/' + win.noon.getDate(),
    } });
  }

  // ---------- 도구 막대·상태줄 ----------
  var RATES = [-604800, -86400, -3600, -600, -60, -10, -1, 1, 10, 60, 600, 3600, 86400, 604800];
  var EARTH_TOOLS = [
    ['conLines', '별자리 선', 'C'], ['conNames', '별자리 이름', 'V'], ['bounds', '경계', 'B'], '|',
    ['eqGrid', '적도 격자', 'E'], ['azGrid', '방위 격자', 'Z'], ['ecliptic', '황도', ','], ['galEq', '은하 적도', ''], '|',
    ['ground', '지면', 'G'], ['atm', '대기', 'A'], ['cardinal', '방위', 'Q'], '|',
    ['dso', '딥스카이', 'D'], ['starNames', '별 이름', 'S'], ['planets', '태양계', 'P'], ['milky', '은하수', 'M'],
  ];
  var GAL_TOOLS = [['conLines', '별자리 선', 'C'], ['gNames', '천체 이름', 'V'], ['arms', '은하 팔 이름', 'R'], ['rings', '거리 눈금', 'E'], ['stems', '높이 기둥', 'Z'], ['sight', '지구에서의 시선', 'L']];
  function buildTools() {
    var el = document.getElementById('tools'), h = '', g = S.mode === 'galaxy';
    var tb = function (t) { return t === '|' ? '<span class="sep"></span>' : '<button class="sbtn' + (S.f[t[0]] ? ' on' : '') + '" data-flag="' + t[0] + '" title="' + t[1] + (t[2] ? ' (' + t[2] + ')' : '') + '">' + t[1] + (t[2] ? '<kbd>' + t[2] + '</kbd>' : '') + '</button>'; };
    if (!g) {
      h += EARTH_TOOLS.map(tb).join('') + '<span class="sep"></span>' +
        '<button class="sbtn" data-act="mount" title="마운트 전환 (Ctrl+M)">' + (S.mount === 'az' ? '경위대식' : '적도의식') + '</button><span class="sep"></span>' +
        '<button class="sbtn" data-act="slow" title="느리게·거꾸로 (J)">◀◀</button><button class="sbtn' + (S.playing ? ' on' : '') + '" data-act="play" title="재생/멈춤 (K)">' + (S.playing ? '❚❚' : '▶') + '</button><button class="sbtn" data-act="fast" title="빠르게 (L)">▶▶</button><button class="sbtn" data-act="now" title="지금 시각으로 (8)">지금</button>';
    } else {
      h += '<span class="lbl">크기</span>' + PRESETS.map(function (p, i) { return '<button class="sbtn" data-preset="' + i + '">' + p.ko + '</button>'; }).join('') + '<span class="sep"></span>' +
        '<span class="lbl">중심</span>' + [['sun', '태양'], ['gc', '은하 중심'], ['sel', '고른 천체']].map(function (c) { return c[0] === 'sel' && !selPos() ? '' : '<button class="sbtn' + (S.center === c[0] ? ' on' : '') + '" data-center="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '<span class="sep"></span>' +
        GAL_TOOLS.map(tb).join('') + '<span class="sep"></span>';
    }
    h += '<span class="sep"></span><span class="lbl">종류</span>' + [['star', '별'], ['cluster', '성단'], ['nebula', '성운'], ['galaxy', '은하']].map(function (t) { return '<button class="sbtn' + (S.types[t[0]] ? ' on' : '') + '" data-type="' + t[0] + '">' + t[1] + '</button>'; }).join('');
    el.innerHTML = h;
    var mb = document.getElementById('bMode');
    mb.textContent = g ? '지구에서 보기' : '은하에서 보기';
    mb.title = g ? '지구에서 본 하늘로 돌아가기 (Tab)' : '지구를 떠나 우리은하 전체를 보기 (Tab)';
  }
  document.getElementById('tools').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.flag) toggle(b.dataset.flag);
    else if (b.dataset.type) { S.types[b.dataset.type] = !S.types[b.dataset.type]; rebuildStems(); save(); buildTools(); }
    else if (b.dataset.preset) { if (!(anim && anim.lock)) goPreset(PRESETS[+b.dataset.preset]); }
    else if (b.dataset.center) { if (!(anim && anim.lock)) { S.center = b.dataset.center; tweenOrbit({ target: centerPoint(S.center), dist: O.dist }, 1200); buildTools(); } }
    else act(b.dataset.act);
  });
  function toggle(k) { S.f[k] = !S.f[k]; save(); buildTools(); }
  function act(a) {
    if (a === 'mount') { var f = fwdW(); S.mount = S.mount === 'az' ? 'eq' : 'az'; setViewDir(f); save(); say(S.mount === 'az' ? '경위대식 — 지평선이 수평으로 고정돼요' : '적도의식 — 하늘(적경·적위)이 고정되고 땅이 돌아요', 3500); }
    else if (a === 'play') { S.playing = !S.playing; if (S.playing && S.rate !== 1) S.rate = 1; }
    else if (a === 'fast' || a === 'slow') { var i = RATES.indexOf(S.rate); if (i < 0) i = 7; i = clamp(i + (a === 'fast' ? 1 : -1), 0, RATES.length - 1); S.rate = RATES[i]; S.playing = true; }
    else if (a === 'now') { S.time = Date.now(); S.rate = 1; S.playing = true; bodyT = null; }
    buildTools();
  }
  document.getElementById('bMode').onclick = function () { if (S.mode === 'earth') enterGalaxy(); else enterEarth(); };

  function rateText() {
    if (!S.playing) return '멈춤';
    var r = Math.abs(S.rate), s = r === 1 ? '실제 속도' : r < 60 ? r + '배속' : r < 3600 ? '1초에 ' + r / 60 + '분' : r < 86400 ? '1초에 ' + r / 3600 + '시간' : '1초에 ' + r / 86400 + '일';
    return (S.rate < 0 ? '거꾸로 ' : '') + s;
  }
  var statusHtml = '';
  function updateStatus() {
    var d = new Date(S.time), g = S.mode === 'galaxy';
    var clock = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    // 틀은 모드가 바뀔 때만 다시 만들고 글자만 갈아 끼운다(누르는 도중 버튼이 사라지지 않게)
    var el = document.getElementById('status');
    if (statusHtml !== S.mode) {
      statusHtml = S.mode;
      el.innerHTML = g ? '<span data-k="dist"></span><span>은하 팔·원반은 개략 모형, 천체 위치는 실제 측정값</span><span class="grow"></span>'
        : '<button data-st="loc" data-k="loc"></button><span data-k="fov"></span><span class="grow"></span><span data-k="rate"></span><button data-st="time" class="clock" data-k="clock"></button>';
    }
    var put = function (k, v) { var n = el.querySelector('[data-k=' + k + ']'); if (n && n.textContent !== v) n.textContent = v; };
    if (g) put('dist', '보는 거리 ' + CN.fmtLy(O.dist < 10 ? O.dist : Math.round(O.dist)));
    else { put('loc', S.place); put('fov', '시야 ' + (S.fov < 10 ? S.fov.toFixed(1) : Math.round(S.fov)) + '°'); put('rate', rateText()); put('clock', clock); }
    if (g && !anim) {
      var c = O.dist < 300 ? PRESETS[0].cap : O.dist < 6000 ? PRESETS[1].cap : O.dist < 45000 ? PRESETS[2].cap : O.dist < 9e5 ? PRESETS[3].cap : O.dist < 3e7 ? PRESETS[4].cap : PRESETS[5].cap;
      if (performance.now() > caption.until && c !== caption.text) { caption.text = c; var el = document.getElementById('caption'); el.textContent = c; el.style.opacity = 1; }
    }
  }
  document.getElementById('status').addEventListener('click', function (ev) { var b = ev.target.closest('[data-st]'); if (b) openSettings(); });

  function openSettings() {
    var d = new Date(S.time);
    var m = CN.modal('<div class="modal-head"><div class="t">날짜·시각·장소</div><button class="icon-btn" data-close>닫기</button></div><div style="padding:0 16px 18px">' +
      '<div class="setgrid"><div><label class="field">날짜</label><input type="date" id="sD"></div><div><label class="field">시각</label><input type="time" id="sT" step="60"></div></div>' +
      '<div class="chips" style="margin-top:8px"><button class="chip" data-q="now">지금</button><button class="chip" data-q="21">오늘 밤 9시</button><button class="chip" data-q="0">자정</button></div>' +
      '<label class="field">장소</label><div class="chips"><button class="chip" data-q="gwangsu">광수중학교</button><button class="chip" data-q="gps">내 위치</button></div>' +
      '<div class="setgrid" style="margin-top:8px"><div><label class="field">위도 (북+ 남−)</label><input type="number" id="sLat" step="0.0001" min="-90" max="90"></div><div><label class="field">경도 (동+ 서−)</label><input type="number" id="sLon" step="0.0001" min="-180" max="180"></div></div>' +
      '<button class="btn primary block" style="margin-top:16px" id="sOk">적용</button></div>', { narrow: true });
    var q = function (s) { return m.el.querySelector(s); }, name = S.place;
    q('#sD').value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); q('#sT').value = pad(d.getHours()) + ':' + pad(d.getMinutes());
    q('#sLat').value = S.lat0; q('#sLon').value = S.lon0;
    m.el.querySelectorAll('[data-q]').forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.q, n = new Date();
        if (k === 'now' || k === '21' || k === '0') { q('#sD').value = n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); q('#sT').value = k === 'now' ? pad(n.getHours()) + ':' + pad(n.getMinutes()) : k === '21' ? '21:00' : '00:00'; }
        else if (k === 'gwangsu') { q('#sLat').value = CN.LOC.lat; q('#sLon').value = CN.LOC.lon; name = CN.LOC.name; }
        else if (navigator.geolocation) { CN.toast('현재 위치를 찾는 중…', 6000); navigator.geolocation.getCurrentPosition(function (p) { q('#sLat').value = p.coords.latitude.toFixed(4); q('#sLon').value = p.coords.longitude.toFixed(4); name = '내 위치'; CN.toast('현재 위치를 넣었어요'); }, function () { CN.toast('위치를 가져오지 못했어요. 직접 입력해 주세요.', 4000); }, { timeout: 10000, maximumAge: 600000 }); }
      };
    });
    q('#sOk').onclick = function () {
      var la = parseFloat(q('#sLat').value), lo = parseFloat(q('#sLon').value), dd = q('#sD').value.split('-'), tt = q('#sT').value.split(':');
      if (isNaN(la) || la < -90 || la > 90 || isNaN(lo) || lo < -180 || lo > 180) return CN.toast('위도는 −90~90, 경도는 −180~180 사이로 넣어 주세요.');
      if (dd.length === 3 && tt.length >= 2) { S.time = new Date(+dd[0], +dd[1] - 1, +dd[2], +tt[0], +tt[1], 0).getTime(); if (S.rate !== 1) { S.rate = 1; } bodyT = null; }
      if (la !== S.lat0 || lo !== S.lon0) { S.lat0 = la; S.lon0 = lo; S.place = name === S.place && (la !== CN.LOC.lat || lo !== CN.LOC.lon) ? '지정한 곳 (' + la.toFixed(2) + ', ' + lo.toFixed(2) + ')' : name; observer = new A.Observer(la, lo, 50); bodyT = null; }
      save(); buildTools(); m.close();
    };
  }
  function openHelp() {
    var k = function (a, b) { return '<kbd>' + a + '</kbd><span>' + b + '</span>'; };
    CN.modal('<div class="modal-head"><div class="t">3D 우리은하 성도 — 사용법</div><button class="icon-btn" data-close>닫기</button></div><div style="padding:0 16px 18px">' +
      '<p>밤하늘의 천체는 지구에서 보면 <b>방향</b>만 알 수 있어요. 여기에 <b>거리</b>를 더하면 우리은하 속 실제 위치가 나와요. <b>은하에서 보기</b>를 누르면 지구를 떠나 뒤로 물러나면서 그 위치를 보여 줘요.</p>' +
      '<h3>지구에서 본 하늘 (Stellarium과 같은 단축키)</h3><div class="help-keys">' +
      k('끌기 / 방향키', '하늘 돌리기') + k('휠 / PgUp·PgDn', '확대·축소') + k('클릭', '천체 고르기') + k('Space', '고른 천체를 가운데로(따라가기)') +
      k('C · V · B', '별자리 선 · 이름 · 경계') + k('E · Z', '적도 격자 · 방위 격자') + k(', ', '황도') + k('G · A · Q', '지면 · 대기 · 방위 표시') +
      k('D · S · P · M', '딥스카이 · 별 이름 · 태양계 · 은하수') + k('Ctrl+M', '경위대식 ↔ 적도의식') + k('J · K · L', '시간 느리게 · 재생/멈춤 · 빠르게') + k('7 · 8', '시간 멈춤 · 지금으로') +
      k('Ctrl+F / F3', '천체 찾기') + k('Tab', '지구 ↔ 은하 전환') + '</div>' +
      '<h3>은하에서 본 모습</h3><div class="help-keys">' + k('끌기', '돌려 보기') + k('휠', '멀리·가까이 (1광년 ~ 수십억 광년)') + k('1 ~ 6', '크기 단계 바로 가기') + k('C · V · R · E · Z · L', '별자리 선 · 이름 · 팔 이름 · 거리 눈금 · 높이 기둥 · 시선') + '</div>' +
      '<h3>자료</h3><p class="hint">별 26,656개(7.5등급까지)의 방향·거리·밝기·색과 별자리 선·경계는 이 프로그램을 만든 컴퓨터에 설치된 Stellarium 25.2의 자료 파일(Hipparcos·Gaia DR3 기반)에서 뽑았어요. 성단·성운·은하 ' + objs.filter(isDso).length + '개와 이름 붙은 별은 밤하늘 관측 도우미와 같은 목록이에요. 은하 원반·나선팔 그림은 전파 관측으로 잰 팔 위치를 따라 그린 <b>개략 모형</b>이고, 시차가 아주 작은 별(' + '약 300개)은 거리가 불확실해 6,500광년에 두었어요. 은하수 띠는 이 모형을 태양 자리에서 본 모습이에요.</p></div>');
  }
  document.getElementById('bHelp').onclick = openHelp;

  // ---------- 찾기 (한글 조합 중엔 입력창을 건드리지 않고 결과만 갱신) ----------
  (function () {
    var q = document.getElementById('q'), box = document.getElementById('searchRes'), composing = false, items = [];
    function run() {
      var s = q.value.toLowerCase().replace(/\s+/g, '');
      if (!s) { box.style.display = 'none'; return; }
      items = state.list.filter(function (o) { return (o._dir || o._body) && CN.searchText(o).indexOf(s) >= 0; }).slice(0, 12);
      box.innerHTML = items.length ? items.map(function (o, i) { return '<button data-i="' + i + '">' + esc(o.nameKo) + '<small>' + esc((o.catalog && o.catalog !== o.nameKo ? o.catalog + ' · ' : '') + CN.typeLabel(o)) + '</small></button>'; }).join('') : '<button disabled>찾는 천체가 없어요</button>';
      box.style.display = 'block';
    }
    function choose(o) { box.style.display = 'none'; q.value = ''; q.blur(); selectObj(o, true); }
    q.addEventListener('compositionstart', function () { composing = true; });
    q.addEventListener('compositionend', function () { composing = false; run(); });
    q.addEventListener('input', function () { if (!composing) run(); });
    q.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !composing && !ev.isComposing && items.length) choose(items[0]); if (ev.key === 'Escape') { q.value = ''; box.style.display = 'none'; q.blur(); } ev.stopPropagation(); });
    box.addEventListener('click', function (ev) { var b = ev.target.closest('[data-i]'); if (b) choose(items[+b.dataset.i]); });
    document.addEventListener('pointerdown', function (ev) { if (!ev.target.closest('#searchBox')) box.style.display = 'none'; });
  })();

  // ---------- 입력 ----------
  var ptrs = {}, pinch0 = 0, moved = 0, downAt = null;
  function userMove() { if (anim && !anim.lock) anim = null; tracking = false; return !(anim && anim.lock); }
  ov.addEventListener('pointerdown', function (ev) {
    ov.setPointerCapture(ev.pointerId); ptrs[ev.pointerId] = [ev.clientX, ev.clientY];
    var ids = Object.keys(ptrs);
    if (ids.length === 1) { moved = 0; downAt = [ev.clientX, ev.clientY]; }
    if (ids.length === 2) pinch0 = Math.hypot(ptrs[ids[0]][0] - ptrs[ids[1]][0], ptrs[ids[0]][1] - ptrs[ids[1]][1]);
    ov.classList.add('drag');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  ov.addEventListener('pointermove', function (ev) {
    var p = ptrs[ev.pointerId]; if (!p) return;
    var dx = ev.clientX - p[0], dy = ev.clientY - p[1]; p[0] = ev.clientX; p[1] = ev.clientY;
    var ids = Object.keys(ptrs);
    if (ids.length === 2) {
      var d = Math.hypot(ptrs[ids[0]][0] - ptrs[ids[1]][0], ptrs[ids[0]][1] - ptrs[ids[1]][1]);
      if (pinch0 > 0 && d > 0) zoom(pinch0 / d);
      pinch0 = d; moved = 99; return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved < 4 || !userMove()) return;
    if (S.mode === 'earth') {
      var k = S.fov / H * 1.05;
      S.lon = (S.lon + (S.mount === 'az' ? -1 : 1) * dx * k / Math.max(Math.cos(S.lat * D2R), 0.15) + 360) % 360;
      S.lat = clamp(S.lat + dy * k, -89.5, 89.5);
    } else { O.yaw -= dx * 0.005; O.pitch = clamp(O.pitch + dy * 0.005, -1.55, 1.55); }
  });
  function up(ev) {
    var was = Object.keys(ptrs).length; delete ptrs[ev.pointerId];
    if (!Object.keys(ptrs).length) ov.classList.remove('drag');
    if (was === 1 && moved < 6 && downAt && !(anim && anim.lock)) { var s = pick(ev.clientX, ev.clientY); if (s) { sel = s; afterSelect(false); } }
  }
  ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', function (ev) { delete ptrs[ev.pointerId]; ov.classList.remove('drag'); });
  function zoom(k) {
    if (!userMove()) return;
    if (S.mode === 'earth') S.fov = clamp(S.fov * k, 0.5, 120);
    else O.dist = clamp(O.dist * k, 1, 3e10);
  }
  ov.addEventListener('wheel', function (ev) { ev.preventDefault(); zoom(Math.exp(clamp(ev.deltaY, -300, 300) * (S.mode === 'earth' ? 0.0012 : 0.0018))); }, { passive: false });
  ov.addEventListener('dblclick', function (ev) { var s = pick(ev.clientX, ev.clientY); if (s) { sel = s; afterSelect(true); } });

  document.addEventListener('keydown', function (ev) {
    if (document.querySelector('.modal-back') || /^(INPUT|TEXTAREA|SELECT)$/.test((ev.target.tagName || ''))) return;
    var k = ev.key, g = S.mode === 'galaxy', lk = k.length === 1 ? k.toLowerCase() : k;
    if ((ev.ctrlKey || ev.metaKey) && lk === 'm') { ev.preventDefault(); if (!g) act('mount'); return; }
    if (((ev.ctrlKey || ev.metaKey) && lk === 'f') || k === 'F3') { ev.preventDefault(); document.getElementById('q').focus(); return; }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (k === 'F1' || k === '?') { ev.preventDefault(); openHelp(); return; }
    if (k === 'Tab') { ev.preventDefault(); document.getElementById('bMode').click(); return; }
    if (k === ' ') { ev.preventDefault(); if (sel) afterSelect(true); return; }
    if (k === 'Escape') { sel = null; tracking = false; updateInfo(); buildTools(); return; }
    if (k === 'PageUp' || k === '/') { ev.preventDefault(); zoom(0.8); return; }
    if (k === 'PageDown' || k === '\\') { ev.preventDefault(); zoom(1.25); return; }
    if (/^Arrow/.test(k)) {
      ev.preventDefault(); if (!userMove()) return;
      var sx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, sy = k === 'ArrowUp' ? 1 : k === 'ArrowDown' ? -1 : 0;
      if (!g) { S.lon = (S.lon + (S.mount === 'az' ? 1 : -1) * sx * S.fov * 0.06 / Math.max(Math.cos(S.lat * D2R), 0.15) + 360) % 360; S.lat = clamp(S.lat + sy * S.fov * 0.06, -89.5, 89.5); }
      else { O.yaw += sx * 0.06; O.pitch = clamp(O.pitch - sy * 0.06, -1.55, 1.55); }
      return;
    }
    if (g) {
      var gm = { c: 'conLines', v: 'gNames', r: 'arms', e: 'rings', z: 'stems', l: 'sight' };
      if (gm[lk]) toggle(gm[lk]);
      else if (/^[1-6]$/.test(k) && !(anim && anim.lock)) goPreset(PRESETS[+k - 1]);
      return;
    }
    var em = { c: 'conLines', v: 'conNames', b: 'bounds', e: 'eqGrid', z: 'azGrid', ',': 'ecliptic', g: 'ground', a: 'atm', q: 'cardinal', d: 'dso', n: 'dso', s: 'starNames', p: 'planets', m: 'milky' };
    if (em[lk]) toggle(em[lk]);
    else if (lk === 'j') act('slow'); else if (lk === 'l') act('fast'); else if (lk === 'k') act('play');
    else if (k === '7') { S.playing = false; buildTools(); } else if (k === '8') act('now');
    else if (lk === 't') { tracking = !tracking && !!sel; }
  });

  // 시험·디버그용
  window.SM = { S: S, O: O, get sel() { return sel; }, select: function (id) { if (state.byId[id]) selectObj(state.byId[id], true); }, enterGalaxy: enterGalaxy, enterEarth: enterEarth, proj: proj, objs: objs, get tr() { return tr; } };
})();
