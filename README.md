# korea-health-mcp-server

대한민국 공공 의료 데이터(data.go.kr)를 Claude 등 MCP 클라이언트에서 자연어로 조회하는 MCP 서버입니다. 로컬(stdio) 실행을 기본으로 하며, 원격(HTTP)으로 확장할 수 있도록 트랜스포트를 분리해 두었습니다.

> 상태: **구현 완료 · 7개 도구 전부 실제 키로 라이브 검증됨**(2026-06-21). 타입체크 0 에러.

## 빠른 시작 (npx · 권장)

clone·빌드 없이 **명령어 한 줄**로 실행됩니다. data.go.kr 키 발급(아래 *사전 준비*)만 하면 됩니다.

`claude_desktop_config.json` 에 추가:

```jsonc
{
  "mcpServers": {
    "korea-health": {
      "command": "npx",
      "args": ["-y", "dk-korea-health-mcp"],
      "env": {
        "DATA_GO_KR_SERVICE_KEY": "발급받은_키",
        "KEY_IS_ENCODED": "true"
      }
    }
  }
}
```

> macOS 설정 경로: `~/Library/Application Support/Claude/claude_desktop_config.json` — 수정 후 Claude Desktop 을 완전히 종료했다 재시작하세요.
> `KEY_IS_ENCODED` 는 일반인증키(Encoding)면 `"true"`, Decoding 키면 `"false"`.
> 소스에서 직접 빌드하려면 아래 *설치·빌드·실행* 을 참고하세요.

## 제공 도구 (노출 10 = 도메인 8 + 메타 2, 숨김 1)

| 도구 | 설명 | 데이터 출처 |
|------|------|-------------|
| `kohealth_search_nonpayment` | 지역/종별 비급여 항목·가격·기관 (itemKeyword 필터) | 심평원 비급여진료비정보 |
| `kohealth_get_hospital_nonpayment` | 특정 병원(병원명)의 비급여 목록 | 심평원 비급여진료비정보 |
| `kohealth_search_hospital` | 기관명/지역/종별/진료과목으로 병원 검색 (주소·전화·ykiho) | 심평원 병원정보서비스 |
| `kohealth_get_hospital_info` | ykiho로 진료과목별 전문의수·의료장비·시설 | 심평원 의료기관별상세정보서비스(v2.8) |
| `kohealth_get_clinic_top_diseases` | 의원(clCd=31) ykiho의 최근 1년 상위 5개 질병 | 심평원 병원진료정보조회서비스 |
| `kohealth_search_drug` | 의약품 효능·용법·주의·부작용 검색 | 식약처 e약은요 |
| `kohealth_get_drug_dur` | DUR 안전정보(병용/연령/임부/노인/효능중복) | 식약처 DUR 품목정보 |
| `kohealth_get_disease_stats` | 질병명·코드 조회 + 성별연령/입원외래/종별/지역별 진료통계 | 심평원 질병정보서비스 |
| `discover_tools` / `execute_tool` | 숨김 도구 발견·프록시 호출 (확장용 메타 도구) | — |
| _(숨김)_ `kohealth_get_drug_usage` | 급여의약품 사용량(약효분류/ATC/성분 × 지역/종별/상병). 코드 필요 → `execute_tool` 로 호출 | 심평원 의약품사용정보조회서비스 |

> 연결 고리: 비급여 검색과 병원 검색이 모두 병원명·ykiho 를 돌려줍니다. `kohealth_search_hospital` 의 ykiho 를 `kohealth_get_hospital_info` 에 넘기면 그 병원의 진료과목·장비까지 이어 조회됩니다. (ykiho 는 list 검색의 *입력 필터*로는 동작하지 않아 병원 검색은 병원명 기준)

> 개인 단위 청구내역은 공개 API로 제공되지 않습니다. 받을 수 있는 것은 공개된 가격·의약품 정보와 집계 통계뿐입니다.

## 사전 준비 (직접 해야 함)

