# data/catalog.json 형식 (v1)

배열 하나. 천체 하나 = 객체 하나. **id는 한 번 정하면 바꾸지 않는다**(DB 편집 내용·사진이 id에 매달림).

## id 규칙
- 메시에: `m1` ~ `m110`
- NGC/IC/기타 카탈로그: `ngc869`, `ngc884`, `ic1805`, `mel20`, `cr399`, `b33`(말머리) — 소문자·공백 없음
  - 메시에 번호가 있는 천체는 메시에 id만 쓴다(NGC 224 → `m31`)
- 별: 영문 고유명 소문자, 공백·특수문자는 `-` (`vega`, `sirius`, `alpha-centauri`, `stephenson-2-18`)
  - 이중성은 대표 이름 하나로 (`mizar` = 미자르·알코르, `albireo`)
- 태양계: `sun`, `moon`, `mercury`, `venus`, `earth`, `mars`, `jupiter`, `saturn`, `uranus`, `neptune`
- 위성: `europa`, `io`, `ganymede`, `callisto`, `titan`, `enceladus`, `tethys`, `dione`, `triton`

## 필드
| 필드 | 형식 | 대상 | 설명 |
|---|---|---|---|
| id | string | 전부 | 위 규칙 |
| nameKo | string | 전부 | 화면 표시 한글 이름 (예: "안드로메다 은하", "베가") |
| nameEn | string | 전부 | 영문 이름 |
| aliasesKo | string[] | 선택 | 다른 한글 이름 (예: ["직녀성"], ["좀생이별"]) — 검색용 |
| catalog | string | 전부 | 대표 번호 표기 (예: "M31", "NGC 869", "α Lyr", "ζ UMa") |
| altCatalog | string | 선택 | 보조 번호 (예: "NGC 224") |
| type | enum | 전부 | `star` `planet` `moon` `cluster` `nebula` `galaxy` `other` (sun·earth는 `planet` 아님 → `other`) |
| subtype | string | 전부 | 한글 세부분류. star: 단일별/이중성/변광성 · planet: 내행성/외행성 · moon: 위성 · cluster: 산개성단/구상성단 · nebula: 발광성운/반사성운/행성상성운/초신성잔해/암흑성운 · galaxy: 나선은하/막대나선은하/타원은하/렌즈형은하/불규칙은하 · other: 항성(태양)/행성(지구)/별구름/성군/자리표시 |
| constellationKo | string\|null | 전부 | 한글 별자리 이름(태양계 천체는 null) |
| ra | number\|null | 고정 천체 | J2000 적경, **시간 단위 소수** (0~24) |
| dec | number\|null | 고정 천체 | J2000 적위, 도 단위 소수 |
| mag | number\|null | 고정 천체 | 겉보기 등급 (암흑성운 등 의미 없으면 null) |
| magRange | [밝을때, 어두울때] | planet·moon | 예: 수성 [-2.48, 7.25] |
| absMag | number\|null | star | 절대 등급 (거리 모듈러스 + 알려진 값 우선, 위키 값과 크게 다르면 위키 값) |
| distanceLy | number\|null | star·cluster·nebula·galaxy·other | 지구로부터 거리(광년) |
| distanceAU | [최소, 최대] | planet | **태양으로부터** 거리 범위(AU) |
| distanceKm | [최소, 최대] | moon | 달: 지구로부터 / 위성: 모행성으로부터 (km). 범위가 작으면 [평균, 평균] |
| parent | string | moon(위성) | 모행성 id (`jupiter`) — 달(moon)은 `earth` |
| sizeArcmin | number\|null | cluster·nebula·galaxy·other | 겉보기 크기(장축, 각분) |
| spectral | string | star | 분광형 (예: "A0V") |
| bv | number | star | B−V 색지수 (기본 별 그림 색깔) |
| radiusSun | number | star(선택) | 반지름(태양=1) |
| components | [{nameKo, mag, distanceLy}] | 이중성 | 성분별 값 (천체 카드처럼 "2.23, 3.99") |
| diameterKm | number | planet·moon | 지름(km) |
| moons | number | planet | 위성 수(2026년 기준 알려진 값) |
| orbitYears | number | planet | 공전 주기(년) |
| dynamic | true | 태양·달·행성·위성 | 위치를 날짜로 계산하는 천체 |
| body | string | dynamic | astronomy-engine 천체 이름 ("Saturn", "Moon", "Sun"); 위성은 모행성 body |
| wikiTitleEn | string | 전부 | 영어 위키백과 문서 제목(사진 수집용) |
| featured | true | 선택 | 「관측회 추천」 초기값 (관리자가 사이트에서 바꿀 수 있음) |
| source | string | 선택 | 수치 출처 메모 ("OpenNGC; dist: Wikipedia") |

규칙
- 키가 해당 없으면 **생략**(null 남발 금지, 단 ra/dec/mag는 고정 천체에 반드시 있음).
- 숫자는 숫자로(문자열 X). 거리 1,000만 광년은 10000000.
- "verify" 같은 작업용 필드는 최종 파일에 남기지 않는다.

## data/constellations.json (별자리 88개, 2026-10-13 추가)
`tools/constellation-stats.mjs`(IAU 경계를 astronomy-engine `Constellation()`으로 0.25° 격자 표본) → `tools/build-constellations.mjs`로 생성. catalog.js가 catalog.json 뒤에 붙여서 한 목록으로 씀.

| 필드 | 설명 |
|---|---|
| id | `con-` + IAU 약자 소문자 (`con-ori`, `con-uma`) |
| nameKo / nameEn / catalog | 한국천문학회 이름 / 라틴어 이름 / IAU 약자 |
| type / subtype | `constellation` / `주극성(항상 보임)`·`봄철 별자리`·`여름철 별자리`·`가을철 별자리`·`겨울철 별자리`·`전몰성(한국에서 안 보임)` |
| ra / dec | 별자리 넓이 가중 중심 (위치 계산용) |
| visibility | `circumpolar` / `season` / `never` |
| seoul | `{circPct, neverPct, decMin, decMax, areaDeg2}` 서울(37.57°N) 기준 |
| visNote | 일부만 주극·일부만 떠오름·계절 조정 설명 |
| aliasesKo, asterisms | 검색용 다른 이름, 성군 설명(예: 큰곰자리 → 북두칠성) |

분류 기준(지도교사 합의): 넓이 80% 이상 주극 → 주극성 / 북쪽 끝 최고 고도 10° 미만 → 전몰성 / 나머지는 중심 적경 3·9·15·21시 경계로 계절, 페르세우스=가을·게=봄으로 조정.
