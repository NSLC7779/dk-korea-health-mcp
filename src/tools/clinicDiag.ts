/**
 * 병원진료정보조회서비스 도구.
 * 의원(clCd=31) ykiho 의 최근 1년 진료 상위 5개 국민관심질병명을 조회.
 * 출처: 건강보험심사평가원 병원진료정보조회서비스.
 */

import { z } from "zod";
import { field, renderEnvelope } from "../schemas/common.js";
import { toApiParams } from "../normalizer/searchNormalizer.js";
import type { ToolDefinition } from "../types.js";

const shape = {
  ykiho: z
    .string()
    .describe(
      "의원급(clCd=31) 암호화 요양기호. kohealth_search_hospital 에 clCd='31' 로 검색해 얻은 ykiho",
    ),
  format: z.enum(["text", "json"]).default("text").describe("출력 형식"),
} as const;

const getClinicTopDiseases: ToolDefinition<typeof shape> = {
  name: "kohealth_get_clinic_top_diseases",
  title: "의원 진료 상위 5개 질병",
  description:
    "의원(동네 병원)의 ykiho 로 최근 1년간 가장 많이 진료한 국민관심질병 상위 5개와 진료과목을 조회합니다. " +
    "출처: 건강보험심사평가원 병원진료정보조회서비스.",
  inputSchema: shape,
  exposed: true,
  async handler(args, { client }) {
    const env = await client.call(
      "clinicDiag",
      "top5",
      toApiParams("clinicDiag", { ykiho: args.ykiho, numOfRows: 1, pageNo: 1 }),
      { cacheKind: "detail" },
    );
    return renderEnvelope(
      env,
      args.format,
      (it) => {
        const diseases = [1, 2, 3, 4, 5]
          .map((n) => field(it, `mfrnIntrsIlnsCdNm${n}`, ""))
          .filter((s) => s && s !== "-");
        return [
          `· ${field(it, "yadmNm")} (${field(it, "shwSbjtCdNm", "진료과목 미상")}) — 기준 ${field(it, "crtrYm")}`,
          `  상위질병: ${diseases.length ? diseases.join(", ") : "없음"}`,
        ].join("\n");
      },
      {
        emptyMessage:
          "데이터가 없습니다. ykiho 가 의원급(clCd=31)인지 확인하세요. (병원/종합병원은 미지원)",
      },
    );
  },
};

export const clinicDiagTools = [getClinicTopDiseases];
