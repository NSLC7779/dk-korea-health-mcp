/**
 * data.go.kr API 클라이언트.
 *
 * 책임:
 *  - 서비스키 처리 (Encoding/Decoding 키 양쪽 지원)
 *  - URL 조립 (서비스 path + 오퍼레이션 + 쿼리)
 *  - fetchWithRetry 로 호출
 *  - XML / JSON 응답을 ApiEnvelope 로 정규화 (items 는 항상 배열)
 *  - 에러코드 → HealthApiError
 *  - TTL 캐시
 *
 * 파싱/재시도/캐시는 각각 별 모듈로 분리(korean-law 의 책임 분리 패턴 차용).
 */

import { XMLParser } from "fast-xml-parser";
import {
  API_BASE,
  CACHE_TTL,
  SERVICES,
  type ServiceKey,
} from "../constants.js";
import type { ApiEnvelope } from "../types.js";
import { TtlCache } from "./cache.js";
import {
  HealthApiError,
  errorFromResultCode,
  missingKeyError,
} from "./errors.js";
import { fetchWithRetry } from "./fetchWithRetry.js";

export interface ClientConfig {
  /** data.go.kr 서비스키. */
  serviceKey: string;
  /** Encoding 키면 true(이미 URL 인코딩됨), Decoding 키면 false. */
  keyIsEncoded: boolean;
}

export interface CallOptions {
  /** 캐시 종류. detail = 24h, search = 1h (기본). */
  cacheKind?: keyof typeof CACHE_TTL;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  // 값을 문자열로 유지한다. true 면 "00"→0 처럼 강제 숫자화돼
  // resultCode("00") 와 코드성 필드가 깨진다. (렌더 시 어차피 String() 처리)
  parseTagValue: false,
  trimValues: true,
});

/** items.item 을 항상 배열로. (단건이면 객체, 0건이면 undefined 로 오는 API 특성 흡수) */
function toArray(item: unknown): Record<string, unknown>[] {
  if (item === undefined || item === null || item === "") return [];
  if (Array.isArray(item)) return item as Record<string, unknown>[];
  return [item as Record<string, unknown>];
}

export class DataGoKrClient {
  private cache = new TtlCache<ApiEnvelope>();

  constructor(private readonly config: ClientConfig) {}

  /** env 에서 설정을 읽어 클라이언트를 만든다. 키가 없으면 keyless 모드(호출 시 에러). */
  static fromEnv(): DataGoKrClient {
    return new DataGoKrClient({
      serviceKey: process.env.DATA_GO_KR_SERVICE_KEY ?? "",
      keyIsEncoded: (process.env.KEY_IS_ENCODED ?? "true").toLowerCase() === "true",
    });
  }

  hasKey(): boolean {
    return this.config.serviceKey.trim().length > 0;
  }

  /**
   * 서비스/오퍼레이션 호출.
   * @param service SERVICES 키
   * @param operationName SERVICES[service].operations 의 키
   * @param params 필터 파라미터 (값이 undefined/'' 면 제외)
   */
  async call(
    service: ServiceKey,
    operationName: string,
    params: Record<string, string | number | undefined> = {},
    opts: CallOptions = {},
  ): Promise<ApiEnvelope> {
    if (!this.hasKey()) throw missingKeyError();

    const spec = SERVICES[service];
    const operations = spec.operations as Record<string, string | null>;
    const segment = operations[operationName];
    if (!segment) {
      throw new HealthApiError(
        `오퍼레이션 '${operationName}' 이(가) ${spec.label} 에 정의되어 있지 않거나 미확정(TODO)입니다.`,
        undefined,
        "constants.ts 의 operations 를 활용가이드로 확정하세요.",
      );
    }

    const url = this.buildUrl(service, segment, params);
    const cacheKind = opts.cacheKind ?? "search";
    const cacheKey = url;

    return this.cache.getOrSet(cacheKey, CACHE_TTL[cacheKind], async () => {
      const res = await fetchWithRetry(url);
      return this.parseEnvelope(res.body);
    });
  }

  /** URL 조립. 서비스키는 인코딩 정책에 따라 그대로/encodeURIComponent. */
  private buildUrl(
    service: ServiceKey,
    segment: string,
    params: Record<string, string | number | undefined>,
  ): string {
    const spec = SERVICES[service];
    const base = `${API_BASE}${spec.path}/${segment}`;

    // 서비스키: Encoding 키는 이미 % 인코딩되어 있으므로 다시 인코딩하지 않는다.
    const keyParam = this.config.keyIsEncoded
      ? this.config.serviceKey
      : encodeURIComponent(this.config.serviceKey);

    const query: string[] = [`serviceKey=${keyParam}`, "_type=json"];
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === "") continue;
      query.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return `${base}?${query.join("&")}`;
  }

  /** XML 또는 JSON 응답을 ApiEnvelope 로 정규화. */
  private parseEnvelope(body: string): ApiEnvelope {
    const trimmed = body.trim();
    let root: unknown;

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        root = JSON.parse(trimmed);
      } catch {
        throw new HealthApiError("JSON 응답 파싱 실패", undefined, trimmed.slice(0, 200));
      }
    } else {
      // XML (또는 _type=json 미지원 서비스가 XML 을 돌려준 경우)
      root = xmlParser.parse(trimmed);
    }

    // data.go.kr 공통 엔벨로프: response.header / response.body
    const response = (root as Record<string, unknown>)?.response as
      | Record<string, unknown>
      | undefined;

    // OpenAPI_ServiceResponse: 키/트래픽 류 에러는 response 없이 별도 엔벨로프로 옴
    if (!response) {
      const altErr = (root as Record<string, unknown>)?.OpenAPI_ServiceResponse as
        | Record<string, unknown>
        | undefined;
      if (altErr) {
        const h = (altErr.cmmMsgHeader ?? {}) as Record<string, unknown>;
        const code = String(h.returnReasonCode ?? "99");
        throw errorFromResultCode(code, String(h.returnAuthMsg ?? ""));
      }
      throw new HealthApiError(
        "예상치 못한 응답 형식 (response 엔벨로프 없음)",
        undefined,
        trimmed.slice(0, 200),
      );
    }

    const header = (response.header ?? {}) as Record<string, unknown>;
    const resultCode = String(header.resultCode ?? "99");
    const resultMsg = String(header.resultMsg ?? "");

    // "03" = 데이터 없음 → 에러 아님, 빈 결과로 취급
    if (resultCode !== "00" && resultCode !== "03") {
      throw errorFromResultCode(resultCode, resultMsg);
    }

    const bodyNode = (response.body ?? {}) as Record<string, unknown>;
    const itemsNode = (bodyNode.items ?? {}) as Record<string, unknown> | "" | null;
    const rawItem =
      itemsNode && typeof itemsNode === "object"
        ? (itemsNode as Record<string, unknown>).item
        : undefined;

    return {
      resultCode,
      resultMsg,
      items: toArray(rawItem),
      pageNo: numOrUndef(bodyNode.pageNo),
      numOfRows: numOrUndef(bodyNode.numOfRows),
      totalCount: numOrUndef(bodyNode.totalCount),
    };
  }
}

function numOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
