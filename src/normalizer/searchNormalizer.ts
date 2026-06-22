/**
 * 자연어 → 검증된 data.go.kr 파라미터 변환 레이어.
 *
 * korea-law 의 search-normalizer / query-router 패턴 차용.
 * 두 가지를 한다:
 *  1) 논리적 필터 키(예: itemName) → 실제 API 파라미터명(예: itemNm) 매핑.
 *     ← 활용가이드 미확정 파라미터명을 *한 곳* 에 모아 TODO 로 관리.
 *  2) 약칭/별칭 정규화(예: "타이레놀"→ 그대로, 지역 약칭 → 표준명).
 *
 * 키 발급 후 활용가이드와 대조해 PARAM_MAP 의 TODO 만 고치면 모든 도구가 함께 정정된다.
 */

import type { ServiceKey } from "../constants.js";

/**
 * 서비스별 [논리 키 → API 파라미터명] 매핑.
 * 값에 `// TODO` 표시가 있는 것은 best-guess.
 */
export const PARAM_MAP: Record<ServiceKey, Record<string, string>> = {
  nonpayment: {
    // 라이브 검증: sidoCd(숫자코드), clCd 만 서버 필터 동작.
    // 항목명/npayCd 는 서버 필터 미지원 → 도구에서 클라이언트측 필터(npayKorNm)로 처리.
    sidoCd: "sidoCd", // 시도코드 (숫자, 예: 서울 110000) ✓
    sgguCd: "sgguCd", // 시군구코드 (숫자) ✓
    clCd: "clCd", // 종별코드 (예: 종합병원 11) ✓
  },
  drug: {
    // e약은요 — 라이브 검증됨
    itemName: "itemName", // 제품명 ✓
    entpName: "entpName", // 업체명 ✓
    efcyQesitm: "efcyQesitm", // 효능 ✓
  },
  dur: {
    // DUR 품목정보 — 라이브 검증: itemName 서버 필터 동작.
    // 성분명은 서버 필터 미동작 → 클라이언트측 필터(INGR_KOR_NAME)로 처리.
    itemName: "itemName", // 제품명 ✓
  },
  stats: {
    // 질병정보서비스 — 라이브 검증. 질병명은 서버 필터 미지원(클라이언트 필터).
    // 통계는 sickCd + year 필수. sickType/medTp 는 의과(1,1) 고정.
    sickCode: "sickCd", // 질병코드 ✓
    year: "year", // 통계 연도 ✓ (필수)
    sickType: "sickType", // 1=의과
    medTp: "medTp", // 1=의과(양방)
  },
  hospital: {
    // 병원정보서비스 — 라이브 검증됨
    hospitalName: "yadmNm", // 기관명 ✓
    sidoCd: "sidoCd", // 시도코드 (숫자) ✓
    sgguCd: "sgguCd", // 시군구코드 (숫자)
    clCd: "clCd", // 종별코드(상급종합 01, 종합병원 11 등) ✓
    dgsbjtCd: "dgsbjtCd", // 진료과목코드
  },
  hospitalDetail: {
    // 의료기관별상세정보서비스 — 라이브 검증(v2.8)
    ykiho: "ykiho",
  },
  clinicDiag: {
    // 병원진료정보조회서비스 — 라이브 검증
    ykiho: "ykiho",
  },
  drugUsage: {
    // 의약품사용정보조회서비스 — 코드 기반 통계. extra_params 로 그대로 통과.
  },
};

/**
 * 심평원 시도코드 (라이브 검증). data.go.kr 의 sidoCd 는 *명칭이 아니라 숫자코드*.
 * 예: getHospBasisList?sidoCd=110000 → 서울.
 */
export const SIDO_CODE: Record<string, string> = {
  서울: "110000",
  부산: "210000",
  대구: "220000",
  인천: "230000",
  광주: "240000",
  대전: "250000",
  울산: "260000",
  세종: "410000", // 라이브 검증: sidoCdNm="세종시"
  경기: "310000",
  강원: "320000",
  충북: "330000",
  충남: "340000",
  전북: "350000",
  전남: "360000", // 라이브 검증
  경북: "370000",
  경남: "380000",
  제주: "390000",
};

/**
 * 논리적 필터 객체 → API 파라미터 객체로 변환.
 * 매핑에 없는 키는 그대로 통과(extra_params 우회용).
 */
export function toApiParams(
  service: ServiceKey,
  logical: Record<string, string | number | undefined>,
): Record<string, string | number | undefined> {
  const map = PARAM_MAP[service];
  const out: Record<string, string | number | undefined> = {};
  for (const [k, v] of Object.entries(logical)) {
    if (v === undefined || v === "") continue;
    const apiKey = map[k] ?? k;
    out[apiKey] = v;
  }
  return out;
}

/**
 * 지역 입력 → 심평원 sidoCd 숫자코드.
 * "서울", "서울특별시", "서울시" 등 접미사를 떼고 매핑. 이미 숫자코드면 그대로.
 * 매핑 실패 시 undefined (도구에서 필터를 빼고 호출).
 */
export function normalizeRegion(input: string): string | undefined {
  const t = input.trim();
  if (/^\d{6}$/.test(t)) return t; // 이미 sidoCd 코드
  // 접미사 제거: 특별시/광역시/특별자치시/특별자치도/도/시
  const short = t.replace(/(특별자치시|특별자치도|특별시|광역시|도|시)$/u, "");
  return SIDO_CODE[short] ?? SIDO_CODE[t];
}

/** 검색어 정규화: 양끝 공백 제거, 내부 다중 공백 1개로. */
export function normalizeQuery(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}
