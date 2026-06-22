/**
 * data.go.kr 서비스 엔드포인트 · 검증된 오퍼레이션명 모음.
 *
 * 출처: korea-health-mcp 설계 문서(README) + data.go.kr 활용가이드.
 * 오퍼레이션명은 라이브 검증된 것으로 표기하되, 미검증/추정 파라미터는
 * 각 도구 파일과 normalizer에서 `// TODO` 로 명시한다.
 */

/** data.go.kr OpenAPI 게이트웨이 베이스. 서비스별 path 는 SERVICES 에서 합친다. */
export const API_BASE = "http://apis.data.go.kr";

/** 한 서비스(=하나의 data.go.kr 활용신청 단위)를 기술한다. */
export interface ServiceSpec {
  /** 사람이 읽는 이름 (에러 메시지·discover_tools 노출용) */
  readonly label: string;
  /** API_BASE 뒤에 붙는 서비스 경로 */
  readonly path: string;
  /**
   * 오퍼레이션명 → 실제 URL 세그먼트.
   * null 인 항목은 활용가이드에서 확정해야 하는 TODO (예: 통계 수치).
   */
  readonly operations: Readonly<Record<string, string | null>>;
}

/**
 * 4개 서비스.
 * NOTE(검증): operation *세그먼트* 는 활용가이드 기준 best-known 값.
 * 키 발급 후 MCP Inspector 로 1건씩 실호출해 확정할 것.
 */
export const SERVICES = {
  /** 건강보험심사평가원_비급여진료비정보 */
  nonpayment: {
    label: "건강보험심사평가원_비급여진료비정보",
    path: "/B551182/nonPaymentDamtInfoService",
    operations: {
      // 비급여 항목별 의료기관 목록
      searchList: "getNonPaymentItemHospDtlList",
      // 특정 기관(ykiho)의 비급여 상세
      hospitalDetail: "getNonPaymentItemHospList",
    },
  },

  /** 식품의약품안전처_의약품개요정보(e약은요) */
  drug: {
    label: "식품의약품안전처_의약품개요정보(e약은요)",
    path: "/1471000/DrbEasyDrugInfoService",
    operations: {
      // 효능·용법·주의·부작용 검색
      search: "getDrbEasyDrugList",
    },
  },

  /** 식품의약품안전처_의약품 DUR 품목정보 */
  dur: {
    label: "식품의약품안전처_의약품 DUR 품목정보",
    // NOTE(검증): DUR 서비스는 버전 접미사(...Service03 등)가 자주 바뀐다. 활용가이드 확인.
    path: "/1471000/DURPrdlstInfoService03",
    operations: {
      // 병용금기
      usjntTaboo: "getUsjntTabooInfoList03",
      // 연령금기
      ageTaboo: "getSpcifyAgrdeTabooInfoList03",
      // 임부금기
      pregnancyTaboo: "getPwnmTabooInfoList03",
      // 노인주의
      elderlyCaution: "getOdsnAtentInfoList03",
      // 효능군중복
      effectOverlap: "getEfcyDplctInfoList03",
    },
  },

  /** 건강보험심사평가원_병원정보서비스 (기관 검색) */
  hospital: {
    label: "건강보험심사평가원_병원정보서비스",
    // NOTE(검증): 버전 접미사(...v2, ...v2.1 등)가 자주 바뀜. 활용가이드 확인.
    path: "/B551182/hospInfoServicev2",
    operations: {
      // 기관명/종별/지역/진료과목으로 병원 검색
      searchList: "getHospBasisList",
    },
  },

  /** 건강보험심사평가원_의료기관별상세정보서비스 (ykiho 상세) — 라이브 검증(v2.8) */
  hospitalDetail: {
    label: "건강보험심사평가원_의료기관별상세정보서비스",
    // 라이브 검증(2026-06-21): 버전은 2.8. (2.7 은 Forbidden)
    path: "/B551182/MadmDtlInfoService2.8",
    operations: {
      // 진료과목정보(진료과목별 전문의 수) ✓
      dgsbjt: "getDgsbjtInfo2.8",
      // 의료장비정보 ✓
      equipment: "getMedOftInfo2.8",
      // 시설정보 ✓
      facility: "getEqpInfo2.8",
    },
  },

  /** 건강보험심사평가원_질병정보서비스 — 라이브 검증(v1, XML) */
  stats: {
    label: "건강보험심사평가원_질병정보서비스",
    // 라이브 검증(2026-06-21): base 경로 끝에 "1" 접미사. (diseaseInfoService 는 오류)
    path: "/B551182/diseaseInfoService1",
    operations: {
      // 질병명칭/코드조회 ✓
      diseaseSearch: "getDissNameCodeList1",
      // 질병 성별·연령별 통계 ✓ (year 필수)
      statsGenderAge: "getDissByGenderAgeStats1",
      // 질병 입원·외래별 통계 ✓
      statsInOut: "getDissByHsptlzFrgnStats1",
      // 질병 의료기관 종별 통계 ✓
      statsByClass: "getDissByClassesStats1",
      // 질병 의료기관 지역별 통계 ✓
      statsByArea: "getDissByAreaStats1",
    },
  },
  /** 건강보험심사평가원_병원진료정보조회서비스 — 라이브 검증 */
  clinicDiag: {
    label: "건강보험심사평가원_병원진료정보조회서비스",
    path: "/B551182/hospDiagInfoService1",
    operations: {
      // 의원(clCd=31) ykiho 의 최근 1년 진료 상위 5개 국민관심질병
      top5: "getClinicTop5List1",
    },
  },

  /** 건강보험심사평가원_의약품사용정보조회서비스 — 급여의약품 사용 통계(코드 필요) */
  drugUsage: {
    label: "건강보험심사평가원_의약품사용정보조회서비스",
    path: "/B551182/msupUserInfoService1.2",
    // 분류(약효분류군 meft / 3·4단계 ATC / 성분 cmpn) × 분해(지역 area / 종별 cl / 상병 sick)
    operations: {
      meftArea: "getMeftDivAreaList1.2",
      meftCl: "getMeftDivClList1.2",
      meftSick: "getMeftDivSickList1.2",
      atc3Area: "getAtcStp3AreaList1.2",
      atc3Cl: "getAtcStp3ClList1.2",
      atc3Sick: "getAtcStp3SickList1.2",
      atc4Area: "getAtcStp4AreaList1.2",
      atc4Cl: "getAtcStp4ClList1.2",
      atc4Sick: "getAtcStp4SickList1.2",
      cmpnArea: "getCmpnAreaList1.2",
      cmpnCl: "getCmpnClList1.2",
      cmpnSick: "getCmpnSickList1.2",
    },
  },
} satisfies Record<string, ServiceSpec>;

export type ServiceKey = keyof typeof SERVICES;

/** 캐시 TTL (ms). 검색은 짧게, 정적 상세는 길게. */
export const CACHE_TTL = {
  search: 60 * 60 * 1000, // 1h
  detail: 24 * 60 * 60 * 1000, // 24h
} as const;

/** fetch 재시도 정책. */
export const RETRY = {
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 4000,
  timeoutMs: 15000,
} as const;

/** 페이지네이션 기본값. */
export const PAGINATION = {
  defaultPageNo: 1,
  defaultNumOfRows: 10,
  maxNumOfRows: 100,
} as const;

/** 응답 절단(컨텍스트 보호) 기본 길이. */
export const MAX_TEXT_FIELD = 1200;
