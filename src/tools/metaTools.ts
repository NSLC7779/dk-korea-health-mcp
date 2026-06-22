/**
 * 메타 도구: discover_tools / execute_tool.
 *
 * 숨김(exposed:false) 도구가 늘어날 때, ListTools 를 작게 유지하면서도
 * 클라이언트가 도구를 발견·호출할 수 있게 하는 프록시.
 */

import { z } from "zod";
import { registry } from "./registry.js";
import type { ToolDefinition } from "../types.js";

const discoverShape = {
  includeExposed: z
    .boolean()
    .default(false)
    .describe("이미 직접 노출된 도구도 목록에 포함할지"),
} as const;

const discoverTools: ToolDefinition<typeof discoverShape> = {
  name: "discover_tools",
  title: "도구 발견",
  description:
    "등록된 모든 도구의 이름·설명·입력 스키마 요약을 반환합니다. 숨김 도구를 execute_tool 로 호출하기 전에 사용하세요.",
  inputSchema: discoverShape,
  exposed: true,
  async handler(args) {
    const list = registry
      .all()
      .filter((t) => args.includeExposed || !t.exposed)
      .filter((t) => t.name !== "discover_tools" && t.name !== "execute_tool")
      .map((t) => ({
        name: t.name,
        title: t.title,
        description: t.description,
        params: Object.keys(t.inputSchema),
      }));
    return {
      content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
    };
  },
};

const executeShape = {
  name: z.string().describe("호출할 도구 이름 (discover_tools 로 확인)"),
  args: z
    .record(z.unknown())
    .default({})
    .describe("도구에 전달할 인자 객체"),
} as const;

const executeTool: ToolDefinition<typeof executeShape> = {
  name: "execute_tool",
  title: "도구 실행 프록시",
  description: "이름과 인자로 등록된 도구(숨김 포함)를 호출합니다.",
  inputSchema: executeShape,
  exposed: true,
  async handler(args, ctx) {
    const target = registry.get(args.name);
    if (!target) {
      return {
        content: [{ type: "text", text: `알 수 없는 도구: ${args.name}` }],
        isError: true,
      };
    }
    // 대상 도구 스키마로 인자 검증
    const parsed = z.object(target.inputSchema).safeParse(args.args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `인자 검증 실패: ${parsed.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")}`,
          },
        ],
        isError: true,
      };
    }
    return target.handler(parsed.data, ctx);
  },
};

export const metaTools = [discoverTools, executeTool];
