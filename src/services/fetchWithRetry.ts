/**
 * data.go.kr 호출용 재시도 래퍼.
 *
 * 흔한 함정 대응:
 *  - 빈 본문 / HTML 점검페이지(공공 API가 장애 시 HTML 을 200으로 돌려줌)
 *  - 일시적 5xx
 *  - 타임아웃
 * exponential backoff(+jitter) 로 maxAttempts 까지 재시도한다.
 */

import { RETRY } from "../constants.js";
import { HealthApiError } from "./errors.js";

export interface FetchResult {
  status: number;
  body: string;
  contentType: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 본문이 점검/에러 HTML 인지 추정 (JSON/XML API 인데 HTML 이 오면 비정상). */
function looksLikeMaintenanceHtml(body: string, contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes("application/json") || ct.includes("xml")) return false;
  const head = body.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

function backoffDelay(attempt: number): number {
  const exp = RETRY.baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(exp, RETRY.maxDelayMs);
  // full jitter
  return Math.random() * capped;
}

/** 재시도 가능한 응답 모양인지 판정. */
function isRetryable(res: FetchResult): boolean {
  if (res.status >= 500) return true;
  if (res.status === 429) return true;
  if (res.body.trim().length === 0) return true;
  if (looksLikeMaintenanceHtml(res.body, res.contentType)) return true;
  return false;
}

/**
 * URL 을 GET 하고, 재시도 정책을 적용해 본문 문자열을 돌려준다.
 * 파싱은 호출자가 담당(XML/JSON 모두 가능).
 */
export async function fetchWithRetry(url: string): Promise<FetchResult> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= RETRY.maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RETRY.timeoutMs);
    try {
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          // 일부 공공 API 가 Referer/UA 없는 호출을 막는 사례 대응
          Accept: "application/json, application/xml;q=0.9, */*;q=0.5",
          "User-Agent": "korea-health-mcp-server/0.1",
        },
      });
      const body = await resp.text();
      const result: FetchResult = {
        status: resp.status,
        body,
        contentType: resp.headers.get("content-type") ?? "",
      };

      if (!isRetryable(result)) return result;

      lastErr = new HealthApiError(
        `재시도 가능한 응답(status=${result.status}, 본문길이=${body.length})`,
      );
    } catch (err) {
      lastErr = err;
      // AbortError(타임아웃) 또는 네트워크 오류 → 재시도
    } finally {
      clearTimeout(timer);
    }

    if (attempt < RETRY.maxAttempts) {
      await sleep(backoffDelay(attempt));
    }
  }

  throw new HealthApiError(
    `data.go.kr 호출 실패 (재시도 ${RETRY.maxAttempts}회 소진)`,
    undefined,
    lastErr instanceof Error ? lastErr.message : String(lastErr),
  );
}
