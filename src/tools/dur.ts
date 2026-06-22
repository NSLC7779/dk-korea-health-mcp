/**
 * 의약품 DUR 안전정보 도구 (병용/연령/임부/노인/효능중복).
 *
 * 라이브 검증:
 *  - 서버 필터: itemName(제품명) 동작. 성분명은 서버 필터 미동작 → 클라이언트 필터.
 *  - 응답 필드는 대문자_언더스코어: TYPE_NAME, ITEM_NAME, INGR_KOR_NAME, PROHBT_CONTENT,
 *    병용 상대 약물은 MIXTURE_ITEM_NAME / MIXTURE_INGR_KOR_NAME.
 */

import { z } from "zod";
import {
  clientFilter,
  field,
  paginationShape,
  renderEnvelope,
  truncate,
} from "../schemas/common.js";
import { normalizeQuery, toApiParams } from "../normalizer/searchNormalizer.js";
import type { ApiEnvelope, ToolDefinition } from "../types.js";

/** DUR 카테고리 → constants 의 operation 키. */
const CATEGORY_OPERATION = {
  병용금기: "usjntTaboo",
  연령금기: "ageTaboo",
  임부금기: "pregnancyTaboo",
  노인주의: "elderlyCaution",
  효능군중복: "effectOverlap",
} as const;

type Category = keyof typeof CATEGORY_OPERATION;

const SCAN_ROWS = 100;

const shape = {
  category: z
    .enum(["병용금기", "연령금기", "임부금기", "노인주의", "효능군중복"])
    .describe("DUR 안전정보 유형"),
  itemName: z.string().optional().describe("제품명 (서버 필터 동작)"),
  ingredient: z
    .string()
    .optional()
    .describe("성분명 (예: '아세트아미노펜'). 서버 미지원이라 가져온 결과 내 부분일치 필터"),
  ...paginationShape,
} as const;

const getDrugDur: ToolDefinition<typeof shape> = {
  name: "kohealth_get_drug_dur",
  title: "의약품 DUR 안전정보 조회",
  description:
    "병용금기/연령금기/임부금기/노인주의/효능군중복 DUR 안전정보를 제품명(서버 필터) 또는 성분명(클라이언트 필터)으로 조회합니다. " +
    "출처: 식품의약품안전처 DUR 품목정보.",
  inputSchema: shape,
  exposed: true,
  async handler(args, { client }) {
    if (!args.itemName && !args.ingredient) {
      return {
        content: [
          { type: "text", text: "itemName 또는 ingredient 중 하나는 필요합니다." },
        ],
        isError: true,
      };
    }
    const operation = CATEGORY_OPERATION[args.category as Category];
    const useClientFilter = Boolean(args.ingredient);
    const env = await client.call(
      "dur",
      operation,
      toApiParams("dur", {
        itemName: args.itemName ? normalizeQuery(args.itemName) : undefined,
        numOfRows: useClientFilter ? SCAN_ROWS : args.numOfRows,
        pageNo: args.pageNo,
      }),
      { cacheKind: "detail" },
    );

    const filtered: ApiEnvelope = useClientFilter
      ? {
          ...env,
          items: clientFilter(env.items, args.ingredient, [
            "INGR_KOR_NAME",
            "MIXTURE_INGR_KOR_NAME",
          ]).slice(0, args.numOfRows),
        }
      : env;

    return renderEnvelope(
      filtered,
      args.format,
      (it) => {
        const subject = `${field(it, "ITEM_NAME", field(it, "INGR_KOR_NAME", "-"))}`;
        const counterpart = it.MIXTURE_ITEM_NAME
          ? ` ↔ ${field(it, "MIXTURE_ITEM_NAME")} (${field(it, "MIXTURE_INGR_KOR_NAME", "-")})`
          : "";
        return [
          `· [${args.category}] ${subject}${counterpart}`,
          `  사유: ${truncate(it.PROHBT_CONTENT, 300)}`,
        ].join("\n");
      },
      { emptyMessage: `해당 조건의 ${args.category} 정보가 없습니다.` },
    );
  },
};

export const durTools = [getDrugDur];
