# 2026 광수중학교 주민 공개 천체관측회 사이트

주소: https://ddelza.github.io/cosmos/2026/ · 행사 2026-11-03(화) · 천체관측동아리 코스모스

| 페이지 | 내용 |
|---|---|
| `index.html` | 포스터 · 공지 · 행사 안내 · 사전신청 버튼 · 메뉴 · (맨 아래) 관리자 로그인 |
| `register.html` | 사전신청 (학생/교사/학부모/일반주민) → 구글 시트 |
| `sky.html` | 시간대별 천체 미리보기 (18:30/19:30/20:30/21:30, 최소 고도 조절) |
| `objects.html` | 천체 둘러보기 목록 / `?id=m31` 상세 + 관리자 편집 |
| `page.html?p=dirs·safety·guide·goods` | 오시는 길·주의사항·진행 안내·기념품 |
| `admin.html` | 신청 인원·마감, 행사 날짜(연기 시), 작성 현황, 백업 |

## 데이터가 어디에 있나
- **천체 기본 정보(AI 입력)**: `data/catalog.json` — `tools/build-catalog.mjs`로 생성, 형식은 `tools/CATALOG_SPEC.md`
- **작년 자료(초기 내용)**: `data/seed.json` — 2025 천체카드·관측회 사이트에서 옮김, 학생이 저장하면 DB 내용이 우선
- **학생 편집 내용**: Firebase RTDB `years/2026/cosmosNight/` (objects · history · pages · config)
- **사진 파일**: 구글 드라이브 「2026 주민관측회 사진」 (Apps Script가 저장, DB에는 파일 id만)
- **사전신청 명단**: 구글 시트 「신청」 탭 (사이트·DB에는 이름 없음) — 2026-11-30까지 보관 후 파기
- **기본 사진**: `img/objects/` + 출처 `data/credits.json` (위키미디어 공용, 자유 이용 라이선스)

## Apps Script (`apps-script/Code.gs`)
사전신청 저장·인원 집계·관리자 비밀번호 확인·드라이브 사진 저장. 코드를 고치면
Apps Script 편집기에 붙여넣고 **배포 → 배포 관리 → 수정 → 새 버전**(URL 유지).
관리자 비밀번호는 스크립트 속성 `ADMIN_PW`.

## 행사 전에 할 일
- `node tools/snapshot.mjs` → DB 편집 내용을 `data/content.json`, 포스터를 `img/poster.jpg`로 저장 후 커밋
  (옥상 통신이 약해도 설명 팝업이 뜨게). 드라이브 사진까지 사본이 필요하면 `--photos`
- 비로 연기되면: 관리자 메뉴 → 행사 날짜 변경 + 메인 공지·행사 안내 수정

## 계산·검증
- 천체 위치: `js/astro.js` (Astronomy Engine, MIT, `js/vendor/`에 포함 — 인터넷 없이도 계산)
- 테스트: `node tools/test-astro.cjs` (토성·북극성·베가 기준값 + 독립 공식 교차 확인)

## 밤하늘 관측 도우미 (`cosmos/nightly.html`)
행사와 상관없이 언제든 쓰는 관측 도우미. **같은 천체 아카이브(카탈로그·학생 편집·사진)를 그대로 공유**한다.
- 날짜·시각·장소(광수중 / 내 위치 / 직접 입력)를 고르면 그때 보이는 천체, 오늘 밤 한 번이라도 보이는 천체, 모든 천체(그 시각 위치 표시) 3가지 보기
- 천체를 누르면 **일몰~일출 사이 정각마다 방위·고도** 표 (고른 시각 줄 강조), `?id=`로 전체 페이지
- 설정은 주소(`?date=&time=&lat=&lon=&name=`)에 남아 링크로 공유 가능. 시각은 기기 시간대 기준
- 2026 폴더의 공용 JS를 `window.CN_BASE = '2026/'`로 불러 씀 → 2026 쪽 공용 코드를 고치면 nightly도 같이 바뀜
