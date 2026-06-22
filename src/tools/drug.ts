/** 의약품 개요(e약은요) 검색 도구. */

import { z } from "zod";
import {
  field,
  paginationShape,
  renderEnvelope,
  truncate,
} from "../schemas/common.js";
import { normalizeQuery, toApiParams } from "../normalizer/searchNormalizer.js";
import type { ToolDefinition } from "../types.js";

const shape = {
  itemName: z.string().optional().describe("제품명 (예: '타이레놀정500밀리그람')"),
  entpName: z.string().optional().describe("업체명 (예: '한국얀센')"),
  efcyQuery: z.string().optional().describe("효능 키워드 (예: '두통', '해열')"),
  ...paginationShape,
} as const;

const searchDrug: ToolDefinition<typeof shape> = {
  name: "kohealth_search_drug",
  title: "의약품 효능·용법·주의·부작용 검색",
  description:
    "제품명/업체명/효능 키워드로 일반인용 의약품 정보(효능, 사용법, 주의사항, 부작용, 보관법)를 검색합니다. " +
    "출처: 식품의약품안전처 e약은요.",
  inputSchema: shape,
  exposed: true,
  async handler(args, { client }) {
    const env = await client.call(
      "drug",
      "search",
      toApiParams("drug", {
        itemName: args.itemName ? normalizeQuery(args.itemName) : undefined,
        entpName: args.entpName,
        efcyQesitm: args.efcyQuery,
        pageNo: args.pageNo,
        numOfRows: args.numOfRows,
      }),
      { cacheKind: "search" },
    );
    return renderEnvelope(env, args.format, (it) =>
      [
        `· ${field(it, "itemName")} (${field(it, "entpName", "업체미상")})`,
        `  효능: ${truncate(it.efcyQesitm, 300)}`,
        `  사용법: ${truncate(it.useMethodQesitm, 300)}`,
        `  주의: ${truncate(it.atpnQesitm, 300)}`,
        `  부작용: ${truncate(it.seQesitm, 200)}`,
      ].join("\n"),
    );
  },
};

export const drugTools = [searchDrug];
