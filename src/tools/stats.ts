/**
 * 질병정보서비스 도구 — 질병명/코드 조회 + 4종 질병통계.
 *
 * 라이브 검증(2026-06-21):
 *  - getDissNameCodeList1: 질병명/코드 목록. 이름/코드 서버 필터 미지원 → 클라이언트 필터.
 *    필수: sickType=1, medTp=1. 필드: sickCd, sickNm, sickEngNm.
 *  - 통계 4종(getDissBy…Stats1): sickCd + year 필수. 공통 필드: ptntCnt(환자수),
 *    vstDdcnt(방문일수), rvdRpeTamtAmt(요양급여비총액), rvdInsupBrdnAmt(보험자부담금).
 *    구분 필드: 성별연령(sex/age), 입원외래(sex/inpatOpat), 종별(grade), 지역별(lcName).
 */

import { z } from "zod";
import {
  clientFilter,
  field,
  paginationShape,
  renderEnvelope,
} from "../schemas/common.js";
import { normalizeQuery, toApiParams } from "../normalizer/searchNormalizer.js";
import type { ApiEnvelope, ToolDefinition } from "../types.js";

/** 질병 마스터(약 2065건)는 서버 이름필터가 없어 전체를 받아 클라이언트 필터(캐시됨). */
const FETCH_ALL = 3000;

/** 통계 유형 → constants operation 키 + 그룹 라벨 필드. */
const STAT_OPERATION = {
  성별연령: { op: "statsGenderAge", groupFields: ["sex", "age"] },
  입원외래: { op: "statsInOut", groupFields: ["sex", "inpatOpat"] },
  종별: { op: "statsByClass", groupFields: ["grade"] },
  지역별: { op: "statsByArea", groupFields: ["lcName"] },
} as const;

type StatType = keyof typeof STAT_OPERATION;

const shape = {
  diseaseName: z
    .string()
    .optional()
    .describe("질병명 키워드 (예: '당뇨', '고혈압'). 조회 결과 내 부분일치 필터"),
  sickCode: z
    .string()
    .optional()
    .describe("질병분류코드(KCD, 예: 'I10'). 통계 조회 시 필수"),
  statType: z
    .enum(["조회만", "성별연령", "입원외래", "종별", "지역별"])
    .default("조회만")
    .describe("'조회만'=질병명/코드 목록. 나머지는 해당 질병통계(sickCode·year 필요)"),
  year: z
    .number()
    .int()
    .min(2010)
    .max(2025)
    .default(2023)
    .describe("통계 연도 (통계 조회 시 사용)"),
  ...paginationShape,
} as const;

const getDiseaseInfo: ToolDefinition<typeof shape> = {
  name: "kohealth_get_disease_stats",
  title: "질병 정보 / 통계 조회",
  description:
    "질병명·코드를 조회하거나(statType='조회만'), 특정 질병코드의 성별연령/입원외래/종별/지역별 진료통계(환자수·요양급여비)를 조회합니다. " +
    "출처: 건강보험심사평가원 질병정보서비스.",
  inputSchema: shape,
  exposed: true,
  async handler(args, { client }) {
    // 1) 조회만 — 질병명/코드 목록 (클라이언트 필터)
    if (args.statType === "조회만") {
      const env = await client.call(
        "stats",
        "diseaseSearch",
        toApiParams("stats", {
          sickType: 1,
          medTp: 1,
          numOfRows: args.diseaseName ? FETCH_ALL : args.numOfRows,
          pageNo: args.diseaseName ? 1 : args.pageNo,
        }),
        { cacheKind: "search" },
      );
      const filtered: ApiEnvelope = args.diseaseName
        ? {
            ...env,
            items: clientFilter(env.items, normalizeQuery(args.diseaseName), [
              "sickNm",
              "sickEngNm",
              "sickCd",
            ]).slice(0, args.numOfRows),
          }
        : env;
      return renderEnvelope(
        filtered,
        args.format,
        (it) =>
          `· ${field(it, "sickNm")} (${field(it, "sickCd")})` +
          (it.sickEngNm ? ` — ${field(it, "sickEngNm")}` : ""),
        {
          emptyMessage: args.diseaseName
            ? `'${args.diseaseName}' 와 일치하는 질병을 찾지 못했습니다.`
            : undefined,
        },
      );
    }

    // 2) 통계 — sickCode 필수
    if (!args.sickCode) {
      return {
        content: [
          {
            type: "text",
            text: `${args.statType} 통계에는 sickCode(질병코드)가 필요합니다. 먼저 statType='조회만' 으로 코드를 찾으세요.`,
          },
        ],
        isError: true,
      };
    }

    const { op, groupFields } = STAT_OPERATION[args.statType as StatType];
    const env = await client.call(
      "stats",
      op,
      toApiParams("stats", {
        sickType: 1,
        medTp: 1,
        sickCode: args.sickCode,
        year: args.year,
        numOfRows: args.numOfRows,
        pageNo: args.pageNo,
      }),
      { cacheKind: "search" },
    );

    return renderEnvelope(
      env,
      args.format,
      (it) => {
        const group = groupFields.map((f) => field(it, f)).join(" / ");
        return [
          `· ${group} — 환자수 ${field(it, "ptntCnt")}명, 방문 ${field(it, "vstDdcnt")}일`,
          `  요양급여비총액 ${field(it, "rvdRpeTamtAmt")}천원 (보험자부담 ${field(it, "rvdInsupBrdnAmt")}천원)`,
        ].join("\n");
      },
      {
        emptyMessage: `${args.year}년 ${args.sickCode} 의 ${args.statType} 통계가 없습니다. 코드/연도를 확인하세요.`,
      },
    );
  },
};

export const statsTools = [getDiseaseInfo];
