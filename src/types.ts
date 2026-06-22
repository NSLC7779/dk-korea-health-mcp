/** 공통 타입. */

import type { z } from "zod";

/** 정규화된 data.go.kr 응답 엔벨로프. */
export interface ApiEnvelope<T = Record<string, unknown>> {
  /** 결과 코드 ("00" = 정상). */
  resultCode: string;
  /** 결과 메시지. */
  resultMsg: string;
  /** items.item 을 항상 배열로 정규화. */
  items: T[];
  /** 페이지네이션 메타 (없으면 undefined). */
  pageNo?: number;
  numOfRows?: number;
  totalCount?: number;
}

/** 도구 핸들러가 받는 인자 — 검증된 zod 출력 + 클라이언트 주입. */
export interface ToolContext {
  client: import("./services/dataGoKr.js").DataGoKrClient;
}

/** MCP 텍스트 결과 모양 (SDK content block). */
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  /** SDK CallToolResult 와의 구조적 호환을 위한 인덱스 시그니처. */
  [x: string]: unknown;
}

/** registry 에 등록되는 도구 정의. */
export interface ToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  /** zod raw shape (registerTool inputSchema 로 그대로 전달). */
  inputSchema: Shape;
  /** 노출 여부. false 면 meta-tools(execute_tool) 로만 호출 가능. */
  exposed: boolean;
  handler: (
    args: z.objectOutputType<Shape, z.ZodTypeAny>,
    ctx: ToolContext,
  ) => Promise<ToolResult>;
}
