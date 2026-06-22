/**
 * 의약품사용정보조회서비스 도구 (HIDDEN).
 *
 * 급여의약품 사용량을 분류(약효분류군/ATC/성분) × 분해(지역/종별/상병)로 조회.
 * 요청 파라미터(진료년월, 약효분류코드/ATC코드/성분코드 등)와 코드값은
 * 활용가이드 문서에 정의돼 있어 라이브 probe 로 자동확정이 어렵다.
 * → exposed:false 로 두고 `params`(extra params) 로 정확한 요청변수를 그대로 넘긴다.
 *   discover_tools 로 발견 후 execute_tool 로 호출.
 */

import { z } from "zod";
import { renderEnvelope } from "../schemas/common.js";
import type { ServiceKey } from "../constants.js";
import type { ToolDefinition } from "../types.js";

const CLASSIFY = {
  약효분류군: "meft",
  ATC3: "atc3",
  ATC4: "atc4",
  성분: "cmpn",
} as const;

const BREAKDOWN = {
  지역별: "Area",
  종별: "Cl",
  상병별: "Sick",
} as const;

const shape = {
  classify: z
    .enum(["약효분류군", "ATC3", "ATC4", "성분"])
    .describe("분류 기준"),
  breakdown: z
    .enum(["지역별", "종별", "상병별"])
    .describe("분해 기준"),
  params: z
    .record(z.string())
    .default({})
    .describe(
      "활용가이드의 정확한 요청변수. 예: { 진료년월, 약효분류코드/ATC코드/성분코드, 시도코드 }. 빈 객체면 0건 반환.",
    ),
  numOfRows: z.number().int().min(1).max(100).default(10),
  pageNo: z.number().int().min(1).default(1),
  format: z.enum(["text", "json"]).default("json"),
} as const;

const getDrugUsage: ToolDefinition<typeof shape> = {
  name: "kohealth_get_drug_usage",
  title: "급여의약품 사용량 통계 (코드 기반)",
  description:
    "급여의약품 사용량을 약효분류군/ATC/성분 × 지역/종별/상병별로 조회합니다. " +
    "정확한 요청변수·코드값은 data.go.kr 활용가이드(의약품사용정보조회서비스)를 참고해 params 로 전달하세요. " +
    "출처: 건강보험심사평가원 의약품사용정보조회서비스.",
  inputSchema: shape,
  exposed: false, // discover_tools/execute_tool 로만 호출
  async handler(args, { client }) {
    const operation =
      CLASSIFY[args.classify as keyof typeof CLASSIFY] +
      BREAKDOWN[args.breakdown as keyof typeof BREAKDOWN];
    const env = await client.call(
      "drugUsage" as ServiceKey,
      operation,
      { ...args.params, numOfRows: args.numOfRows, pageNo: args.pageNo },
      { cacheKind: "search" },
    );
    return renderEnvelope(
      env,
      args.format,
      (it) => `· ${JSON.stringify(it)}`,
      {
        emptyMessage:
          "0건. params 에 활용가이드 기준 정확한 요청변수(진료년월·분류코드 등)를 넣으세요.",
      },
    );
  },
};

export const drugUsageTools = [getDrugUsage];
