/** 공통 zod 스키마 + 응답 렌더링/절단 헬퍼. */

import { z } from "zod";
import { MAX_TEXT_FIELD, PAGINATION } from "../constants.js";
import type { ApiEnvelope, ToolResult } from "../types.js";

/** 모든 검색 도구가 공유하는 페이지네이션 + 출력포맷. */
export const paginationShape = {
  pageNo: z
    .number()
    .int()
    .min(1)
    .default(PAGINATION.defaultPageNo)
    .describe("페이지 번호 (1부터)"),
  numOfRows: z
    .number()
    .int()
    .min(1)
    .max(PAGINATION.maxNumOfRows)
    .default(PAGINATION.defaultNumOfRows)
    .describe(`페이지당 항목 수 (최대 ${PAGINATION.maxNumOfRows})`),
  format: z
    .enum(["text", "json"])
    .default("text")
    .describe("출력 형식. text=사람용 요약, json=원본 항목 배열"),
} as const;

export type PaginationArgs = z.objectOutputType<typeof paginationShape, z.ZodTypeAny>;

/** 긴 텍스트 필드를 컨텍스트 보호용으로 절단. */
export function truncate(value: unknown, max = MAX_TEXT_FIELD): string {
  const s = value === undefined || value === null ? "" : String(value);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… (${s.length - max}자 생략)`;
}

/** 텍스트 content 하나짜리 ToolResult. */
export function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: "text", text }], isError };
}

/**
 * 엔벨로프를 format 에 따라 렌더링.
 * @param renderItem text 모드에서 항목 1개를 한 줄~여러 줄 문자열로.
 */
export function renderEnvelope(
  env: ApiEnvelope,
  format: "text" | "json",
  renderItem: (item: Record<string, unknown>, idx: number) => string,
  opts: { emptyMessage?: string } = {},
): ToolResult {
  if (env.items.length === 0) {
    return textResult(opts.emptyMessage ?? "조건에 맞는 결과가 없습니다.");
  }

  if (format === "json") {
    return textResult(
      JSON.stringify(
        {
          totalCount: env.totalCount,
          pageNo: env.pageNo,
          numOfRows: env.numOfRows,
          items: env.items,
        },
        null,
        2,
      ),
    );
  }

  const header =
    env.totalCount !== undefined
      ? `총 ${env.totalCount}건 중 ${env.items.length}건 표시` +
        (env.pageNo ? ` (페이지 ${env.pageNo})` : "")
      : `${env.items.length}건`;

  const lines = env.items.map((it, i) => renderItem(it, i));
  return textResult([header, "", ...lines].join("\n"));
}

/**
 * 클라이언트측 부분일치 필터.
 * data.go.kr 이 서버 필터를 지원하지 않는 항목(비급여 항목명, DUR 성분명 등)을
 * 가져온 페이지 내에서 걸러낸다. 여러 후보 필드 중 하나라도 키워드를 포함하면 통과.
 */
export function clientFilter(
  items: Record<string, unknown>[],
  keyword: string | undefined,
  fields: string[],
): Record<string, unknown>[] {
  if (!keyword) return items;
  const kw = keyword.trim().toLowerCase();
  if (!kw) return items;
  return items.filter((it) =>
    fields.some((f) => String(it[f] ?? "").toLowerCase().includes(kw)),
  );
}

/** 항목에서 값을 안전하게 꺼낸다(없으면 fallback). */
export function field(
  item: Record<string, unknown>,
  key: string,
  fallback = "-",
): string {
  const v = item[key];
  if (v === undefined || v === null || v === "") return fallback;
  return String(v);
}
