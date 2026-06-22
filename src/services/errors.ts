/**
 * data.go.kr 에러코드 → 행동 가능한 한국어 메시지.
 * 공통 OpenAPI_ServiceResponse 에러코드(00~99) 기준.
 */

/** 도메인 에러 — 도구 핸들러에서 잡아 isError 결과로 변환한다. */
export class HealthApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "HealthApiError";
  }

  /** 사용자에게 보여줄 한 덩어리 메시지. */
  toUserMessage(): string {
    const parts = [this.message];
    if (this.code) parts.push(`(코드 ${this.code})`);
    if (this.hint) parts.push(`\n→ ${this.hint}`);
    return parts.join(" ");
  }
}

/** data.go.kr 공통 결과코드 → 메시지/힌트. */
const CODE_TABLE: Record<string, { msg: string; hint?: string }> = {
  "00": { msg: "정상" },
  "01": {
    msg: "어플리케이션 에러",
    hint: "data.go.kr 서비스 측 일시 오류. 잠시 후 재시도하세요.",
  },
  "02": {
    msg: "데이터베이스 에러",
    hint: "data.go.kr 서비스 측 오류. 잠시 후 재시도하세요.",
  },
  "03": { msg: "데이터 없음", hint: "검색 조건에 맞는 결과가 없습니다." },
  "04": { msg: "HTTP 에러" },
  "05": { msg: "서비스 연결 실패", hint: "네트워크 또는 엔드포인트를 확인하세요." },
  "10": {
    msg: "잘못된 요청 파라미터",
    hint: "필터 파라미터명/값을 활용가이드와 대조하세요.",
  },
  "11": { msg: "필수 요청 파라미터 누락", hint: "필수 파라미터를 채우세요." },
  "12": {
    msg: "해당 오퍼레이션을 찾을 수 없음",
    hint: "constants.ts 의 오퍼레이션 세그먼트가 활용가이드와 일치하는지 확인하세요.",
  },
  "20": { msg: "서비스 접근 거부", hint: "해당 서비스 활용신청 승인 여부를 확인하세요." },
  "22": {
    msg: "서비스 요청제한 횟수 초과",
    hint: "일일 트래픽 한도를 초과했습니다. 내일 다시 시도하거나 한도 상향을 신청하세요.",
  },
  "30": {
    msg: "등록되지 않은 서비스키",
    hint: "DATA_GO_KR_SERVICE_KEY 값과 해당 서비스 활용신청을 확인하세요.",
  },
  "31": { msg: "활용기간 만료", hint: "data.go.kr 마이페이지에서 활용기간을 연장하세요." },
  "32": { msg: "등록되지 않은 IP", hint: "마이페이지에서 호출 IP를 등록하세요." },
  "33": { msg: "서명되지 않은 호출" },
  "99": { msg: "기타 에러" },
};

/** 결과코드로 HealthApiError 를 만든다. */
export function errorFromResultCode(
  code: string,
  rawMsg?: string,
): HealthApiError {
  const entry = CODE_TABLE[code];
  const msg = entry?.msg ?? rawMsg ?? "알 수 없는 오류";
  return new HealthApiError(msg, code, entry?.hint);
}

/**
 * 키 누락 등 호출 전 점검 실패용 헬퍼.
 * `KEY_IS_ENCODED` 관련 흔한 함정도 힌트로 안내한다.
 */
export function missingKeyError(): HealthApiError {
  return new HealthApiError(
    "data.go.kr 서비스키가 설정되지 않았습니다.",
    undefined,
    ".env 에 DATA_GO_KR_SERVICE_KEY 를 설정하세요. Encoding 키면 KEY_IS_ENCODED=true, Decoding 키면 false.",
  );
}
