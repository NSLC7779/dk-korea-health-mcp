/**
 * 비급여진료비정보 도구 (항목 검색 + 기관별 목록).
 *
 * 라이브 검증 결과:
 *  - 서버 필터: sidoCd(숫자코드), sgguCd, clCd 만 동작.
 *  - 비급여 항목명/병원명은 서버 필터 미지원 → 가져온 페이지 내 클라이언트 필터로 처리.
 *  - 응답 필드: npayKorNm(항목명), curAmt(금액), yadmNm(기관명), ykiho, sido/sgguCdNm.
 *    (기관별 목록 getNonPaymentItemHospList 는 itmCdNm/prcMin/prcMax 사용)
 */

import { z } from "zod";
import {
  clientFilter,
  field,
  paginationShape,
  renderEnvelope,
} from "../schemas/common.js";
import { normalizeRegion, toApiParams } from "../normalizer/searchNormalizer.js";
import type { ApiEnvelope, ToolDefinition } from "../types.js";

/** 항목 검색 시 클라이언트 필터용 스캔 행 수. */
const SCAN_ROWS = 100;
/** 병원명 매칭은 대상 모수가 커서 더 넓게 스캔(지역 지정 시 모수가 줄어 충분). */
const HOSP_SCAN_ROWS = 1000;

const searchShape = {
  itemKeyword: z
    .string()
    .optional()
    .describe(
      "비급여 항목 키워드 (예: 'MRI', '도수치료'). 서버 미지원이라 가져온 결과 내에서 부분일치 필터됨",
    ),
  region: z
    .string()
    .optional()
    .describe("지역명 또는 sidoCd 코드 (예: '서울'→110000으로 변환). 서버 필터 동작"),
  clCd: z
    .string()
    .optional()
    .describe("종별코드 (예: 종합병원 11, 병원 21). 서버 필터 동작"),
  ...paginationShape,
} as const;

const searchNonpayment: ToolDefinition<typeof searchShape> = {
  name: "kohealth_search_nonpayment",
  title: "비급여 항목 검색",
  description:
    "지역/종별로 비급여 진료 항목과 가격, 제공 의료기관을 조회합니다. itemKeyword 로 항목명을 추가 필터링합니다. " +
    "출처: 건강보험심사평가원 비급여진료비정보.",
  inputSchema: searchShape,
  exposed: true,
  async handler(args, { client }) {
    const useClientFilter = Boolean(args.itemKeyword);
    const env = await client.call(
      "nonpayment",
      "searchList",
      toApiParams("nonpayment", {
        sidoCd: args.region ? normalizeRegion(args.region) : undefined,
        clCd: args.clCd,
        pageNo: args.pageNo,
        numOfRows: useClientFilter ? SCAN_ROWS : args.numOfRows,
      }),
      { cacheKind: "search" },
    );

    const filtered: ApiEnvelope = useClientFilter
      ? {
          ...env,
          items: clientFilter(env.items, args.itemKeyword, [
            "npayKorNm",
            "yadmNpayCdNm",
          ]).slice(0, args.numOfRows),
        }
      : env;

    return renderEnvelope(
      filtered,
      args.format,
      (it) =>
        [
          `· ${field(it, "yadmNm", "(기관명 미상)")} (${field(it, "sidoCdNm")} ${field(it, "sgguCdNm", "")})`,
          `  항목: ${field(it, "npayKorNm")} / 비용: ${field(it, "curAmt", "-")}원`,
          `  기관식별(ykiho): ${field(it, "ykiho")}`,
        ].join("\n"),
      {
        emptyMessage: useClientFilter
          ? `'${args.itemKeyword}' 와 일치하는 비급여 항목을 현재 페이지(${SCAN_ROWS}건)에서 찾지 못했습니다. 지역/종별을 좁혀보세요.`
          : undefined,
      },
    );
  },
};

const byHospitalShape = {
  hospitalName: z
    .string()
    .describe("병원명 (부분일치). 서버 미지원이라 가져온 결과 내에서 필터됨"),
  region: z
    .string()
    .optional()
    .describe("지역명 또는 sidoCd 코드. 지정하면 검색 범위를 좁혀 정확도가 올라감"),
  ...paginationShape,
} as const;

const getHospitalNonpayment: ToolDefinition<typeof byHospitalShape> = {
  name: "kohealth_get_hospital_nonpayment",
  title: "특정 병원의 비급여 목록",
  description:
    "병원명으로 해당 의료기관이 운영하는 비급여 항목·가격을 조회합니다(기관별 목록). " +
    "ykiho 서버 필터가 없어 병원명+지역으로 좁혀 매칭합니다. 출처: 건강보험심사평가원 비급여진료비정보.",
  inputSchema: byHospitalShape,
  exposed: true,
  async handler(args, { client }) {
    const env = await client.call(
      "nonpayment",
      "hospitalDetail",
      toApiParams("nonpayment", {
        sidoCd: args.region ? normalizeRegion(args.region) : undefined,
        numOfRows: HOSP_SCAN_ROWS,
        pageNo: args.pageNo,
      }),
      { cacheKind: "search" },
    );

    const matched: ApiEnvelope = {
      ...env,
      items: clientFilter(env.items, args.hospitalName, ["yadmNm"]).slice(
        0,
        args.numOfRows,
      ),
    };

    return renderEnvelope(
      matched,
      args.format,
      (it) =>
        [
          `· ${field(it, "yadmNm")} — ${field(it, "itmCdNm")}`,
          `  가격: ${field(it, "prcMin", "-")}~${field(it, "prcMax", "-")}원` +
            (it.divCd1Nm ? ` / 구분: ${field(it, "divCd1Nm")}` : ""),
        ].join("\n"),
      {
        emptyMessage: `'${args.hospitalName}' 병원을 현재 범위에서 찾지 못했습니다. region 을 지정해 좁혀보세요.`,
      },
    );
  },
};

export const nonpaymentTools = [searchNonpayment, getHospitalNonpayment];