1. [data.go.kr](https://www.data.go.kr) 회원가입
2. 아래 각 서비스에서 **"활용신청"** (서비스별로 따로 승인, 대부분 자동승인·무료). 링크가 안 열리면 data.go.kr 검색창에 같은 이름을 붙여넣으세요:
   - [건강보험심사평가원_비급여진료비정보](https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=API&keyword=건강보험심사평가원%20비급여진료비정보)
   - [건강보험심사평가원_병원정보서비스](https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=API&keyword=건강보험심사평가원%20병원정보서비스)
   - [건강보험심사평가원_의료기관별상세정보서비스](https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=API&keyword=건강보험심사평가원%20의료기관별상세정보서비스)
   - [건강보험심사평가원_병원진료정보조회서비스](https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=API&keyword=건강보험심사평가원%20병원진료정보조회서비스)
   - [건강보험심사평가원_질병정보서비스](https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=API&keyword=건강보험심사평가원%20질병정보서비스)
   - [건강보험심사평가원_의약품사용정보조회서비스](https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=API&keyword=건강보험심사평가원%20의약품사용정보조회서비스)
   - [식품의약품안전처_의약품개요정보(e약은요)](https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=API&keyword=의약품개요정보%20e약은요)
   - [식품의약품안전처_의약품안전사용서비스(DUR)품목정보](https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=API&keyword=의약품%20DUR%20품목정보)
3. 발급된 서비스키를 설정 — **(A) npx 사용 시** Claude Desktop 설정의 `env` 블록에(위 *빠른 시작*), **(B) 소스 빌드 시** `.env` 에 (`.env.example` 복사).

```bash
cp .env.example .env
# DATA_GO_KR_SERVICE_KEY=발급받은_키
# KEY_IS_ENCODED=true   # Encoding 키면 true, Decoding 키면 false (키가 hex면 무관)
```

> `.env` 는 실행 위치(cwd)와 무관하게 **프로젝트 루트에서 자동 로드**됩니다. 따라서 Claude Desktop 설정에 키를 중복으로 넣지 않아도 됩니다.

## 설치 · 빌드 · 실행

```bash
npm install
npm run build
npm start          # stdio로 실행
npm run typecheck  # tsc --noEmit
npm run inspect    # MCP Inspector로 도구 테스트
```

## Claude Desktop 연결 (소스 빌드 시)

> npx 로 쓰는 경우는 위 *빠른 시작* 을 사용하세요. 아래는 소스에서 직접 빌드한 경우입니다.

`claude_desktop_config.json`에 추가 (키는 `.env`에서 자동 로드되므로 `env` 불필요):

```json
{
  "mcpServers": {
    "korea-health": {
      "command": "node",
      "args": ["/절대경로/korea-health-mcp-server/dist/index.js"]
    }
  }
}
```

> macOS 설정 파일 경로: `~/Library/Application Support/Claude/claude_desktop_config.json`
> 수정 후 Claude Desktop 을 완전히 종료했다 재시작하세요.

## 실호출 검증 현황 (2026-06-21, 실제 키)

7개 도메인 도구 전부 라이브 검증 ✅ (예시는 실제 응답):

| 도구 | 결과 | 라이브 예시 |
|------|------|------------|
| `kohealth_search_drug` | ✅ | "게보린정" 효능·용법·부작용 |
| `kohealth_search_hospital` | ✅ | "서울대학교병원" 4건(주소·전화·ykiho) |
| `kohealth_search_nonpayment` | ✅ | 서울 MRI → 더드림병원 69만원 |
| `kohealth_get_hospital_nonpayment` | ✅ | 병원명 매칭 비급여 목록 |
| `kohealth_get_drug_dur` | ✅ | 이트라코나졸 ↔ 심바스타틴 / 횡문근융해증 |
| `kohealth_get_hospital_info` | ✅ | 서울대병원 내과 전문의 166명 / 인큐베이터 61대 |
| `kohealth_get_clinic_top_diseases` | ✅ | 봄안과의원 → 각막염·근시·녹내장·망막질환·백내장 |
| `kohealth_get_disease_stats` | ✅ | I10(고혈압) 지역별: 서울 환자 136만명 |
| `kohealth_get_drug_usage` (숨김) | ◐ | 엔드포인트 검증, 요청변수·코드는 활용가이드 필요 |

> 로컬(stdio)·원격(HTTP) 트랜스포트 둘 다 기동·`tools/list` 검증 완료.

라이브로 확정해 코드에 반영한 사항:

- **엔드포인트 버전·접미사**: 의료기관별상세 `MadmDtlInfoService2.8`(2.7 아님), 질병정보 `diseaseInfoService1`(접미사 1). 둘 다 처음엔 Forbidden/error 였으나 승인 문제가 아니라 경로 문제였음.
- **sidoCd 는 명칭이 아니라 숫자코드** (서울 110000, 전남 360000, 세종 410000). `SIDO_CODE` 맵 + `normalizeRegion()` 이 "서울"→"110000" 변환.
- **서버 필터가 안 되는 항목**(비급여 항목명·병원명, DUR 성분명, 질병명)은 `clientFilter()` 로 처리. 질병 마스터(2065건)는 전체를 한 번에 받아(캐시) 필터. ykiho 는 list 검색의 입력 필터로 동작 안 함 → 연결은 병원명 기준.
- **질병통계는 `year` 필수**, `sickCd` 와 함께. 4종(성별연령/입원외래/종별/지역별) 동일 파라미터.
- **XML 응답 필드명**: e약은요 camelCase(efcyQesitm…), DUR 대문자_언더스코어(ITEM_NAME, PROHBT_CONTENT, MIXTURE_*), 질병/병원상세 각자 다름 — 렌더러에 반영.
- **XML 파서 버그 수정**: `parseTagValue:false` (안 그러면 `<resultCode>00</resultCode>`→숫자 0 으로 깨져 정상 응답을 에러 처리).

남은 선택 과제:

- 추가 승인 서비스(의약품사용정보조회서비스, 병원진료정보조회서비스)에 대한 도구 — 필요 시 `tools/` 에 1파일씩 추가.
- HTTP 원격 배포(`runHttp()`).

## 원격(HTTP) 실행 — 구현됨

`TRANSPORT=http` 로 실행하면 Streamable HTTP(스테이트리스) 서버가 뜹니다. 도구 코드는 stdio 와 100% 공유.

```bash
TRANSPORT=http PORT=3000 npm start
# 헬스체크
curl http://localhost:3000/healthz        # {"ok":true}
# MCP 호출 (initialize/tools/list/tools/call 모두 POST /mcp)
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

요청마다 새 서버·트랜스포트를 만드는 스테이트리스 구조라 수평 확장에 유리합니다(세션 유지가 필요하면 `sessionIdGenerator` 를 지정).

## 구조

```
src/
  index.ts                    # 부트스트랩 + 트랜스포트 선택(stdio/http) + 핸들러 래퍼
  constants.ts                # API 베이스, 서비스/오퍼레이션, 캐시TTL·재시도·페이지네이션 정책
  types.ts                    # 공통 타입(엔벨로프, ToolDefinition, ToolContext)
  services/
    dataGoKr.ts               # API 클라이언트(키 처리, URL 조립, XML/JSON 파싱, 엔벨로프 정규화, 캐시)
    fetchWithRetry.ts         # 빈응답·HTML 점검페이지·5xx 재시도 + exponential backoff
    cache.ts                  # TTL 캐시(검색 1h / 상세 24h)
    errors.ts                 # data.go.kr 결과코드 → 행동가능한 한국어 메시지
  schemas/
    common.ts                 # 공통 zod(페이지네이션/포맷) + 렌더링/절단 헬퍼
  normalizer/
    searchNormalizer.ts       # 자연어 → 검증 파라미터(PARAM_MAP) + 지역 약칭 정규화
  tools/
    nonpayment.ts hospital.ts clinicDiag.ts   # 비급여 · 병원 · 의원진료
    drug.ts dur.ts stats.ts drugUsage.ts       # 의약품 · DUR · 질병통계 · 약품사용(숨김)
    registry.ts               # 도구 레지스트리(구현 N개 / 노출 소수)
    metaTools.ts              # discover_tools / execute_tool 프록시
```

- `index.ts` 의 `runHttp()` 가 Streamable HTTP 트랜스포트(스테이트리스) 구현. `.env` 는 프로젝트 루트에서 자동 로드.

### 설계 메모

korean-law-mcp 생태계 조사에서 가져온 패턴 3가지를 반영했습니다.

1. **클라이언트 책임 분리** — 키처리/파싱/정규화(`dataGoKr.ts`) ↔ 재시도(`fetchWithRetry.ts`) ↔ 캐시(`cache.ts`)를 분리.
2. **파라미터 보정 레이어** — `searchNormalizer.ts` 가 자연어/논리 키를 검증된 API 파라미터로 변환. 미확정 파라미터명을 `PARAM_MAP` 한 곳에 모아 TODO로 관리.
3. **구현 N개 / 노출 소수** — `registry` + `metaTools(discover_tools→execute_tool)` 구조로, 도구가 늘어도 ListTools 컨텍스트를 작게 유지.
