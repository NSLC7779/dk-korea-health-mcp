/**
 * 도구 레지스트리.
 *
 * korea-law 의 "구현 N개 / 노출 소수" 패턴:
 *  - 모든 도구를 한 곳에 등록.
 *  - `exposed: true` 인 것만 ListTools 에 직접 노출.
 *  - 나머지는 meta-tools(discover_tools/execute_tool) 로 호출.
 * 지금은 5개 전부 exposed 지만, 도구가 늘어도 컨텍스트를 작게 유지할 구조를 미리 갖춘다.
 */

import type { ToolDefinition } from "../types.js";
import { nonpaymentTools } from "./nonpayment.js";
import { drugTools } from "./drug.js";
import { durTools } from "./dur.js";
import { statsTools } from "./stats.js";
import { hospitalTools } from "./hospital.js";
import { clinicDiagTools } from "./clinicDiag.js";
import { drugUsageTools } from "./drugUsage.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_TOOLS: ToolDefinition<any>[] = [
  ...nonpaymentTools,
  ...hospitalTools,
  ...clinicDiagTools,
  ...drugTools,
  ...durTools,
  ...statsTools,
  ...drugUsageTools, // hidden (exposed:false)
];

export class ToolRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private byName = new Map<string, ToolDefinition<any>>();

  constructor() {
    for (const t of ALL_TOOLS) {
      if (this.byName.has(t.name)) {
        throw new Error(`중복 도구명: ${t.name}`);
      }
      this.byName.set(t.name, t);
    }
  }

  /** ListTools 에 직접 노출할 도구. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exposed(): ToolDefinition<any>[] {
    return [...this.byName.values()].filter((t) => t.exposed);
  }

  /** 전체(노출 + 숨김). discover_tools 용. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all(): ToolDefinition<any>[] {
    return [...this.byName.values()];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(name: string): ToolDefinition<any> | undefined {
    return this.byName.get(name);
  }
}

export const registry = new ToolRegistry();
