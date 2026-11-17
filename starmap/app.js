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
      stars: true, planetNames: true, art: false, dsoImg: true, meridian: false, horizon: false, equator: false, galGrid: false, fog: true, compass: false,
      gNames: true, arms: true, rings: true, stems: false, sight: true },
    types: { star: true, cluster: true, nebula: true, galaxy: true },
    center: 'gc',
    proj: 'stereo', flipH: false, flipV: false, night: false,
    // 보기 설정(F4·F2): 별 절대·상대 크기, 반짝임, 광공해(보틀 등급), 은하수 밝기, 이름표 양, 별자리 그림 밝기, 달 확대, 정보창, 막대 자동 숨김
    v: { abs: 1, rel: 1, twinkle: 0.3, bortle: 3, milky: 1, starLab: 3, dsoLab: 3, art: 0.45, moonScale: false, info: 'full', autohide: false },
  };
  var DEFAULT_VIEW = { lon: 180, lat: 28, fov: 70 };
  try {
    var sv = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (sv) { Object.assign(S.v, sv.v || {}); ['mount', 'lat0', 'lon0', 'place', 'proj', 'flipH', 'flipV', 'night'].forEach(function (k) { if (sv[k] !== undefined) S[k] = sv[k]; }); Object.assign(S.f, sv.f || {}); Object.assign(S.types, sv.types || {}); }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ mount: S.mount, lat0: S.lat0, lon0: S.lon0, place: S.place, f: S.f, types: S.types, proj: S.proj, flipH: S.flipH, flipV: S.flipV, night: S.night, v: S.v })); } catch (e) {} }

  var O = { yaw: 0, pitch: 0.6, dist: 130000, target: [0, 0, 0] };   // 은하 모드 궤도 카메라(은하 좌표계 각도, 표적은 적도 좌표)
  var tr = 0;                 // 0 = 지구, 1 = 은하 (전환 중엔 사이값)
  var anim = null, sel = null, tracking = false;
  var observer = new A.Observer(S.lat0, S.lon0, 50);
  var W = 1, H = 1, dpr = 1;
  var M = [1, 0, 0, 0, 1, 0, 0, 0, 1], cam = [0, 0, 0], Fhor = M, fovRad = 1, sunHor = [0, 0, -1], dayF = 0, twF = 0;
  var state = null, objs = [], bodies = [], cons = [], sky = null;
  var starN = 0, sPos = null, sMag = null, sAbs = null, sBv = null, sHip = null, starObj = {};
  var caption = { text: '', until: 0 };
  // 투영: Stellarium의 평사(기본)·원근·등거리 어안·정사
  var PTYPE = { stereo: 0, persp: 1, fisheye: 2, ortho: 3 }, THMAX = { stereo: 2.5, persp: 1.45, fisheye: 3.05, ortho: 1.5707 }, FOVMAX = { stereo: 180, persp: 120, fisheye: 200, ortho: 180 };
  function radF(t) { return S.proj === 'stereo' ? 2 * Math.tan(t / 2) : S.proj === 'persp' ? Math.tan(Math.min(t, 1.52)) : S.proj === 'fisheye' ? t : Math.sin(Math.min(t, Math.PI / 2)); }
  var AND = window.AndroidStarmap || null;      // 안드로이드 앱 안에서 열렸을 때만 있음(starmap-android)
  var meas = { on: false, a: null, b: null }, shot = false, artImgs = {}, zoomBack = null, fps = 60;

  // ---------- WebGL ----------
  var glc = document.getElementById('gl'), ov = document.getElementById('ov'), ctx = ov.getContext('2d');
  var gl = glc.getContext('webgl', { antialias: true, alpha: false, premultipliedAlpha: false });
  if (!gl) { document.getElementById('loading').textContent = '이 브라우저는 WebGL을 지원하지 않아 성도를 그릴 수 없어요.'; return; }

  var RADF = 'float rad(float t) { if (uType < 0.5) return 2.0 * tan(t * 0.5); if (uType < 1.5) return tan(min(t, 1.52)); if (uType < 2.5) return t; return sin(min(t, 1.5708)); }';
  var PROJ = [
    'uniform mat3 uM; uniform vec3 uCam; uniform float uFov, uAspect, uProj, uType, uThMax; uniform vec2 uFlip;',
    RADF,
    'vec4 project(vec3 v) {',
    '  vec3 n = v / max(length(v), 1e-9);',
    '  float th = acos(clamp(-n.z, -1.0, 1.0)), rho = max(length(n.xy), 1e-7);',
    '  vec4 s = vec4(n.xy / rho * (rad(th) / rad(uFov * 0.5)) * uFlip, 0.0, 1.0);',
    '  vec4 p = vec4(n.xy / tan(uFov * 0.5), 0.0, -n.z);',
    '  vec4 o = mix(s, p, uProj); o.x /= uAspect;',
    '  if (uProj < 0.5 && th > uThMax) o.z = 2.0 * o.w;',
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
    'uniform float uLim, uDpr, uFloor, uAbs, uRel, uTw, uTime; varying vec4 vCol;\n' +
    'void main() { vec3 v = uM * (aPos - uCam); float d = length(v);\n' +
    '  float m = aMag + 5.0 * log(max(d, 1e-4) / 32.6156) / 2.302585;\n' +
    '  float lum = pow(10.0, 0.4 * (uLim - m));\n' +
    '  float r = clamp(0.95 * uAbs * pow(lum, 0.25 * uRel), 0.0, 15.0 * uAbs);\n' +
    '  float a = pow(clamp(lum, 0.0, 1.0), 1.4);\n' +
    '  a *= 1.0 - uTw * 0.55 * (0.5 + 0.5 * sin(uTime * (7.0 + fract(aMag * 7.31) * 9.0) + aPos.x * 0.37));\n' +
    '  a = max(a, uFloor);\n' +
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
    'varying vec2 vN; uniform mat3 uToHor; uniform vec3 uSun; uniform float uFov, uAspect, uPass, uAtm, uAlpha, uType, uFog; uniform vec2 uFlip;\n' + RADF + '\n' +
    'void main() { vec2 X = vec2(vN.x * uAspect, vN.y) * uFlip; float L = max(length(X), 1e-6), R = L * rad(uFov * 0.5), th;\n' +
    '  if (uType < 0.5) th = 2.0 * atan(R * 0.5); else if (uType < 1.5) th = atan(R); else if (uType < 2.5) th = R; else { if (R > 1.0) discard; th = asin(R); }\n' +
    '  if (th > 3.1) discard;\n' +
    '  vec3 h = uToHor * vec3(X / L * sin(th), -cos(th)); float alt = h.z;\n' +
    '  float day = smoothstep(-0.10, 0.12, uSun.z), tw = smoothstep(-0.31, -0.02, uSun.z);\n' +
    '  if (uPass < 0.5) { if (alt < 0.0) discard; float up = pow(clamp(alt, 0.0, 1.0), 0.45);\n' +
    '    vec3 dayC = mix(vec3(0.62, 0.76, 0.93), vec3(0.16, 0.36, 0.78), up);\n' +
    '    vec3 twC = mix(vec3(0.20, 0.16, 0.22), vec3(0.02, 0.04, 0.12), up);\n' +
    '    float toward = max(dot(normalize(h.xy + 1e-5), normalize(uSun.xy + 1e-5)), 0.0);\n' +
    '    vec3 glow = vec3(0.9, 0.42, 0.12) * pow(toward, 3.0) * (1.0 - up) * tw * (1.0 - day) * 0.8;\n' +
    '    gl_FragColor = vec4(mix(twC * tw + glow, dayC, day) * uAlpha, 1.0);\n' +
    '  } else { if (alt >= 0.0) discard;\n' +
    '    vec3 g = mix(vec3(0.030, 0.037, 0.028), vec3(0.17, 0.21, 0.13), day * uAtm);\n' +
    '    g *= 1.0 + uFog * 0.9 * smoothstep(-0.07, 0.0, alt);\n' +
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
    fetch('data/sky.json?v=2').then(function (r) { return r.json(); }),
    fetch('data/dso.json?v=2').then(function (r) { return r.json(); }).catch(function () { return {}; }),
    CN.loadAll(function () {}),
  ]).then(function (res) {
    sky = res[1]; state = res[3]; initDsoImgs(res[2]);
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
  // ---- 폰 방향으로 보기 (나침반·자이로·GPS) ----
  // W3C DeviceOrientation: 지구 좌표(동 E, 북 N, 위 U)에서 폰 좌표(x 오른쪽, y 위쪽, z 화면 밖) 회전 R = Rz(α)·Rx(β)·Ry(γ).
  // 폰 뒷면 방향 = −z, 화면 위쪽 = 화면 회전각만큼 돌린 y. 이 성도의 지평 좌표는 (북, 서, 위).
  var SENSOR_OK = typeof window.DeviceOrientationEvent !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || !!(window.matchMedia && matchMedia('(any-pointer: coarse)').matches));
  var sensor = { on: false, target: null, cur: null, last: 0, timer: null };
  function sensorHor(al, be, ga) {
    var a = al * D2R, b = be * D2R, g = ga * D2R, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
    // R의 열 = 폰 x·y·z 축을 지구(E,N,U) 좌표로
    var X = [ca * cg - sa * sb * sg, sa * cg + ca * sb * sg, -cb * sg];
    var Y = [-sa * cb, ca * cb, sb];
    var Z = [ca * sg + sa * sb * cg, sa * sg - ca * sb * cg, cb * cg];
    var th = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * D2R, ct = Math.cos(th), st = Math.sin(th);
    var up = [0, 1, 2].map(function (i) { return st * X[i] + ct * Y[i]; });
    var toHor = function (v) { return [v[1], -v[0], v[2]]; };
    var f = norm(toHor(Z.map(function (x) { return -x; }))), u = norm(toHor(up)), r = norm(cross(f, u));
    u = cross(r, f);
    return [r[0], r[1], r[2], u[0], u[1], u[2], -f[0], -f[1], -f[2]];    // 지평 좌표 → 화면
  }
  function onOrient(ev) {
    if (!sensor.on) return;
    var al = null;
    if (ev.type === 'deviceorientationabsolute' || ev.absolute === true) al = ev.alpha;
    else if (ev.webkitCompassHeading != null) al = 360 - ev.webkitCompassHeading;     // iOS 사파리
    if (al == null || ev.beta == null || ev.gamma == null) return;
    sensor.target = sensorHor(al, ev.beta, ev.gamma); sensor.last = performance.now();
  }
  window.addEventListener('deviceorientationabsolute', onOrient);
  window.addEventListener('deviceorientation', onOrient);
  var SENSOR_TIP = '인식이 잘 안될 경우 손으로 핸드폰을 잡고 ∞ 모양으로 흔들고 다시 확인해보세요';
  function sensorStart() {
    var go = function () {
      sensor.on = true; sensor.target = sensor.cur = null; sensor.last = 0;
      S.time = Date.now(); S.rate = 1; S.playing = true; bodyT = null; tracking = false;
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function (p) { setPlace('내 위치 (GPS)', +p.coords.latitude.toFixed(4), +p.coords.longitude.toFixed(4)); buildTools(); }, function () { CN.toast('위치를 못 받아서 ' + S.place + ' 기준으로 보여 줘요', 3500); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
      clearTimeout(sensor.timer);
      sensor.timer = setTimeout(function () { if (sensor.on && !sensor.last) { sensorStop(); CN.toast('이 기기에서는 나침반(방향 센서)을 읽을 수 없어요', 4000); } }, 2500);
      var seen = false; try { seen = localStorage.getItem('cnStarmapSensorTip') === '1'; } catch (e) {}
      if (!seen) {
        try { localStorage.setItem('cnStarmapSensorTip', '1'); } catch (e) {}
        var m = CN.modal('<div class="modal-head"><div class="t">폰 방향으로 보기</div><button class="icon-btn" data-close>닫기</button></div><div style="padding:0 16px 18px"><p>폰 뒷면이 향하는 쪽의 밤하늘을 보여 줘요. 폰을 하늘에 대고 이리저리 돌려 보세요.</p><p style="font-weight:700;color:var(--text-strong)">' + esc(SENSOR_TIP) + '</p><button class="btn primary block" data-ok>확인</button></div>', { narrow: true });
        m.el.querySelector('[data-ok]').onclick = function () { m.close(); };
      } else say('폰 뒷면이 향하는 쪽 하늘이에요', 3500);
      buildTools();
    };
    // iOS 13+는 버튼을 누른 순간에 허락을 받아야 함
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      var ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      // 허락이 꼭 필요한 건 iOS뿐 — 다른 기기는 결과와 상관없이 켜 보고, 값이 안 들어오면 2.5초 뒤 안내하고 끔
      DeviceOrientationEvent.requestPermission().then(function (r) { if (r === 'granted' || !ios) go(); else CN.toast('방향 센서 사용을 허락해야 쓸 수 있어요', 3500); }).catch(function () { if (!ios) go(); else CN.toast('방향 센서를 켤 수 없어요', 3500); });
    } else go();
  }
  function sensorStop() {
    if (!sensor.on) return;
    var f = fwdW(); sensor.on = false; sensor.cur = sensor.target = null; clearTimeout(sensor.timer);
    if (f) setViewDir(f);
    buildTools();
  }
  function sensorActive() { return sensor.on && sensor.cur && S.mode === 'earth'; }

  function earthM() {
    if (sensorActive()) return m3mul(sensor.cur, Fhor);
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
    gl.uniform1f(p.u.uType, PTYPE[S.proj]); gl.uniform1f(p.u.uThMax, THMAX[S.proj]); gl.uniform2f(p.u.uFlip, S.flipH ? -1 : 1, S.flipV ? -1 : 1);
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
  function pxPerRad() { return lerp(1 / radF(fovRad / 2), 1 / Math.tan(fovRad / 2), tr) * H / 2; }
  // 화면 점 → 적도 방향(지구 모드). proj()의 역.
  function unproj(x, y) {
    var X = (x / W * 2 - 1) * (W / H) * (S.flipH ? -1 : 1), Y = (1 - y / H * 2) * (S.flipV ? -1 : 1), L = Math.max(Math.hypot(X, Y), 1e-9), R = L * radF(fovRad / 2), th;
    if (S.proj === 'stereo') th = 2 * Math.atan(R / 2); else if (S.proj === 'persp') th = Math.atan(R); else if (S.proj === 'fisheye') th = R; else { if (R > 1) return null; th = Math.asin(R); }
    if (th > 3.1) return null;
    return m3v(m3T(M), [X / L * Math.sin(th), Y / L * Math.sin(th), -Math.cos(th)]);
  }

  // 적도 좌표(또는 방향) → 화면 CSS 픽셀. 셰이더 project()와 같은 식.
  function proj(p, dirOnly, m) {
    m = m || M;
    var x = p[0] - (dirOnly ? 0 : cam[0]), y = p[1] - (dirOnly ? 0 : cam[1]), z = p[2] - (dirOnly ? 0 : cam[2]);
    var vx = m[0] * x + m[1] * y + m[2] * z, vy = m[3] * x + m[4] * y + m[5] * z, vz = m[6] * x + m[7] * y + m[8] * z;
    var d = Math.hypot(vx, vy, vz); if (d < 1e-12) return null;
    vx /= d; vy /= d; vz /= d;
    var th = Math.acos(clamp(-vz, -1, 1)); if (tr < 0.5 && th > THMAX[S.proj]) return null;
    var rho = Math.max(Math.hypot(vx, vy), 1e-7), rs = radF(th) / radF(fovRad / 2), kp = 1 / Math.tan(fovRad / 2);
    var w = lerp(1, -vz, tr); if (w < 1e-4) return null;
    var ox = lerp(vx / rho * rs * (S.flipH ? -1 : 1), vx * kp, tr) / w, oy = lerp(vy / rho * rs * (S.flipV ? -1 : 1), vy * kp, tr) / w;
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

    if (sensor.on && sensor.target) sensor.cur = sensor.cur ? mslerp(sensor.cur, sensor.target, 0.22) : sensor.target;
    var Me = earthM();
    if (S.mode === 'earth') { M = Me; cam = [0, 0, 0]; fovRad = S.fov * D2R; }
    else {
      var Mo = orbitM(), u = m3v(GT, orbitU());
      M = mslerp(Me, Mo, tr);
      cam = [O.target[0] + u[0] * O.dist, O.target[1] + u[1] * O.dist, O.target[2] + u[2] * O.dist];
      fovRad = lerp(S.fov, galFov(), tr) * D2R;
    }
    render(); overlay();
    fps = lerp(fps, 1000 / Math.max(dt, 1), 0.05);
    if (shot) { shot = false; saveShot(); }
    if (now - lastStatus > 250) { lastStatus = now; updateStatus(); if (sel) updateInfo(); }
    if (caption.until && now > caption.until && S.mode === 'earth') { caption.until = 0; document.getElementById('caption').style.opacity = 0; }
    requestAnimationFrame(frame);
  }

  function saveShot() {
    var c = document.createElement('canvas'); c.width = glc.width; c.height = glc.height;
    var x = c.getContext('2d'); x.drawImage(glc, 0, 0); x.drawImage(ov, 0, 0);
    if (S.night) { x.globalCompositeOperation = 'multiply'; x.fillStyle = '#f00'; x.fillRect(0, 0, c.width, c.height); }
    if (AND) { try { AND.savePng(c.toDataURL('image/png'), 'starmap-' + Date.now() + '.png'); } catch (e) { CN.toast('저장하지 못했어요'); } return; }
    c.toBlob(function (b) { var a = document.createElement('a'), d = new Date(S.time); a.href = URL.createObjectURL(b); a.download = 'starmap-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.png'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); CN.toast('화면을 PNG로 저장했어요'); });
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
      gl.uniform1f(pSky.u.uType, PTYPE[S.proj]); gl.uniform2f(pSky.u.uFlip, S.flipH ? -1 : 1, S.flipV ? -1 : 1); gl.uniform1f(pSky.u.uFog, f.fog ? 1 : 0);
      attr(0, B.quad, 2); gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    var atm = f.atm ? earth : 0;
    if (atm > 0) skyPass(0);

    // 은하(입자)
    if (f.milky || tr > 0) {
      setCommon(pGal);
      gl.uniform1f(pGal.u.uDpr, dpr); gl.uniform1f(pGal.u.uPxRad, pxPerRad());
      var lp = (S.v.bortle - 3) * (1 - tr);     // 광공해: 보틀 3등급 기준
      var ga = lerp((f.milky ? 0.017 : 0) * S.v.milky * clamp(1 - lp * 0.17, 0, 1.4) * Math.pow(1 - twF * atm, 2), 0.1, tr);
      gl.uniform1f(pGal.u.uGalA, ga); gl.uniform1f(pGal.u.uSizeK, lerp(1, 1.7, tr)); gl.uniform1f(pGal.u.uNearA, lerp(250, Math.max(250, O.dist * 0.25), tr)); gl.uniform1f(pGal.u.uNearB, lerp(1600, Math.max(1600, O.dist * 0.9), tr));
      attr(0, B.gal, 3); attr(1, B.galCol, 3); attr(2, B.galSize, 1);
      gl.drawArrays(gl.POINTS, 0, B.galN);
    }
    // 별
    setCommon(pStar);
    var lim = 6.0 + 1.5 * Math.log2(70 / (fovRad * R2D)) - atm * (5 * twF + 8 * dayF) - (S.v.bortle - 3) * 0.55 * (1 - tr);
    gl.uniform1f(pStar.u.uLim, lim); gl.uniform1f(pStar.u.uDpr, dpr);
    gl.uniform1f(pStar.u.uFloor, tr * clamp(500 / Math.max(O.dist, 1), 0, 0.13));
    gl.uniform1f(pStar.u.uAbs, S.v.abs); gl.uniform1f(pStar.u.uRel, S.v.rel); gl.uniform1f(pStar.u.uTw, f.atm ? S.v.twinkle * (1 - tr) : 0); gl.uniform1f(pStar.u.uTime, (performance.now() / 1000) % 1000);
    attr(0, B.star, 3); attr(1, B.starMag, 1); attr(2, B.starCol, 3, gl.UNSIGNED_BYTE, true);
    if (f.stars || tr > 0) gl.drawArrays(gl.POINTS, 0, starN);
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
      if (f.equator && !f.eqGrid) lines(B.circle, B.circleN, M, [0.3, 0.5, 1.0, 0.8 * earth], { dir: 1 });
      if (f.galGrid) lines(B.grid, B.gridN, M, [0.42, 0.28, 0.12, 0.6 * earth], { dir: 1, pre: GT });
      if (f.galEq || f.galGrid) lines(B.circle, B.circleN, M, [0.6, 0.38, 0.15, 0.85 * earth], { dir: 1, pre: GT });
      if (f.meridian) lines(B.circle, B.circleN, Mhor, [0.2, 0.6, 0.2, 0.8 * earth], { dir: 1, pre: [1, 0, 0, 0, 0, -1, 0, 1, 0] });
      if (f.horizon || f.azGrid || !f.ground) lines(B.circle, B.circleN, Mhor, [0.2, 0.6, 0.2, 0.7 * earth], { dir: 1 });
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
    if (f.art) drawArt(a * (1 - 0.75 * dayF * (f.atm ? 1 : 0)), hide);
    if (f.dsoImg) drawDsoImgs(a * (1 - 0.9 * dayF * (f.atm ? 1 : 0)) * clamp(1.25 - S.v.bortle * 0.08, 0.4, 1.2), hide);
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
      if (o.body === 'Sun' || o.body === 'Moon') r = Math.max(r, 0.0046 * ppr * (o.body === 'Moon' && S.v.moonScale ? 4 : 1));
      else if (o._mag != null) r = clamp(4.4 - o._mag * 0.55, 2.2, 6);
      if (o.body === 'Moon') drawMoon(o, q[0], q[1], r);
      else {
        if (o.body === 'Sun') { var g = ctx.createRadialGradient(q[0], q[1], r * 0.5, q[0], q[1], r * 3.2); g.addColorStop(0, 'rgba(255,230,150,.55)'); g.addColorStop(1, 'rgba(255,230,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], r * 3.2, 0, 6.2832); ctx.fill(); }
        ctx.fillStyle = b[0]; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 6.2832); ctx.fill();
      }
      if (f.planetNames) label(q[0], q[1], o.nameKo, '#c9b8ff', { size: 13, dx: r + 4, force: true });
    });
    // 별자리 이름
    if (f.conNames && fovD > 12) cons.forEach(function (o) {
      if (hide(o._dir) || !(q = proj(o._dir, true)) || !onScreen(q)) return;
      label(q[0], q[1], o.nameKo.replace(/자리$/, ''), 'rgba(120,165,235,.95)', { size: fovD > 100 ? 11 : 13, center: true });
    });
    // 대상 천체
    var magLab = 2.2 + (S.v.starLab - 3) * 0.9 + 1.6 * Math.log2(70 / fovD), dsoLab = (S.v.dsoLab - 3) * 1.2;
    for (i = 0; i < objs.length; i++) {
      var o = objs[i], dso = isDso(o);
      if (dso ? (!f.dso || (f.atm && twF > 0.75)) : !f.starNames) continue;
      if (!typeOn(o) || hide(o._dir) || !(q = proj(o._dir, true)) || !onScreen(q, 10)) continue;
      var feat = CN.isFeatured(state, o);
      if (dso) {
        var r = Math.max(5, (o.sizeArcmin || 0) / 60 * D2R * ppr / 2);
        if (r > Math.max(W, H)) continue;
        dsoMark(o, q[0], q[1], r);
        if (S.v.dsoLab > 0 && ((feat && S.v.dsoLab >= 2) || fovD < 45 * Math.pow(1.5, dsoLab) || (o.mag != null && o.mag < 4.5 + dsoLab + 2 * Math.log2(70 / fovD)))) label(q[0], q[1], dsoLabel(o, fovD), 'rgba(110,200,215,.98)', { dx: Math.min(r, 60) + 3 });
      } else if (S.v.starLab > 0 && (o.mag == null || o.mag < magLab || (feat && fovD < 100 && S.v.starLab >= 3))) label(q[0], q[1], o.nameKo, 'rgba(235,235,215,.95)', { dx: 6 });
    }
    // 격자 눈금·나침 눈금·각도 재기
    if (f.eqGrid || f.azGrid) gridLabels();
    if (f.compass) for (i = 0; i < 360; i += 10) { if (f.cardinal && i % 90 === 0) continue; var cd = m3v(m3T(Fhor), [Math.cos(i * D2R), -Math.sin(i * D2R), 0]); if ((q = proj(cd, true)) && onScreen(q)) label(q[0], q[1] + 12, i + '°', 'rgba(226,90,70,.9)', { size: 10, center: true }); }
    if (meas.a && meas.b) drawMeasure();
    ctx.globalAlpha = 1;
  }
  // 별자리 그림: 그림 속 기준점 3개가 놓일 화면 자리로 아핀 변환해 겹쳐 그린다
  function drawArt(alpha, hide) {
    if (alpha <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * S.v.art;
    sky.constellations.forEach(function (c) {
      if (!c.art) return;
      var im = artImgs[c.abbr];
      if (!im) { im = artImgs[c.abbr] = new Image(); im.src = 'data/art/' + c.art.f; return; }
      if (!im.complete || !im.naturalWidth) return;
      var an = c.art.a, P = [], k, below = 0;
      for (k = 0; k < 3; k++) { var d = norm(starP(an[k][2])); if (hide(d)) below++; var q = proj(d, true); if (!q) return; P.push(q); }
      if (below === 3) return;
      var u0 = an[0][0], v0 = an[0][1], u1 = an[1][0], v1 = an[1][1], u2 = an[2][0], v2 = an[2][1], det = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
      if (Math.abs(det) < 1e-6) return;
      var A2 = (P[0][0] * (v1 - v2) + P[1][0] * (v2 - v0) + P[2][0] * (v0 - v1)) / det, C2 = (P[0][0] * (u2 - u1) + P[1][0] * (u0 - u2) + P[2][0] * (u1 - u0)) / det;
      var B2 = (P[0][1] * (v1 - v2) + P[1][1] * (v2 - v0) + P[2][1] * (v0 - v1)) / det, D2 = (P[0][1] * (u2 - u1) + P[1][1] * (u0 - u2) + P[2][1] * (u1 - u0)) / det;
      var sc = Math.max(Math.hypot(A2, B2), Math.hypot(C2, D2)) * c.art.size[0];
      if (sc > 3.5 * Math.max(W, H) || sc < 12) return;
      var E2 = P[0][0] - A2 * u0 - C2 * v0, F2 = P[0][1] - B2 * u0 - D2 * v0;
      ctx.setTransform(dpr * A2, dpr * B2, dpr * C2, dpr * D2, dpr * E2, dpr * F2);
      ctx.drawImage(im, 0, 0);
    });
    ctx.restore(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // ---- 딥스카이 사진 겹치기 (Stellarium 단축키 I) ----
  // 사진마다 네 모서리의 J2000 적경·적위(Stellarium textures.json)가 있어 그대로 하늘에 붙인다.
  // 캔버스 2D는 원근 변형이 안 되므로 사진을 격자로 잘라 삼각형마다 아핀 변형으로 그린다.
  var dsoImgs = [], dsoCv = document.createElement('canvas'), dctx = dsoCv.getContext('2d');
  function initDsoImgs(j) {
    var seen = {};
    Object.keys(j || {}).forEach(function (id) {
      (j[id] || []).forEach(function (q) {
        if (seen[q.f]) { seen[q.f].ids.push(id); return; }
        var c = q.w.map(function (p) { return sph(p[0], p[1]); }), m = norm([0, 1, 2].map(function (i) { return (c[0][i] + c[1][i] + c[2][i] + c[3][i]) / 4; }));
        var half = Math.max.apply(null, c.map(function (v) { return Math.acos(clamp(dot(v, m), -1, 1)); }));
        seen[q.f] = { f: q.f, c: c, t: q.t, cen: m, half: half, ids: [id], credit: q.credit, im: null };
        dsoImgs.push(seen[q.f]);
      });
    });
  }
  function affine(s0, s1, s2, d0, d1, d2) {      // 원본 세 점 → 화면 세 점
    var det = s0[0] * (s1[1] - s2[1]) + s1[0] * (s2[1] - s0[1]) + s2[0] * (s0[1] - s1[1]);
    if (Math.abs(det) < 1e-9) return null;
    var a = (d0[0] * (s1[1] - s2[1]) + d1[0] * (s2[1] - s0[1]) + d2[0] * (s0[1] - s1[1])) / det;
    var c = (d0[0] * (s2[0] - s1[0]) + d1[0] * (s0[0] - s2[0]) + d2[0] * (s1[0] - s0[0])) / det;
    var b = (d0[1] * (s1[1] - s2[1]) + d1[1] * (s2[1] - s0[1]) + d2[1] * (s0[1] - s1[1])) / det;
    var d = (d0[1] * (s2[0] - s1[0]) + d1[1] * (s0[0] - s2[0]) + d2[1] * (s1[0] - s0[0])) / det;
    return [a, b, c, d, d0[0] - a * s0[0] - c * s0[1], d0[1] - b * s0[0] - d * s0[1]];
  }
  function drawDsoImgs(alpha, hide) {
    if (alpha <= 0.01) return;
    var ppr = pxPerRad(), fw = fwdW(), view = fovRad * Math.hypot(W, H) / H * 0.6;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    dsoImgs.forEach(function (d) {
      if (!d.ids.some(function (id) { var o = state.byId[id]; return o && typeOn(o); })) return;
      var px = d.half * ppr;                                   // 화면에서 사진 반지름(픽셀)
      var k = sstep(18, 80, px); if (k <= 0.01) return;
      if (Math.acos(clamp(dot(fw, d.cen), -1, 1)) > view + d.half) return;
      if (hide(d.c[0]) && hide(d.c[1]) && hide(d.c[2]) && hide(d.c[3])) return;
      if (!d.im) { d.im = new Image(); d.im.src = 'data/dso/' + d.f + '?v=2'; return; }
      if (!d.im.complete || !d.im.naturalWidth) return;
      var iw = d.im.naturalWidth, ih = d.im.naturalHeight, n = d.half > 0.026 ? 4 : d.half > 0.009 ? 2 : 1, i, j;
      var grid = [];
      for (j = 0; j <= n; j++) for (i = 0; i <= n; i++) {
        var u = i / n, v = j / n, w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = u * v, w3 = (1 - u) * v;
        var P = norm([0, 1, 2].map(function (x) { return d.c[0][x] * w0 + d.c[1][x] * w1 + d.c[2][x] * w2 + d.c[3][x] * w3; }));
        var tu = d.t[0][0] * w0 + d.t[1][0] * w1 + d.t[2][0] * w2 + d.t[3][0] * w3, tv = d.t[0][1] * w0 + d.t[1][1] * w1 + d.t[2][1] * w2 + d.t[3][1] * w3;
        grid.push({ s: proj(P, true), t: [tu * iw, (1 - tv) * ih] });   // 텍스처 v=0이 사진 아래쪽(OpenGL 관례)
      }
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      grid.forEach(function (g) { if (g.s) { x0 = Math.min(x0, g.s[0]); y0 = Math.min(y0, g.s[1]); x1 = Math.max(x1, g.s[0]); y1 = Math.max(y1, g.s[1]); } });
      x0 = Math.max(Math.floor(x0) - 2, 0); y0 = Math.max(Math.floor(y0) - 2, 0); x1 = Math.min(Math.ceil(x1) + 2, W); y1 = Math.min(Math.ceil(y1) + 2, H);
      if (x1 <= x0 || y1 <= y0) return;
      var bw = Math.ceil((x1 - x0) * dpr), bh = Math.ceil((y1 - y0) * dpr);
      if (dsoCv.width < bw || dsoCv.height < bh) { dsoCv.width = Math.max(dsoCv.width, bw); dsoCv.height = Math.max(dsoCv.height, bh); }
      dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, bw, bh);
      function tri(A, B, C) {
        if (!A.s || !B.s || !C.s) return;
        var m = affine(A.t, B.t, C.t, A.s, B.s, C.s); if (!m) return;
        var cx = (A.s[0] + B.s[0] + C.s[0]) / 3, cy = (A.s[1] + B.s[1] + C.s[1]) / 3, g = function (q) { var dx = q[0] - cx, dy = q[1] - cy, l = Math.hypot(dx, dy) || 1; return [q[0] + dx / l * 0.7, q[1] + dy / l * 0.7]; };
        var a = g(A.s), b = g(B.s), c = g(C.s);
        dctx.save(); dctx.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
        dctx.beginPath(); dctx.moveTo(a[0], a[1]); dctx.lineTo(b[0], b[1]); dctx.lineTo(c[0], c[1]); dctx.closePath(); dctx.clip();
        dctx.setTransform(dpr * m[0], dpr * m[1], dpr * m[2], dpr * m[3], dpr * (m[4] - x0), dpr * (m[5] - y0));
        dctx.drawImage(d.im, 0, 0); dctx.restore();
      }
      for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
        var p00 = grid[j * (n + 1) + i], p10 = grid[j * (n + 1) + i + 1], p01 = grid[(j + 1) * (n + 1) + i], p11 = grid[(j + 1) * (n + 1) + i + 1];
        tri(p00, p10, p11); tri(p00, p11, p01);
      }
      ctx.globalAlpha = alpha * k * 0.95;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(dsoCv, 0, 0, bw, bh, x0 * dpr, y0 * dpr, bw, bh); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    ctx.restore(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function drawMeasure() {
    var a = meas.a, b = meas.b, ang = Math.acos(clamp(dot(a, b), -1, 1)), n = Math.max(2, Math.ceil(ang * R2D / 2)), k, q, first = true, mid = null;
    ctx.strokeStyle = '#ffb35a'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (k = 0; k <= n; k++) {
      var t = k / n, s0 = Math.sin(ang) || 1, wa = Math.sin((1 - t) * ang) / s0, wb = Math.sin(t * ang) / s0;
      q = proj(norm([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]), true);
      if (!q) { first = true; continue; }
      if (first) { ctx.moveTo(q[0], q[1]); first = false; } else ctx.lineTo(q[0], q[1]);
      if (k === Math.round(n / 2)) mid = q;
    }
    ctx.stroke();
    var deg = ang * R2D, d0 = Math.floor(deg), m0 = Math.floor((deg - d0) * 60), s1 = Math.round(((deg - d0) * 60 - m0) * 60);
    if (mid) label(mid[0], mid[1] - 6, d0 + '° ' + pad(m0) + '′ ' + pad(s1) + '″', '#ffd9a0', { bold: true, size: 13, center: true, force: true });
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
    el.style.display = S.v.info === 'none' ? 'none' : '';
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
      if (S.v.info === 'short') rows = rows.slice(0, 2);
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

  // ---------- 아이콘·막대 (Stellarium: 왼쪽 세로 = 창, 아래 가로 = 표시 켜고 끄기·시간) ----------
  var IC = {
    conLines: '<path d="M4 17 9 8l7 5 4-8"/><circle class="f" cx="4" cy="17" r="1.7"/><circle class="f" cx="9" cy="8" r="1.7"/><circle class="f" cx="16" cy="13" r="1.7"/><circle class="f" cx="20" cy="5" r="1.7"/>',
    conNames: '<path d="M3 19 8 12l5 3"/><circle class="f" cx="3" cy="19" r="1.5"/><circle class="f" cx="8" cy="12" r="1.5"/><circle class="f" cx="13" cy="15" r="1.5"/><text x="17" y="10" text-anchor="middle" font-size="10">가</text>',
    art: '<circle cx="12" cy="5.500" r="2.200"/><path d="M12 8v6m-6-5 6 2 6-3M7 20l5-6 5 6"/>',
    eqGrid: '<circle cx="12" cy="12" r="8.500"/><ellipse cx="12" cy="12" rx="8.500" ry="3" transform="rotate(-24 12 12)"/><ellipse cx="12" cy="12" rx="3" ry="8.500" transform="rotate(-24 12 12)"/>',
    azGrid: '<path d="M3 18a9 9 0 0 1 18 0zM12 9v9M7 11.500c1.500 2 2 4 2 6.500M17 11.500c-1.500 2-2 4-2 6.500M4.500 14h15"/>',
    ground: '<path class="f" d="M2 17c4-4 6 0 9-2s6-4 11-1v6H2z"/><circle class="f" cx="7" cy="6" r="1.200"/><circle class="f" cx="15" cy="8" r="1"/><circle class="f" cx="19" cy="4" r=".9"/>',
    cardinal: '<circle cx="12" cy="12" r="8.500"/><path class="f" d="m12 5 2.300 7H9.700z"/><path d="m9.700 12 2.300 7 2.300-7"/>',
    atm: '<circle cx="12" cy="12" r="3.600"/><path d="M12 3v2.500M12 18.500V21M3 12h2.500M18.500 12H21M5.600 5.600l1.800 1.800M16.600 16.600l1.800 1.800M5.600 18.400l1.800-1.800M16.600 7.400l1.800-1.800"/>',
    dso: '<ellipse cx="12" cy="12" rx="9" ry="4.200" transform="rotate(-28 12 12)"/><circle class="f" cx="12" cy="12" r="1.800"/>',
    planetNames: '<circle cx="11" cy="13" r="4.500"/><ellipse cx="11" cy="13" rx="9" ry="2.700" transform="rotate(-20 11 13)"/>',
    mount: '<path d="M12 9 6 20M12 9l6 11M12 9v8M8 5l8 3-1 2.500-8-3z"/>',
    center: '<circle cx="12" cy="12" r="5"/><path d="M12 2.500v5M12 16.500v5M2.500 12h5M16.500 12h5"/>',
    night: '<path d="M18 14.500A7.500 7.500 0 0 1 9.500 6 7.500 7.500 0 1 0 18 14.500z"/>',
    full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    sensor: '<rect x="7" y="3" width="10" height="18" rx="2.200"/><path d="M11 18h2M2.500 8.500a10 10 0 0 1 2-3.500M21.500 8.500a10 10 0 0 0-2-3.500M2.500 15.500a10 10 0 0 0 2 3.500M21.500 15.500a10 10 0 0 1-2 3.500"/>',
    measure: '<path d="M4 19h16M4 19 17 6M11 19a7 7 0 0 0-2-5"/>',
    galaxy: '<path d="M12 12c.500-2.500 4-2.500 4 .500s-5 5-8 2-.500-9.500 5-9.500 9 6.500 5 12"/>',
    earth: '<circle cx="12" cy="12" r="8.500"/><path d="M3.500 12h17M12 3.500c-3 2.500-3 14.500 0 17M12 3.500c3 2.500 3 14.500 0 17"/>',
    slow: '<path class="f" d="M11.500 6 3 12l8.500 6zM21 6l-8.500 6 8.500 6z"/>',
    fast: '<path class="f" d="M12.500 6 21 12l-8.500 6zM3 6l8.500 6L3 18z"/>',
    play: '<path class="f" d="M7 5l12 7-12 7z"/>',
    pause: '<path class="f" d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
    now: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7v5l3.500 2"/>',
    loc: '<path d="M12 21s-6.500-6.500-6.500-11.500a6.500 6.500 0 0 1 13 0C18.500 14.500 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.300"/>',
    time: '<rect x="3.500" y="5" width="17" height="15" rx="2.500"/><path d="M3.500 10h17M8 3v4M16 3v4M12 13v3l2 1"/>',
    view: '<path d="M2.500 12S6 6 12 6s9.500 6 9.500 6-3.500 6-9.500 6-9.500-6-9.500-6z"/><circle cx="12" cy="12" r="2.800"/>',
    search: '<circle cx="10.500" cy="10.500" r="6.500"/><path d="m15.500 15.500 5 5"/>',
    config: '<path d="M4 7h8M16 7h4M4 12h2M10 12h10M4 17h10M18 17h2"/><circle cx="14" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="17" r="2"/>',
    calc: '<path d="M4 4v16h16M7 16c2.500-9 6.500-9 9 0"/><path d="M19 9v0"/>',
    help: '<circle cx="12" cy="12" r="8.500"/><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.700.400-1 1-1 1.700M12 16.500v.200"/>',
  };
  function svg(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + IC[k].replace(/(\d)\.(\d)00\b/g, '$1.$2') + '</svg>'; }
  function ib(attr, icon, tip, key, on) { return '<button class="ib' + (on ? ' on' : '') + '" ' + attr + ' data-tip="' + esc(tip) + '" data-key="' + esc(key || '') + '" aria-label="' + esc(tip) + '" aria-pressed="' + !!on + '">' + svg(icon) + '</button>'; }
  var BAR_E = [['conLines', '별자리 선', 'C'], ['conNames', '별자리 이름', 'V'], ['art', '별자리 그림', 'R'], '|', ['eqGrid', '적도 격자', 'E'], ['azGrid', '방위 격자', 'Z'], '|',
    ['ground', '지면', 'G'], ['cardinal', '방위 표시', 'Q'], ['atm', '대기', 'A'], '|', ['dso', '딥스카이 천체', 'D'], ['planetNames', '행성 이름', 'Alt+P'], '|'];
  var GAL_TOOLS = [['conLines', '별자리 선', 'C'], ['gNames', '천체 이름', 'V'], ['arms', '은하 팔 이름', 'R'], ['rings', '거리 눈금', 'E'], ['stems', '높이 기둥', 'Z'], ['sight', '지구에서의 시선', 'L']];
  var LBAR = [['F6', 'loc', '위치'], ['F5', 'time', '날짜와 시간'], ['F4', 'view', '하늘과 보기 설정'], ['F3', 'search', '천체 찾기'], ['F2', 'config', '환경 설정'], ['F10', 'calc', '천문 계산'], ['F1', 'help', '도움말']];
  var RATES = [-604800, -86400, -3600, -600, -60, -10, -1, 1, 10, 60, 600, 3600, 86400, 604800];

  function buildTools() {
    var el = document.getElementById('tools'), h = '', g = S.mode === 'galaxy';
    var sep = '<span class="sep"></span>';
    if (!g) {
      if (SENSOR_OK) h += ib('data-act="sensor"', 'sensor', '폰 방향으로 보기 (GPS·나침반·자이로)', '', sensor.on) + sep;   // 폰에서 바로 보이게 맨 앞
      h += BAR_E.map(function (t) { return t === '|' ? sep : ib('data-flag="' + t[0] + '"', t[0], t[1], t[2], S.f[t[0]]); }).join('') +
        ib('data-act="mount"', 'mount', S.mount === 'az' ? '경위대식 가대 (누르면 적도의식)' : '적도의식 가대 (누르면 경위대식)', 'Ctrl+M', S.mount === 'eq') +
        ib('data-act="center"', 'center', '고른 천체를 가운데로', 'Space', tracking) +
        ib('data-act="night"', 'night', '야간 모드 (붉은 화면)', 'Ctrl+N', S.night) +
        ib('data-act="full"', 'full', '전체 화면', 'F11', !!document.fullscreenElement || !!buildTools.fullAnd) +
        ib('data-act="measure"', 'measure', '각도 재기 (하늘 위에서 끌기)', 'Ctrl+A', meas.on) +
 sep +
        ib('data-act="galaxy"', 'galaxy', '은하에서 보기', 'Tab', false) +
        '<span class="grow"></span>' +
        ib('data-act="slow"', 'slow', '시간 느리게 · 거꾸로', 'J', S.playing && S.rate < 0) +
        ib('data-act="play"', S.playing ? 'play' : 'pause', S.playing ? '실제 속도로 (지금 ' + rateText() + ')' : '멈춤 — 누르면 실제 속도로', 'K', S.playing && S.rate === 1) +
        ib('data-act="now"', 'now', '지금 시각으로', '8', false) +
        ib('data-act="fast"', 'fast', '시간 빠르게', 'L', S.playing && S.rate > 1);
    } else {
      h += ib('data-act="galaxy"', 'earth', '지구에서 보기', 'Tab', false) + sep +
        '<span class="lbl">크기</span>' + PRESETS.map(function (p, i) { return '<button class="sbtn" data-preset="' + i + '" data-tip="' + esc(p.cap) + '" data-key="' + (i + 1) + '">' + p.ko + '</button>'; }).join('') + sep +
        '<span class="lbl">중심</span>' + [['sun', '태양'], ['gc', '은하 중심'], ['sel', '고른 천체']].map(function (c) { return c[0] === 'sel' && !selPos() ? '' : '<button class="sbtn' + (S.center === c[0] ? ' on' : '') + '" data-center="' + c[0] + '">' + c[1] + '</button>'; }).join('') + sep +
        GAL_TOOLS.map(function (t) { return '<button class="sbtn' + (S.f[t[0]] ? ' on' : '') + '" data-flag="' + t[0] + '" data-tip="' + t[1] + '" data-key="' + t[2] + '">' + t[1] + '</button>'; }).join('') + sep +
        '<span class="lbl">종류</span>' + [['star', '별'], ['cluster', '성단'], ['nebula', '성운'], ['galaxy', '은하']].map(function (t) { return '<button class="sbtn' + (S.types[t[0]] ? ' on' : '') + '" data-type="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
        '<span class="grow"></span>' + ib('data-act="night"', 'night', '야간 모드 (붉은 화면)', 'Ctrl+N', S.night) + ib('data-act="full"', 'full', '전체 화면', 'F11', !!document.fullscreenElement);
    }
    if (h !== buildTools.last) { buildTools.last = h; el.innerHTML = h; }
    var mb = document.getElementById('bMode');
    mb.textContent = g ? '지구에서 보기' : '은하에서 보기';
    var lh = LBAR.map(function (b) { return ib('data-win="' + b[0] + '"', b[1], b[2], b[0], !!wins[b[0]]); }).join('');
    if (lh !== buildTools.lastL) { buildTools.lastL = lh; document.getElementById('lbar').innerHTML = lh; }
    document.body.classList.toggle('night', !!S.night); document.body.classList.toggle('autohide', !!S.v.autohide);
    ov.classList.toggle('measure', meas.on);
    syncWins();
  }
  document.getElementById('tools').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.flag) toggle(b.dataset.flag);
    else if (b.dataset.type) { S.types[b.dataset.type] = !S.types[b.dataset.type]; rebuildStems(); save(); buildTools(); }
    else if (b.dataset.preset) { if (!(anim && anim.lock)) goPreset(PRESETS[+b.dataset.preset]); }
    else if (b.dataset.center) { if (!(anim && anim.lock)) { S.center = b.dataset.center; tweenOrbit({ target: centerPoint(S.center), dist: O.dist }, 1200); buildTools(); } }
    else act(b.dataset.act);
  });
  document.getElementById('lbar').addEventListener('click', function (ev) { var b = ev.target.closest('[data-win]'); if (b) toggleWin(b.dataset.win); });
  document.getElementById('bMode').onclick = function () { act('galaxy'); };
  if (!AND && /Android/i.test(navigator.userAgent)) {
    var dl = document.createElement('a'); dl.className = 'home'; dl.href = 'starmap.apk'; dl.setAttribute('download', 'CosmoStella.apk');
    dl.textContent = '안드로이드 앱 CosmoStella 받기 ›'; document.getElementById('top').appendChild(dl);
  }
  document.getElementById('guiBack').onclick = function () { act('gui'); };
  // 풍선 도움말: 이름 + 단축키 (Stellarium은 막대 위에 글자로 보여 줌)
  (function () {
    var tip = document.getElementById('tipbox');
    document.addEventListener('pointerover', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-tip]');
      if (!b || ev.pointerType === 'touch') { tip.style.display = 'none'; return; }
      tip.innerHTML = esc(b.dataset.tip) + (b.dataset.key ? '<kbd>' + esc(b.dataset.key) + '</kbd>' : '');
      tip.style.display = 'block';
      var r = b.getBoundingClientRect(), tw = tip.offsetWidth, left = b.closest('#lbar') ? r.right + 8 : clamp(r.left + r.width / 2 - tw / 2, 6, W - tw - 6);
      tip.style.left = left + 'px'; tip.style.top = (b.closest('#lbar') ? r.top + r.height / 2 - 13 : r.top - 32) + 'px';
    });
    document.addEventListener('pointerdown', function () { tip.style.display = 'none'; });
  })();

  function toggle(k, v) { S.f[k] = v === undefined ? !S.f[k] : v; save(); buildTools(); }
  function stepTime(sec) { S.time += sec * 1000; bodyT = null; }
  function lookAt(az, alt) { var FT = m3T(Fhor), a = alt * D2R, z = az * D2R; tracking = false; centerOn(m3v(FT, [Math.cos(a) * Math.cos(z), -Math.cos(a) * Math.sin(z), Math.sin(a)]), 600); }
  function act(a) {
    if (a === 'mount') { var f = fwdW(); S.mount = S.mount === 'az' ? 'eq' : 'az'; setViewDir(f); say(S.mount === 'az' ? '경위대식 — 지평선이 수평으로 고정돼요' : '적도의식 — 하늘(적경·적위)이 고정되고 땅이 돌아요', 3500); }
    else if (a === 'center') { if (sel) afterSelect(true); else CN.toast('먼저 천체를 골라 주세요'); }
    else if (a === 'night') S.night = !S.night;
    else if (a === 'full' && AND) { AND.toggleFullscreen(); }
    else if (a === 'full') { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); }
    else if (a === 'sensor') { if (sensor.on) sensorStop(); else sensorStart(); return; }
    else if (a === 'measure') { meas.on = !meas.on; if (!meas.on) { meas.a = meas.b = null; } else say('각도 재기 — 하늘 위에서 끌어 보세요 (끄려면 다시 누르기)', 4000); }
    else if (a === 'galaxy') { if (S.mode === 'earth') enterGalaxy(); else enterEarth(); return; }
    else if (a === 'flipH') S.flipH = !S.flipH; else if (a === 'flipV') S.flipV = !S.flipV;
    else if (a === 'shot') { shot = true; return; }
    else if (a === 'gui') { document.body.classList.toggle('nogui'); return; }
    else if (a === 'play') { if (S.playing && S.rate === 1) S.playing = false; else { S.playing = true; S.rate = 1; } }
    else if (a === 'pause') S.playing = false;
    else if (a === 'reverse') { S.rate = -S.rate; S.playing = true; }
    else if (a === 'fast' || a === 'slow') { var i = RATES.indexOf(S.rate); if (i < 0) i = 7; i = clamp(i + (a === 'fast' ? 1 : -1), 0, RATES.length - 1); S.rate = RATES[i]; S.playing = true; }
    else if (a === 'now') { S.time = Date.now(); S.rate = 1; S.playing = true; bodyT = null; }
    else if (a === 'home') { tracking = false; S.fov = DEFAULT_VIEW.fov; lookAt(DEFAULT_VIEW.lon, DEFAULT_VIEW.lat); }
    else if (a === 'zoomIn') {            // 고른 천체로 자동 확대
      if (!sel || S.mode !== 'earth') return;
      if (!zoomBack) zoomBack = { fov: S.fov, d: fwdW() };
      var o = sel.o, target = o && o.sizeArcmin ? clamp(o.sizeArcmin / 60 * 4, 0.6, 25) : o && o._body ? (o.body === 'Moon' || o.body === 'Sun' ? 2.5 : 1) : sel.kind === 'con' ? 45 : 8, f0 = S.fov;
      afterSelect(true); var d = selDir(), fr = fwdW();
      startAnim(1200, function (e) { setViewDir(norm(lerp3(fr, d, Math.min(1, e * 1.6)))); S.fov = Math.exp(lerp(Math.log(f0), Math.log(target), e)); }, function () { tracking = true; });
    } else if (a === 'zoomOut') {
      if (S.mode !== 'earth') return;
      var zb = zoomBack || { fov: DEFAULT_VIEW.fov, d: fwdW() }, f1 = S.fov, fr2 = fwdW(); zoomBack = null; tracking = false;
      startAnim(1000, function (e) { S.fov = Math.exp(lerp(Math.log(f1), Math.log(zb.fov), e)); setViewDir(norm(lerp3(fr2, zb.d, e))); });
    }
    save(); buildTools();
  }
  document.addEventListener('fullscreenchange', buildTools);
  // 안드로이드 뒤로 가기: 열린 창 → 화면 요소 숨김 → 선택 → 은하 보기 순으로 하나씩 닫고, 닫을 게 없으면 false(앱 종료)
  window.SMAndroidBack = function () {
    if (sensor.on && !document.querySelector('.modal-back') && !Object.keys(wins).length) { sensorStop(); return true; }
    var mb = document.querySelector('.modal-back [data-close]'); if (mb) { mb.click(); return true; }
    if (document.body.classList.contains('nogui')) { act('gui'); return true; }
    if (closeTopWin()) return true;
    if (meas.on) { act('measure'); return true; }
    if (S.mode === 'galaxy') { if (!(anim && anim.lock)) enterEarth(); return true; }
    if (sel) { deselect(); return true; }
    return false;
  };
  window.SMAndroidFull = function (on) { buildTools.fullAnd = !!on; buildTools(); };

  function rateText() {
    if (!S.playing) return '멈춤';
    var r = Math.abs(S.rate), s = r === 1 ? '실제 속도' : r < 60 ? r + '배속' : r < 3600 ? '1초에 ' + r / 60 + '분' : r < 86400 ? '1초에 ' + r / 3600 + '시간' : '1초에 ' + r / 86400 + '일';
    return (S.rate < 0 ? '거꾸로 ' : '') + s;
  }
  function clockText() { var d = new Date(S.time); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  var statusHtml = '', lastRate = '';
  function updateStatus() {
    var g = S.mode === 'galaxy', el = document.getElementById('status');
    // 틀은 모드가 바뀔 때만 다시 만들고 글자만 갈아 끼운다(누르는 도중 버튼이 사라지지 않게)
    if (statusHtml !== S.mode) {
      statusHtml = S.mode;
      el.innerHTML = g ? '<span data-k="dist"></span><span>은하 팔·원반은 개략 모형, 천체 위치는 실제 측정값</span><span class="grow"></span><span data-k="fps"></span>'
        : '<button data-st="F6" data-k="loc" data-tip="위치 바꾸기" data-key="F6"></button><span data-k="fov"></span><span data-k="fps"></span><span class="grow"></span><span data-k="rate"></span><button data-st="F5" class="clock" data-k="clock" data-tip="날짜와 시간" data-key="F5"></button>';
    }
    var put = function (k, v) { var n = el.querySelector('[data-k=' + k + ']'); if (n && n.textContent !== v) n.textContent = v; };
    put('fps', Math.round(fps) + ' FPS');
    if (g) put('dist', '보는 거리 ' + CN.fmtLy(O.dist < 10 ? O.dist : Math.round(O.dist)));
    else { put('loc', '지구, ' + S.place); put('fov', '시야 ' + (S.fov < 10 ? S.fov.toFixed(1) : Math.round(S.fov)) + '°'); put('rate', rateText()); put('clock', clockText()); }
    var rt = rateText() + tracking; if (rt !== lastRate) { lastRate = rt; buildTools(); }
    if (g && !anim) {
      var c = O.dist < 300 ? PRESETS[0].cap : O.dist < 6000 ? PRESETS[1].cap : O.dist < 45000 ? PRESETS[2].cap : O.dist < 9e5 ? PRESETS[3].cap : O.dist < 3e7 ? PRESETS[4].cap : PRESETS[5].cap;
      if (performance.now() > caption.until && c !== caption.text) { caption.text = c; var ce = document.getElementById('caption'); ce.textContent = c; ce.style.opacity = 1; }
    }
    Object.keys(wins).forEach(function (id) { if (wins[id].tick) wins[id].tick(); });
  }
  document.getElementById('status').addEventListener('click', function (ev) { var b = ev.target.closest('[data-st]'); if (b) toggleWin(b.dataset.st); });

  // ---------- 떠 있는 창 ----------
  var wins = {}, zTop = 40, WKEY = 'cnStarmapWin';
  function el(tag, props, kids) {
    var e = document.createElement(tag), k;
    for (k in props || {}) { if (k === 'style') e.style.cssText = props[k]; else if (k === 'html') e.innerHTML = props[k]; else if (k.slice(0, 2) === 'on') e[k] = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }
    (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function chk(label, key, kbd) {          // S.f[key] 체크 상자
    var i = el('input', { type: 'checkbox', checked: !!S.f[key] }); i.dataset.flag = key;
    i.onchange = function () { toggle(key, i.checked); };
    return el('label', { className: 'row' }, [i, label].concat(kbd ? [el('kbd', {}, [kbd])] : []));
  }
  function chkV(label, get, set, kbd) {
    var i = el('input', { type: 'checkbox', checked: !!get() }); i._get = get;
    i.onchange = function () { set(i.checked); save(); buildTools(); };
    return el('label', { className: 'row' }, [i, label].concat(kbd ? [el('kbd', {}, [kbd])] : []));
  }
  function sld(label, key, min, max, step, fmt) {
    var o = el('output', {}, [fmt(S.v[key])]), i = el('input', { type: 'range', min: min, max: max, step: step, value: S.v[key] });
    i.oninput = function () { S.v[key] = +i.value; o.textContent = fmt(S.v[key]); }; i.onchange = save;
    return el('div', { className: 'sl' }, [el('span', {}, [label]), i, o]);
  }
  function h4(t) { return el('h4', {}, [t]); }
  function btn(label, fn, cls) { return el('button', { className: 'sbtn ' + (cls || ''), onclick: fn }, [label]); }
  function syncWins() {
    document.querySelectorAll('.swin input[data-flag]').forEach(function (i) { i.checked = !!S.f[i.dataset.flag]; });
    document.querySelectorAll('.swin input[type=checkbox]').forEach(function (i) { if (i._get) i.checked = !!i._get(); });
  }
  function tabsUI(bd, tabs) {
    var bar = el('div', { className: 'tabs' }), body = el('div', { className: 'bd' }), cur = null;
    tabs.forEach(function (t, n) {
      var b = el('button', { onclick: function () { [].forEach.call(bar.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); body.innerHTML = ''; cur = t; t[1](body); } }, [t[0]]);
      bar.appendChild(b); if (!n) setTimeout(function () { b.click(); }, 0);
    });
    bd.parentNode.replaceChild(body, bd); body.parentNode.insertBefore(bar, body);
    return { body: body, cur: function () { return cur; } };
  }
  function toggleWin(id) {
    if (wins[id]) return closeWin(id);
    var def = WIN[id]; if (!def) return;
    var w = el('div', { className: 'swin no-emo' + (def.wide ? ' wide' : '') });
    w.innerHTML = '<div class="hd"><b>' + def.title + '</b><kbd>' + id + '</kbd><button aria-label="닫기">✕</button></div><div class="bd"></div>';
    document.body.appendChild(w);
    var pos = {}; try { pos = JSON.parse(localStorage.getItem(WKEY) || '{}'); } catch (e) {}
    var n = Object.keys(wins).length, p = pos[id] || [64 + n * 26, 56 + n * 26];
    w.style.left = clamp(p[0], 0, Math.max(0, W - 120)) + 'px'; w.style.top = clamp(p[1], 0, Math.max(0, H - 80)) + 'px'; w.style.zIndex = ++zTop;
    wins[id] = { el: w };
    w.addEventListener('pointerdown', function () { w.style.zIndex = ++zTop; });
    w.querySelector('.hd button').onclick = function () { closeWin(id); };
    var hd = w.querySelector('.hd'), drag = null;
    hd.addEventListener('pointerdown', function (ev) { if (ev.target.closest('button')) return; drag = [ev.clientX - w.offsetLeft, ev.clientY - w.offsetTop]; hd.setPointerCapture(ev.pointerId); });
    hd.addEventListener('pointermove', function (ev) { if (!drag) return; w.style.left = clamp(ev.clientX - drag[0], -w.offsetWidth + 80, W - 60) + 'px'; w.style.top = clamp(ev.clientY - drag[1], 0, H - 40) + 'px'; });
    hd.addEventListener('pointerup', function () { if (!drag) return; drag = null; pos[id] = [w.offsetLeft, w.offsetTop]; try { localStorage.setItem(WKEY, JSON.stringify(pos)); } catch (e) {} });
    wins[id].tick = def.build(w.querySelector('.bd'), w) || null;
    buildTools();
  }
  function closeWin(id) { if (!wins[id]) return; wins[id].el.remove(); delete wins[id]; buildTools(); }
  function closeTopWin() { var top = null; Object.keys(wins).forEach(function (id) { if (!top || +wins[id].el.style.zIndex > +wins[top].el.style.zIndex) top = id; }); if (top) closeWin(top); return !!top; }

  var PLACES_L = [['광수중학교', CN.LOC.lat, CN.LOC.lon], ['서울', 37.5665, 126.978], ['부산', 35.1796, 129.0756], ['제주', 33.4996, 126.5312], ['독도', 37.2429, 131.8669],
    ['도쿄', 35.6762, 139.6503], ['런던', 51.5074, -0.1278], ['뉴욕', 40.7128, -74.006], ['시드니', -33.8688, 151.2093], ['적도 (키토)', -0.1807, -78.4678], ['북극점', 89.99, 0], ['남극점', -89.99, 0]];
  var leafletP = null;
  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (leafletP) return leafletP;
    leafletP = new Promise(function (ok, no) {
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
      var js = document.createElement('script'); js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      js.onload = function () { ok(window.L); }; js.onerror = function () { leafletP = null; no(); };
      document.head.appendChild(js);
    });
    return leafletP;
  }
  function setPlace(name, la, lo) { S.lat0 = la; S.lon0 = lo; S.place = name; observer = new A.Observer(la, lo, 50); bodyT = null; save(); }
  // 단축키 목록 — Stellarium 25.2 사용 설명서 부록 A(기본 단축키)를 따름. 세 번째 값: 0 = 이 성도에 없는 기능
  var KEYS = [
    ['창', [['F1', '도움말'], ['F2', '환경 설정'], ['F3 / Ctrl+F', '천체 찾기'], ['F4', '하늘과 보기 설정'], ['F5', '날짜와 시간'], ['F6', '위치'], ['F7', '단축키 목록'], ['F10', '천문 계산'], ['F11', '전체 화면'],
      ['F8 · F9', 'Stellarium에서도 비어 있는 키 (F9는 망원경 플러그인)', 0], ['F12', '스크립트 콘솔', 0], ['Esc', '맨 위 창 닫기 · 선택 해제']]],
    ['표시', [['C · V · R · B', '별자리 선 · 이름 · 그림 · 경계'], ['S · Alt+S', '별 · 별 이름'], ['P · Alt+P', '태양계 천체 · 이름'], ['D', '딥스카이 천체'], ['M', '은하수'],
      ['G · F · A', '지면 · 안개 · 대기'], ['Q · Shift+Q', '방위 표시 · 나침 눈금'], ['E · Z', '적도 격자 · 방위 격자'], [', · .', '황도 · 천구 적도'], ['H · ;', '지평선 · 자오선'],
      ['Ctrl+N', '야간 모드 (브라우저가 새 창을 열면 아래 막대 버튼 사용)'], ['Ctrl+Shift+H · V', '좌우 · 상하 뒤집기'], ['I', '딥스카이 사진 (확대하면 보임)'], ['O · Shift+T', '행성 궤도 · 자취', 0]]],
    ['움직이기', [['끌기 · 방향키', '하늘 돌리기'], ['휠 · PgUp/PgDn', '확대 · 축소'], ['클릭 · 오른쪽 클릭', '고르기 · 선택 해제'], ['Space · T', '가운데로 · 따라가기'], ['/ · \\', '고른 천체로 자동 확대 · 원래대로'],
      ['Shift+N·E·S·W', '북·동·남·서쪽 보기'], ['Shift+Z', '천정 보기'], ['Alt+Shift+N · S', '하늘의 북극 · 남극 보기'], ['Ctrl+H', '처음 방향으로'], ['Ctrl+M', '경위대식 ↔ 적도의식'],
      ['Ctrl+Alt+1…0', '시야 180·90·60·45·20·10·5·2·1·0.5°'], ['Ctrl+A', '각도 재기'], ['Ctrl+G', '고른 행성으로 이동', 0]]],
    ['시간', [['J · K · L', '느리게 · 실제 속도 · 빠르게'], ['7 · 8 · 0', '멈춤 · 지금 · 거꾸로'], ['= · -', '하루 뒤 · 앞'], ['] · [', '7일 뒤 · 앞'], ['Ctrl+= · Ctrl+-', '1시간 뒤 · 앞'], ['Alt+= · Alt+-', '1항성일 뒤 · 앞'],
      ['Ctrl+휠', '시간 넘기기 (Shift = 시간, Alt = 날 단위)']]],
    ['그 밖', [['Ctrl+S', '화면을 PNG로 저장'], ['Ctrl+Shift+C', '고른 천체 정보 복사'], ['Ctrl+T', '화면 요소 숨기기 (브라우저가 새 탭을 열면 환경 설정의 버튼 사용)'], ['Tab', '지구 ↔ 은하 전환 (이 성도만의 기능)'], ['1 ~ 6', '은하 보기에서 크기 단계'], ['Ctrl+Q', '끝내기', 0]]],
  ];
  function keysHtml(only) {
    return KEYS.map(function (g) { return '<h4>' + g[0] + '</h4><div class="keys">' + g[1].filter(function (k) { return !only || k[2] !== 0; }).map(function (k) { return '<span' + (k[2] === 0 ? ' class="no"' : '') + '>' + esc(k[1]) + (k[2] === 0 ? ' — 없음' : '') + '</span><kbd>' + esc(k[0]) + '</kbd>'; }).join('') + '</div>'; }).join('');
  }

  var WIN = {
    F1: { title: '도움말', build: function (bd) {
      tabsUI(bd, [['도움말', function (b) {
        b.innerHTML = '<p>밤하늘의 천체는 지구에서 보면 <b>방향</b>만 알 수 있어요. 여기에 <b>거리</b>를 더하면 우리은하 속 실제 위치가 나와요. 오른쪽 위 <b>은하에서 보기</b>(Tab)를 누르면 지구를 떠나 뒤로 물러나면서 그 위치를 보여 줘요.</p>' +
          '<p class="hint">화면 구성과 단축키는 Stellarium을 따랐어요. 왼쪽 막대는 창(F1~F10), 아래 막대는 표시 켜고 끄기와 시간 조절이에요. 단추에 마우스를 올리면 이름과 단축키가 나와요.</p>' + keysHtml(true);
      }], ['자료와 한계', function (b) {
        b.innerHTML = '<h4>자료</h4><p>별 26,656개(7.5등급까지)의 방향·거리·밝기·색, 별자리 선·경계·그림은 Stellarium 25.2의 자료 파일(Hipparcos·Gaia DR3, 현대 별자리 문화)에서 뽑았어요. 별자리 자료는 CC BY-SA 4.0, 별자리 그림은 Free Art License예요.</p>' +
          '<p>딥스카이 사진 ' + dsoImgs.length + '장도 Stellarium 기본 사진 묶음에서 가져왔고, 사진마다 네 모서리의 하늘 좌표가 정해져 있어 실제 방향·크기로 겹쳐져요. 사진 제공: ' + esc(Object.keys(dsoImgs.reduce(function (o, d) { if (d.credit) o[d.credit] = 1; return o; }, {})).join(', ')) + '.</p>' +
          '<p>위치 지도는 OpenStreetMap(© OpenStreetMap 기여자)과 Leaflet을 써요.</p>' +
          (AND ? '' : '<h4>안드로이드 앱 CosmoStella</h4><p>같은 성도를 앱으로 쓸 수 있어요(오프라인에서도 열림). <a href="starmap.apk" download="CosmoStella.apk">CosmoStella.apk 내려받기</a> — 설치할 때 「출처를 알 수 없는 앱 설치」를 한 번 허용해야 해요.</p>') +
          '<p>성단·성운·은하 ' + objs.filter(isDso).length + '개와 이름 붙은 별은 밤하늘 관측 도우미와 같은 목록이에요. 해·달·행성 위치는 Astronomy Engine으로 계산해요.</p>' +
          '<h4>한계</h4><p>은하 원반·나선팔은 전파 관측으로 잰 팔 위치를 따라 그린 <b>개략 모형</b>이에요. 은하수 띠는 이 모형을 태양 자리에서 본 모습이라 실제 은하수의 어두운 띠는 없어요. 시차가 아주 작은 별 약 300개는 거리가 불확실해 6,500광년에 두었어요. 대기 굴절은 계산하지 않아요.</p>';
      }]]);
    } },
    F7: { title: '단축키 목록', build: function (bd) { bd.innerHTML = '<p class="hint">Stellarium 25.2의 기본 단축키를 따랐어요. 흐린 줄은 이 성도에 없는 기능이에요.</p>' + keysHtml(false); } },
    F2: { title: '환경 설정', build: function (bd) {
      var info = el('select', { onchange: function () { S.v.info = info.value; save(); infoHtml = null; updateInfo(); } }, [['full', '모두 보이기'], ['short', '간단히'], ['none', '숨기기']].map(function (o) { return el('option', { value: o[0], selected: S.v.info === o[0] }, [o[1]]); }));
      [h4('고른 천체 정보'), info, h4('화면'),
        chkV('막대 자동 숨김 (마우스를 가장자리로 가져가면 나옴)', function () { return S.v.autohide; }, function (v) { S.v.autohide = v; }),
        chkV('야간 모드 (붉은 화면)', function () { return S.night; }, function (v) { S.night = v; }, 'Ctrl+N'),
        chkV('좌우 뒤집기', function () { return S.flipH; }, function (v) { S.flipH = v; }, 'Ctrl+Shift+H'),
        chkV('상하 뒤집기', function () { return S.flipV; }, function (v) { S.flipV = v; }, 'Ctrl+Shift+V'),
        h4('도구'), el('div', { className: 'btns' }, [btn('화면 저장 (PNG)', function () { act('shot'); }), btn('각도 재기', function () { act('measure'); }), btn('화면 요소 숨기기', function () { act('gui'); }), btn('전체 화면', function () { act('full'); })]),
        h4('초기화'), el('div', { className: 'btns' }, [btn('모든 설정을 처음으로', function () { try { localStorage.removeItem(KEY); localStorage.removeItem(WKEY); } catch (e) {} location.reload(); })]),
        el('p', { className: 'hint', style: 'margin-top:10px' }, ['설정은 이 기기의 브라우저에 저장돼요.'])].forEach(function (x) { bd.appendChild(x); });
    } },
    F3: { title: '천체 찾기', build: function (bd) {
      var q = el('input', { type: 'search', placeholder: '이름·번호 (예: 안드로메다, M45, 직녀성)', autocomplete: 'off' }), list = el('div', { className: 'list', style: 'margin-top:8px' }), composing = false, items = [];
      function run() {
        var s = q.value.toLowerCase().replace(/\s+/g, '');
        items = state.list.filter(function (o) { return (o._dir || o._body) && (s ? CN.searchText(o).indexOf(s) >= 0 : CN.isFeatured(state, o)); }).slice(0, s ? 30 : 80);
        list.innerHTML = (s ? '' : '<p class="hint" style="margin:0 8px 4px">코스모스 추천 천체</p>') + (items.length ? items.map(function (o, i) { return '<button data-i="' + i + '">' + esc(o.nameKo) + '<small>' + esc((o.catalog && o.catalog !== o.nameKo ? o.catalog + ' · ' : '') + CN.typeLabel(o)) + '</small></button>'; }).join('') : '<p class="hint" style="margin:8px">찾는 천체가 없어요</p>');
      }
      // 한글 조합 중에는 입력창을 건드리지 않고 결과 영역만 갱신
      q.addEventListener('compositionstart', function () { composing = true; });
      q.addEventListener('compositionend', function () { composing = false; run(); });
      q.addEventListener('input', function () { if (!composing) run(); });
      q.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !composing && !ev.isComposing && items.length) { selectObj(items[0], true); q.select(); } });
      list.addEventListener('click', function (ev) { var b = ev.target.closest('[data-i]'); if (b) selectObj(items[+b.dataset.i], true); });
      bd.appendChild(q); bd.appendChild(list); run(); setTimeout(function () { q.focus(); }, 30);
    } },
    F4: { title: '하늘과 보기 설정', build: function (bd) {
      var num = function (d) { return function (v) { return (+v).toFixed(d); }; };
      tabsUI(bd, [['하늘', function (b) {
        var pj = el('select', { onchange: function () { S.proj = pj.value; S.fov = Math.min(S.fov, FOVMAX[S.proj]); save(); } }, [['stereo', '평사도법 (Stellarium 기본)'], ['persp', '원근(심사)도법'], ['fisheye', '등거리 어안'], ['ortho', '정사도법']].map(function (o) { return el('option', { value: o[0], selected: S.proj === o[0] }, [o[1]]); }));
        [h4('투영'), pj, h4('별'), chk('별 보이기', 'stars', 'S'), chk('별 이름', 'starNames', 'Alt+S'),
          sld('절대 크기', 'abs', 0.4, 2.5, 0.05, num(2)), sld('상대 크기', 'rel', 0.5, 1.6, 0.05, num(2)), sld('이름 양', 'starLab', 0, 6, 0.5, num(1)), sld('반짝임', 'twinkle', 0, 1, 0.05, num(2)),
          el('p', { className: 'hint' }, ['반짝임은 대기를 켰을 때만 보여요.']),
          h4('하늘 밝기'), sld('광공해', 'bortle', 1, 9, 1, function (v) { return '보틀 ' + v; }), chk('은하수', 'milky', 'M'), sld('은하수 밝기', 'milky', 0, 3, 0.1, num(1)),
          el('p', { className: 'hint' }, ['보틀 1 = 가장 어두운 하늘, 5 = 교외, 8~9 = 도심. 등급이 높을수록 어두운 별과 은하수가 사라져요.'])].forEach(function (x) { b.appendChild(x); });
      }], ['태양계', function (b) {
        [chk('해·달·행성 보이기', 'planets', 'P'), chk('이름', 'planetNames', 'Alt+P'), chkV('달 4배 크게', function () { return S.v.moonScale; }, function (v) { S.v.moonScale = v; }),
          el('p', { className: 'hint', style: 'margin-top:8px' }, ['행성의 위성·궤도·자취는 넣지 않았어요.'])].forEach(function (x) { b.appendChild(x); });
      }], ['딥스카이', function (b) {
        var ty = el('div', { className: 'cols' }, [['cluster', '성단'], ['nebula', '성운'], ['galaxy', '은하'], ['star', '이름 붙은 별']].map(function (t) { return chkV(t[1], function () { return S.types[t[0]]; }, function (v) { S.types[t[0]] = v; rebuildStems(); }); }));
        [chk('딥스카이 천체 표식', 'dso', 'D'), chk('딥스카이 사진 (확대하면 실제 방향·크기로 보임)', 'dsoImg', 'I'), sld('이름 양', 'dsoLab', 0, 6, 0.5, num(1)), h4('종류'), ty,
          el('p', { className: 'hint', style: 'margin-top:8px' }, ['대상은 밤하늘 관측 도우미 목록(' + objs.filter(isDso).length + '개)이에요. 표식 모양·색은 Stellarium과 같아요: 은하 = 붉은 타원, 성단 = 노란 원, 성운 = 초록 네모.'])].forEach(function (x) { b.appendChild(x); });
      }], ['표시', function (b) {
        var c = el('div', { className: 'cols' }, [chk('적도 격자', 'eqGrid', 'E'), chk('방위 격자', 'azGrid', 'Z'), chk('은하 격자', 'galGrid'), chk('천구 적도', 'equator', '.'), chk('황도', 'ecliptic', ','), chk('은하 적도', 'galEq'),
          chk('자오선', 'meridian', ';'), chk('지평선', 'horizon', 'H'), chk('방위 표시', 'cardinal', 'Q'), chk('나침 눈금', 'compass', 'Shift+Q')]);
        b.appendChild(h4('격자와 선')); b.appendChild(c);
      }], ['풍경', function (b) {
        [chk('지면', 'ground', 'G'), chk('지평선 안개', 'fog', 'F'), chk('대기 (낮 하늘·박명·반짝임)', 'atm', 'A'),
          el('p', { className: 'hint', style: 'margin-top:8px' }, ['풍경 사진은 없고 단순한 지면만 그려요. 지면을 끄면 지평선 아래 하늘도 보여요.'])].forEach(function (x) { b.appendChild(x); });
      }], ['별자리', function (b) {
        [chk('별자리 선', 'conLines', 'C'), chk('별자리 이름', 'conNames', 'V'), chk('별자리 경계', 'bounds', 'B'), chk('별자리 그림', 'art', 'R'), sld('그림 밝기', 'art', 0.1, 1, 0.05, num(2)),
          el('p', { className: 'hint', style: 'margin-top:8px' }, ['현대(IAU) 88개 별자리. 은하에서 보기로 나가면 선이 앞뒤로 흩어지는 것을 볼 수 있어요.'])].forEach(function (x) { b.appendChild(x); });
      }]]);
    } },
    F5: { title: '날짜와 시간', build: function (bd) {
      var U = [['y', 'FullYear'], ['mo', 'Month'], ['d', 'Date'], ['h', 'Hours'], ['mi', 'Minutes'], ['s', 'Seconds']], spans = {}, row = el('div', { className: 'spin' });
      U.forEach(function (u, n) {
        if (n) row.appendChild(el('i', {}, [n < 3 ? '-' : n === 3 ? ' ' : ':']));
        var bump = function (k) { return function () { var d = new Date(S.time); d['set' + u[1]](d['get' + u[1]]() + k); S.time = d.getTime(); bodyT = null; tick(); }; };
        spans[u[0]] = el('span', {}, ['']);
        row.appendChild(el('div', { className: 'u' + (n ? '' : ' y') }, [el('button', { onclick: bump(1), 'aria-label': '올리기' }, ['▲']), spans[u[0]], el('button', { onclick: bump(-1), 'aria-label': '내리기' }, ['▼'])]));
      });
      var jd = el('p', { className: 'hint', style: 'text-align:center' }, ['']);
      var dl = el('input', { type: 'datetime-local', step: 1 });
      dl.onchange = function () { var t = new Date(dl.value).getTime(); if (!isNaN(t)) { S.time = t; bodyT = null; tick(); } };
      function tick() {
        var d = new Date(S.time), v = { y: String(d.getFullYear()), mo: pad(d.getMonth() + 1), d: pad(d.getDate()), h: pad(d.getHours()), mi: pad(d.getMinutes()), s: pad(d.getSeconds()) };
        Object.keys(v).forEach(function (k) { if (spans[k].textContent !== v[k]) spans[k].textContent = v[k]; });
        jd.textContent = '율리우스일 ' + (S.time / 86400000 + 2440587.5).toFixed(5) + ' · ' + rateText();
        if (document.activeElement !== dl) dl.value = d.getFullYear() + '-' + v.mo + '-' + v.d + 'T' + v.h + ':' + v.mi + ':' + v.s;
      }
      var setHM = function (hh) { return function () { var d = new Date(); d.setHours(hh, 0, 0, 0); S.time = d.getTime(); bodyT = null; tick(); }; };
      [row, jd, el('div', { className: 'btns', style: 'justify-content:center' }, [btn('지금', function () { act('now'); tick(); }), btn('오늘 밤 9시', setHM(21)), btn('자정', setHM(24)), btn('−1일', function () { stepTime(-86400); tick(); }), btn('+1일', function () { stepTime(86400); tick(); })]),
        h4('직접 입력'), dl, el('p', { className: 'hint', style: 'margin-top:8px' }, ['시각은 이 기기의 시간대 기준이에요.'])].forEach(function (x) { bd.appendChild(x); });
      tick(); return tick;
    } },
    F6: { title: '위치', wide: true, build: function (bd) {
      var cur = el('p', {}, ['']), la = el('input', { type: 'number', step: 0.0001, min: -90, max: 90 }), lo = el('input', { type: 'number', step: 0.0001, min: -180, max: 180 });
      function show(pan) {
        cur.innerHTML = '지금: <b>' + esc(S.place) + '</b> · ' + (S.lat0 >= 0 ? '북위 ' : '남위 ') + Math.abs(S.lat0).toFixed(2) + '°, ' + (S.lon0 >= 0 ? '동경 ' : '서경 ') + Math.abs(S.lon0).toFixed(2) + '°'; la.value = S.lat0; lo.value = S.lon0;
        if (mark) mark.setLatLng([S.lat0, S.lon0]);
        if (map && pan) map.setView([S.lat0, S.lon0], Math.max(map.getZoom(), 5));
      }
      var mapEl = el('div', { className: 'smap' }), map = null, mark = null;
      var list = el('div', { className: 'btns' }, PLACES_L.map(function (p) { return btn(p[0], function () { setPlace(p[0], p[1], p[2]); show(true); }); }).concat([btn('내 위치', function () {
        if (!navigator.geolocation) return CN.toast('이 브라우저는 위치 찾기를 지원하지 않아요.');
        CN.toast('현재 위치를 찾는 중…', 6000);
        navigator.geolocation.getCurrentPosition(function (p) { setPlace('내 위치', +p.coords.latitude.toFixed(4), +p.coords.longitude.toFixed(4)); show(true); CN.toast('현재 위치로 바꿨어요'); }, function () { CN.toast('위치를 가져오지 못했어요. 직접 입력해 주세요.', 4000); }, { timeout: 10000, maximumAge: 600000 });
      }, 'go')]));
      function pickAt(ll) {
        var a = +clamp(ll.lat, -89.99, 89.99).toFixed(4), o = +(((ll.lng + 180) % 360 + 360) % 360 - 180).toFixed(4);
        setPlace('지도에서 고른 곳 (' + a.toFixed(2) + ', ' + o.toFixed(2) + ')', a, o); show(false);
      }
      loadLeaflet().then(function (L) {
        if (!document.body.contains(mapEl)) return;
        map = L.map(mapEl, { worldCopyJump: true, zoomControl: true, attributionControl: true, minZoom: 1 }).setView([S.lat0, S.lon0], 6);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
        mark = L.circleMarker([S.lat0, S.lon0], { radius: 7, color: '#ffb35a', weight: 2, fillColor: '#ff6a3a', fillOpacity: .9 }).addTo(map);
        PLACES_L.forEach(function (p) { L.circleMarker([p[1], p[2]], { radius: 3, color: '#8fb0ff', weight: 1, fillOpacity: .8 }).bindTooltip(p[0]).addTo(map); });
        map.on('click', function (e) { pickAt(e.latlng); });
        setTimeout(function () { map.invalidateSize(); }, 60);
      }).catch(function () { mapEl.innerHTML = '<p class="hint" style="padding:12px">지도를 불러오지 못했어요(인터넷 연결 확인). 아래에서 장소를 고르거나 직접 입력해 주세요.</p>'; });
      var apply = btn('적용', function () {
        var a = parseFloat(la.value), o = parseFloat(lo.value);
        if (isNaN(a) || a < -90 || a > 90 || isNaN(o) || o < -180 || o > 180) return CN.toast('위도는 −90~90, 경도는 −180~180 사이로 넣어 주세요.');
        setPlace('지정한 곳 (' + a.toFixed(2) + ', ' + o.toFixed(2) + ')', a, o); show(true);
      });
      [cur, mapEl, el('p', { className: 'hint', style: 'margin:4px 0 0' }, ['지도를 누르면 그곳으로 바뀌어요. 휠·두 손가락으로 확대해서 학교·집처럼 정확히 고를 수 있어요.']), h4('장소 고르기'), list, h4('직접 입력'), el('div', { className: 'cols' }, [el('label', {}, ['위도 (북+ 남−)', la]), el('label', {}, ['경도 (동+ 서−)', lo])]), el('div', { className: 'btns' }, [apply]),
        el('p', { className: 'hint', style: 'margin-top:8px' }, ['다른 나라를 골라도 시계는 이 기기의 시간대로 표시돼요.'])].forEach(function (x) { bd.appendChild(x); });
      show();
    } },
    F10: { title: '천문 계산', wide: true, build: function (bd) {
      var cur = '', keyOf = function () { return (sel ? selName() : '') + Math.floor(S.time / 60000) + S.lat0 + S.lon0; }, last = '', redraw = null;
      var hm = function (d) { return d ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : '—'; };
      function altOfAt(dir, body, date) {
        var t = A.MakeTime(date);
        if (body) { var eq = A.Equator(body, t, observer, true, true); return A.Horizon(t, observer, eq.ra, eq.dec).altitude; }
        var r = A.Rotation_EQJ_HOR(t, observer).rot; return Math.asin(clamp(r[0][2] * dir[0] + r[1][2] * dir[1] + r[2][2] * dir[2], -1, 1)) * R2D;
      }
      var t = tabsUI(bd, [['지금 떠 있는 천체', function (b) {
        cur = 'pos';
        redraw = function () {
          var rows = bodies.concat(objs).filter(function (o) { return o._dir && typeOn(o) && altOf(o._dir) > 0; }).map(function (o) { var h = m3v(Fhor, o._dir); return [o, Math.asin(clamp(h[2], -1, 1)) * R2D, (Math.atan2(-h[1], h[0]) * R2D + 360) % 360]; }).sort(function (x, y) { return y[1] - x[1]; });
          b.innerHTML = '<p class="hint">' + esc(clockText().slice(0, 16)) + ' · ' + esc(S.place) + ' · 지평선 위 ' + rows.length + '개 (높은 순). 누르면 그 천체로 가요.</p><table><thead><tr><th>이름</th><th>종류</th><th>등급</th><th>방위</th><th>고도</th></tr></thead><tbody>' +
            rows.map(function (r) { var o = r[0], m = o._mag != null ? o._mag : o.mag; return '<tr data-id="' + esc(o.id) + '"><td>' + esc(o.nameKo) + '</td><td>' + esc(CN.typeLabel(o)) + '</td><td class="num">' + (m == null ? '' : (+m).toFixed(1).replace('-', '−')) + '</td><td>' + window.Astro.dir8(r[2]) + ' ' + Math.round(r[2]) + '°</td><td class="num">' + Math.round(r[1]) + '°</td></tr>'; }).join('') + '</tbody></table>';
        };
        b.onpointerdown = function (ev) { var r = ev.target.closest('tr[data-id]'); if (r && state.byId[r.dataset.id]) selectObj(state.byId[r.dataset.id], true); };
        redraw();
      }], ['고도 그래프', function (b) {
        cur = 'graph';
        var cv = el('canvas', { style: 'width:100%;height:240px;display:block' }), txt = el('p', { style: 'margin-top:8px' }, ['']);
        b.appendChild(cv); b.appendChild(txt);
        redraw = function () {
          var cw = cv.clientWidth || 560, ch = 240, x = cv.getContext('2d'); cv.width = cw * dpr; cv.height = ch * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0);
          var base = new Date(S.time), noon = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12); if (base < noon) noon = new Date(noon.getTime() - 864e5);
          var N = 144, L = 34, R = 8, T = 8, Bm = 22, pw = cw - L - R, ph = ch - T - Bm, Y = function (a) { return T + ph * (1 - (a + 20) / 110); }, k, d = selDir(), body = sel && sel.o && sel.o._body ? sel.o.body : null;
          for (k = 0; k < N; k++) { var sa = altOfAt(null, 'Sun', new Date(noon.getTime() + (k + 0.5) / N * 864e5)); x.fillStyle = sa > 0 ? '#27456f' : sa > -6 ? '#1c2f52' : sa > -12 ? '#141f3a' : sa > -18 ? '#0d1426' : '#070a12'; x.fillRect(L + pw * k / N, T, pw / N + 1, ph); }
          x.fillStyle = 'rgba(60,70,50,.55)'; x.fillRect(L, Y(0), pw, T + ph - Y(0));
          x.strokeStyle = 'rgba(255,255,255,.12)'; x.fillStyle = '#8b97b3'; x.font = '10px ' + FONT; x.lineWidth = 1; x.textBaseline = 'middle'; x.textAlign = 'right';
          [0, 30, 60, 90].forEach(function (a) { x.beginPath(); x.moveTo(L, Y(a)); x.lineTo(L + pw, Y(a)); x.stroke(); x.fillText(a + '°', L - 4, Y(a)); });
          x.textAlign = 'center'; x.textBaseline = 'top';
          for (k = 0; k <= 24; k += 3) { var gx = L + pw * k / 24; x.beginPath(); x.moveTo(gx, T); x.lineTo(gx, T + ph); x.stroke(); x.fillText(pad((12 + k) % 24) + '시', gx, T + ph + 5); }
          var nx = L + pw * (S.time - noon.getTime()) / 864e5; x.strokeStyle = '#ff6a5a'; x.beginPath(); x.moveTo(nx, T); x.lineTo(nx, T + ph); x.stroke();
          if (!d) { txt.textContent = '천체를 고르면 오늘 밤 고도 변화와 뜨고 지는 시각이 나와요.'; return; }
          var prev = null, rise = null, set = null, best = -99, bt = null;
          x.strokeStyle = '#ffd24a'; x.lineWidth = 2; x.beginPath();
          for (k = 0; k <= N; k++) {
            var dt = new Date(noon.getTime() + k / N * 864e5), al = altOfAt(d, body, dt), px = L + pw * k / N, py = Y(clamp(al, -20, 90));
            if (k) x.lineTo(px, py); else x.moveTo(px, py);
            if (prev !== null) { var f = prev[1] / (prev[1] - al); if (prev[1] < 0 && al >= 0 && !rise) rise = new Date(prev[0].getTime() + f * (dt - prev[0])); if (prev[1] >= 0 && al < 0 && !set) set = new Date(prev[0].getTime() + f * (dt - prev[0])); }
            if (al > best) { best = al; bt = dt; } prev = [dt, al];
          }
          x.stroke();
          txt.innerHTML = '<b>' + esc(selName()) + '</b> · ' + (noon.getMonth() + 1) + '월 ' + noon.getDate() + '일 낮 12시부터 24시간<br>' + (best < 0 ? '이날 이곳에서는 뜨지 않아요.' : (rise ? '뜸 ' + hm(rise) : set ? '낮 12시 전에 떠 있음' : '지지 않음(주극)') + ' · 가장 높을 때 ' + hm(bt) + ' (고도 ' + Math.round(best) + '°)' + (set ? ' · 짐 ' + hm(set) : rise ? '' : ''));
        };
        redraw();
      }], ['오늘 밤', function (b) {
        cur = 'night';
        redraw = function () {
          var base = new Date(S.time), noon = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12); if (base < noon) noon = new Date(noon.getTime() - 864e5);
          var t0 = A.MakeTime(noon), sr = function (body, dir, from) { try { var r = A.SearchRiseSet(body, observer, dir, from, 1.2); return r && r.date; } catch (e) { return null; } }, sa = function (dir, from, alt) { try { var r = A.SearchAltitude('Sun', observer, dir, from, 1.2, alt); return r && r.date; } catch (e) { return null; } };
          var set = sr('Sun', -1, t0), dark = sa(-1, t0, -18), rise = set ? sr('Sun', +1, A.MakeTime(set)) : null, dawn = dark ? sa(+1, A.MakeTime(dark), -18) : null;
          var ph = A.MoonPhase(A.MakeTime(base)), il = A.Illumination('Moon', A.MakeTime(base)).phase_fraction, mr = sr('Moon', +1, t0), ms = sr('Moon', -1, t0);
          var nm = ph < 10 || ph >= 350 ? '삭' : ph < 80 ? '초승달' : ph < 100 ? '상현달' : ph < 170 ? '차오르는 달' : ph < 190 ? '보름달' : ph < 260 ? '기우는 달' : ph < 280 ? '하현달' : '그믐달';
          b.innerHTML = '<p><b>' + (noon.getMonth() + 1) + '월 ' + noon.getDate() + '일 밤</b> · ' + esc(S.place) + '</p><table><tbody>' +
            [['해 지는 때', hm(set)], ['완전히 어두워짐 (천문박명 끝)', hm(dark)], ['밝아지기 시작 (천문박명 시작)', hm(dawn)], ['해 뜨는 때', hm(rise)], ['달 모양', nm + ' · 밝은 부분 ' + Math.round(il * 100) + '% · 월령 ' + (ph / 360 * 29.53).toFixed(1) + '일'], ['달 뜨는 때', hm(mr)], ['달 지는 때', hm(ms)]]
              .map(function (r) { return '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td></tr>'; }).join('') + '</tbody></table>' +
            '<p class="hint" style="margin-top:8px">' + (il > 0.6 ? '달빛이 밝아 희미한 성운·은하는 보기 어려워요.' : '달빛 방해가 적어 어두운 천체를 보기 좋아요.') + ' 일식·월식, 행성 현상 계산은 넣지 않았어요.</p>';
        };
        redraw();
      }]]);
      return function () { var k = cur + keyOf(); if (k !== last && redraw && t.cur()) { last = k; redraw(); } };
    } },
  };

  // ---------- 입력 ----------
  var ptrs = {}, pinch0 = 0, moved = 0, downAt = null, measuring = false;
  function userMove() { if (anim && !anim.lock) anim = null; tracking = false; return !(anim && anim.lock); }
  ov.addEventListener('pointerdown', function (ev) {
    if (ev.button === 2) return;
    ov.setPointerCapture(ev.pointerId); ptrs[ev.pointerId] = [ev.clientX, ev.clientY];
    var ids = Object.keys(ptrs);
    if (ids.length === 1) { moved = 0; downAt = [ev.clientX, ev.clientY]; }
    if (ids.length === 2) pinch0 = Math.hypot(ptrs[ids[0]][0] - ptrs[ids[1]][0], ptrs[ids[0]][1] - ptrs[ids[1]][1]);
    measuring = meas.on && S.mode === 'earth' && ids.length === 1;
    if (measuring) { meas.a = unproj(ev.clientX, ev.clientY); meas.b = null; }
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
    if (measuring) { if (meas.a) meas.b = unproj(ev.clientX, ev.clientY); return; }
    if (moved < 4 || !userMove()) return;
    if (sensorActive()) { if (!sensor.dragTip) { sensor.dragTip = 1; CN.toast('폰 방향으로 보기 중이에요 — 폰을 돌려 보세요 (끄려면 아래 단추)', 3000); } return; }
    if (S.mode === 'earth') {
      var k = S.fov / H * 1.05, fx = S.flipH ? -1 : 1, fy = S.flipV ? -1 : 1;
      S.lon = (S.lon + (S.mount === 'az' ? -1 : 1) * fx * dx * k / Math.max(Math.cos(S.lat * D2R), 0.15) + 360) % 360;
      S.lat = clamp(S.lat + fy * dy * k, -89.5, 89.5);
    } else { O.yaw -= dx * 0.005; O.pitch = clamp(O.pitch + dy * 0.005, -1.55, 1.55); }
  });
  function up(ev) {
    var was = Object.keys(ptrs).length; delete ptrs[ev.pointerId];
    if (!Object.keys(ptrs).length) ov.classList.remove('drag');
    if (measuring) { measuring = false; return; }
    if (was === 1 && moved < 6 && downAt && !(anim && anim.lock)) { var s = pick(ev.clientX, ev.clientY); if (s) { sel = s; afterSelect(false); } }
  }
  ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', function (ev) { delete ptrs[ev.pointerId]; ov.classList.remove('drag'); measuring = false; });
  ov.addEventListener('contextmenu', function (ev) { ev.preventDefault(); deselect(); });       // 오른쪽 클릭 = 선택 해제
  ov.addEventListener('auxclick', function (ev) { if (ev.button === 1 && sel) { ev.preventDefault(); afterSelect(true); } });   // 휠 누르기 = 가운데로
  function deselect() { sel = null; tracking = false; if (S.center === 'sel') S.center = 'sun'; updateInfo(); buildTools(); }
  function zoom(k) {
    if (!userMove()) return;
    if (S.mode === 'earth') S.fov = clamp(S.fov * k, 0.5, FOVMAX[S.proj]);
    else O.dist = clamp(O.dist * k, 1, 3e10);
  }
  ov.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey) { var u = ev.altKey ? 86400 : ev.shiftKey ? 3600 : 60; stepTime((ev.deltaY < 0 ? 1 : -1) * u); return; }   // 시간 넘기기
    zoom(Math.exp(clamp(ev.deltaY, -300, 300) * (S.mode === 'earth' ? 0.0012 : 0.0018)));
  }, { passive: false });
  ov.addEventListener('dblclick', function (ev) { if (meas.on) return; var s = pick(ev.clientX, ev.clientY); if (s) { sel = s; afterSelect(true); } });

  // ---------- 단축키 (Stellarium 25.2 기본값) ----------
  var FOVKEYS = { 1: 180, 2: 90, 3: 60, 4: 45, 5: 20, 6: 10, 7: 5, 8: 2, 9: 1, 0: 0.5 };
  document.addEventListener('keydown', function (ev) {
    var k = ev.key, tag = (ev.target.tagName || ''), typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || !!(ev.target.closest && ev.target.closest('.leaflet-container'));
    if (document.querySelector('.modal-back')) return;
    if (/^F([1-7]|10)$/.test(k)) { ev.preventDefault(); toggleWin(k); return; }
    if (k === 'F11') { ev.preventDefault(); act('full'); return; }
    if (k === 'Escape') { if (typing) ev.target.blur(); if (document.body.classList.contains('nogui')) act('gui'); else if (!closeTopWin()) deselect(); return; }
    if (typing) return;
    var g = S.mode === 'galaxy', lk = k.length === 1 ? k.toLowerCase() : k, ctrl = ev.ctrlKey || ev.metaKey, c = ev.code;
    if (ctrl && ev.altKey && /^Digit\d$/.test(c)) { ev.preventDefault(); if (!g && userMove()) S.fov = Math.min(FOVKEYS[c.slice(5)], FOVMAX[S.proj]); return; }
    if (ctrl) {
      var cm = { KeyM: g ? null : 'mount', KeyN: 'night', KeyS: 'shot', KeyA: 'measure', KeyT: 'gui', KeyH: ev.shiftKey ? 'flipH' : 'home', KeyV: ev.shiftKey ? 'flipV' : null }[c];
      if (c === 'KeyF') { ev.preventDefault(); if (!wins.F3) toggleWin('F3'); return; }
      if (c === 'KeyC' && ev.shiftKey) { ev.preventDefault(); var tx = document.getElementById('info').innerText; if (AND) { AND.copy(tx); return; } if (navigator.clipboard) navigator.clipboard.writeText(tx).then(function () { CN.toast('천체 정보를 복사했어요'); }, function () {}); return; }
      if (c === 'Equal' || c === 'Minus') { ev.preventDefault(); stepTime(c === 'Equal' ? 3600 : -3600); return; }
      if (cm) { ev.preventDefault(); act(cm); }
      return;
    }
    if (ev.altKey) {
      ev.preventDefault();
      if (c === 'Equal' || c === 'Minus') stepTime((c === 'Equal' ? 1 : -1) * 86164.0905);
      else if (c === 'KeyS' && !ev.shiftKey) toggle('starNames'); else if (c === 'KeyP') toggle('planetNames');
      else if (ev.shiftKey && c === 'KeyN' && !g) { tracking = false; centerOn([0, 0, 1], 700); } else if (ev.shiftKey && c === 'KeyS' && !g) { tracking = false; centerOn([0, 0, -1], 700); }
      return;
    }
    if (ev.shiftKey && !g) {
      var look = { KeyN: [0, null], KeyE: [90, null], KeyS: [180, null], KeyW: [270, null], KeyZ: [180, 89.5] }[c];
      if (look) { ev.preventDefault(); var hh = m3v(Fhor, fwdW()); lookAt(look[0], look[1] === null ? Math.asin(clamp(hh[2], -1, 1)) * R2D : look[1]); return; }
      if (c === 'KeyQ') { toggle('compass'); return; }
      if (c === 'KeyJ' || c === 'KeyL') { S.rate = clamp(S.rate * (c === 'KeyL' ? 2 : 0.5), -1e7, 1e7) || 1; S.playing = true; buildTools(); return; }
    }
    if (k === 'Tab') { ev.preventDefault(); act('galaxy'); return; }
    if (k === ' ') { ev.preventDefault(); act('center'); return; }
    if (k === 'PageUp') { ev.preventDefault(); zoom(0.8); return; }
    if (k === 'PageDown') { ev.preventDefault(); zoom(1.25); return; }
    if (k === '/') { ev.preventDefault(); act('zoomIn'); return; }
    if (k === '\\') { ev.preventDefault(); act('zoomOut'); return; }
    if (/^Arrow/.test(k)) {
      ev.preventDefault(); if (sensorActive() || !userMove()) return;
      var sx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, sy = k === 'ArrowUp' ? 1 : k === 'ArrowDown' ? -1 : 0;
      if (!g) { S.lon = (S.lon + (S.mount === 'az' ? 1 : -1) * sx * S.fov * 0.06 / Math.max(Math.cos(S.lat * D2R), 0.15) + 360) % 360; S.lat = clamp(S.lat + sy * S.fov * 0.06, -89.5, 89.5); }
      else { O.yaw += sx * 0.06; O.pitch = clamp(O.pitch - sy * 0.06, -1.55, 1.55); }
      return;
    }
    // 시간
    if (lk === 'j') return act('slow'); if (lk === 'l' && !g) return act('fast'); if (lk === 'k') return act('play');
    if (k === '7') { if (!g) act('pause'); return; } if (k === '8') { if (!g) act('now'); return; } if (k === '0') { if (!g) act('reverse'); return; }
    if (k === '=' || k === '-') return stepTime(k === '=' ? 86400 : -86400);
    if (k === ']' || k === '[') return stepTime(k === ']' ? 7 * 86400 : -7 * 86400);
    if (g) {
      var gm = { c: 'conLines', v: 'gNames', r: 'arms', e: 'rings', z: 'stems', l: 'sight' };
      if (gm[lk]) toggle(gm[lk]);
      else if (/^[1-6]$/.test(k) && !(anim && anim.lock)) goPreset(PRESETS[+k - 1]);
      return;
    }
    var em = { c: 'conLines', v: 'conNames', r: 'art', b: 'bounds', e: 'eqGrid', z: 'azGrid', ',': 'ecliptic', '.': 'equator', ';': 'meridian', h: 'horizon', g: 'ground', f: 'fog', a: 'atm', q: 'cardinal', d: 'dso', i: 'dsoImg', s: 'stars', p: 'planets', m: 'milky' };
    if (em[lk]) toggle(em[lk]);
    else if (lk === 't') { tracking = !tracking && !!sel; buildTools(); }
  });

  // 시험·디버그용
  window.SM = { S: S, O: O, sensor: sensor, fwdHor: function () { return m3v(Fhor, fwdW()); }, sensorStart: sensorStart, sensorStop: sensorStop, sensorHor: sensorHor, get sel() { return sel; }, select: function (id) { if (state.byId[id]) selectObj(state.byId[id], true); }, enterGalaxy: enterGalaxy, enterEarth: enterEarth, proj: proj, objs: objs, get tr() { return tr; } };
})();
