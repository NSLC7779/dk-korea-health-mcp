/**
 * 병원정보 도구 (검색 + ykiho 상세).
 *
 * 비급여 도구가 돌려주는 ykiho 를 실제 병원명·주소·진료과목으로 연결한다.
 * 출처: 건강보험심사평가원 병원정보서비스 / 의료기관별상세정보서비스.
 */

import { z } from "zod";
import {
  field,
  paginationShape,
  renderEnvelope,
} from "../schemas/common.js";
import {
  normalizeQuery,
  normalizeRegion,
  toApiParams,
} from "../normalizer/searchNormalizer.js";
import type { ToolDefinition } from "../types.js";

const searchShape = {
  hospitalName: z.string().optional().describe("기관명 (예: '서울대학교병원')"),
  region: z
    .string()
    .optional()
    .describe("지역 약칭/시도명 (예: '서울'). 표준 시도명으로 정규화됨"),
  clCd: z
    .string()
    .optional()
    .describe(
      "종별코드 (예: 상급종합 11, 종합병원 21, 병원 28, 의원 31). 코드값은 활용가이드 참고",
    ),
  dgsbjtCd: z
    .string()
    .optional()
    .describe("진료과목코드 (예: 내과 01, 외과 04). 코드값은 활용가이드 참고"),
  ...paginationShape,
} as const;

const searchHospital: ToolDefinition<typeof searchShape> = {
  name: "kohealth_search_hospital",
  title: "병원 검색",
  description:
    "기관명/지역/종별/진료과목으로 병원을 검색해 기관식별번호(ykiho)·주소·전화·좌표를 반환합니다. " +
    "여기서 얻은 ykiho 를 비급여/상세 도구에 넘겨 연결할 수 있습니다. 출처: 심평원 병원정보서비스.",
  inputSchema: searchShape,
  exposed: true,
  async handler(args, { client }) {
    const env = await client.call(
      "hospital",
      "searchList",
      toApiParams("hospital", {
        hospitalName: args.hospitalName ? normalizeQuery(args.hospitalName) : undefined,
        sidoCd: args.region ? normalizeRegion(args.region) : undefined,
        clCd: args.clCd,
        dgsbjtCd: args.dgsbjtCd,
        pageNo: args.pageNo,
        numOfRows: args.numOfRows,
      }),
      { cacheKind: "search" },
    );
    return renderEnvelope(env, args.format, (it) =>
      [
        `· ${field(it, "yadmNm")} (${field(it, "clCdNm", "종별미상")})`,
        `  주소: ${field(it, "addr")} / 전화: ${field(it, "telno", "-")}`,
        `  기관식별(ykiho): ${field(it, "ykiho")}`,
      ].join("\n"),
    );
  },
};

const infoShape = {
  ykiho: z.string().describe("기관식별번호(ykiho). 병원 검색 결과의 ykiho"),
  category: z
    .enum(["진료과목", "의료장비", "시설"])
    .default("진료과목")
    .describe("조회할 상세 정보 유형"),
  ...paginationShape,
} as const;

const CATEGORY_OPERATION = {
  진료과목: "dgsbjt",
  의료장비: "equipment",
  시설: "facility",
} as const;

const getHospitalInfo: ToolDefinition<typeof infoShape> = {
  name: "kohealth_get_hospital_info",
  title: "병원 상세정보 조회",
  description:
    "기관식별번호(ykiho)로 진료과목별 전문의 수/의료장비/시설 등 상세정보를 조회합니다. " +
    "출처: 심평원 의료기관별상세정보서비스.",
  inputSchema: infoShape,
  exposed: true,
  async handler(args, { client }) {
    const operation = CATEGORY_OPERATION[args.category as keyof typeof CATEGORY_OPERATION];
    const env = await client.call(
      "hospitalDetail",
      operation,
      toApiParams("hospitalDetail", {
        ykiho: args.ykiho,
        pageNo: args.pageNo,
        numOfRows: args.numOfRows,
      }),
      { cacheKind: "detail" },
    );
    return renderEnvelope(
      env,
      args.format,
      (it) => {
        switch (args.category) {
          case "진료과목":
            return `· ${field(it, "dgsbjtCdNm")} — 전문의 ${field(it, "dgsbjtPrSdrCnt", "0")}명`;
          case "의료장비":
            return `· ${field(it, "oftCdNm")} — ${field(it, "oftCnt", "0")}대`;
          default: // 시설
            return `· ${JSON.stringify(it)}`;
        }
      },
      { emptyMessage: `해당 기관의 ${args.category} 정보가 없습니다.` },
    );
  },
};

export const hospitalTools = [searchHospital, getHospitalInfo];
