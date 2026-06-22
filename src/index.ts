#!/usr/bin/env node
/**
 * korea-health-mcp-server 부트스트랩.
 *
 * 트랜스포트 선택:
 *  - TRANSPORT=stdio (기본) : Claude Desktop 등 로컬 MCP 클라이언트
 *  - TRANSPORT=http         : 원격 배포(확장 지점, 아래 runHttp 참고)
 */

import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// .env 를 cwd 가 아니라 프로젝트 루트(dist 의 상위)에서 로드.
// → Claude Desktop 이 임의 cwd 로 실행해도 키를 찾는다(config 에 키 노출 불필요).
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DataGoKrClient } from "./services/dataGoKr.js";
import { HealthApiError } from "./services/errors.js";
import { registry } from "./tools/registry.js";
import { metaTools } from "./tools/metaTools.js";
import type { ToolContext, ToolDefinition } from "./types.js";

const SERVER_INFO = { name: "korea-health", version: "0.1.0" } as const;

function buildServer(ctx: ToolContext): McpServer {
  const server = new McpServer(SERVER_INFO);

  // 노출 도메인 도구 + 메타 도구 등록
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toRegister: ToolDefinition<any>[] = [
    ...registry.exposed(),
    ...metaTools,
  ];

  for (const tool of toRegister) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      // 핸들러 래퍼: 도메인 에러를 isError 결과로 변환
      async (args: Record<string, unknown>) => {
        try {
          return await tool.handler(args, ctx);
        } catch (err) {
          const message =
            err instanceof HealthApiError
              ? err.toUserMessage()
              : err instanceof Error
                ? err.message
                : String(err);
          return {
            content: [{ type: "text" as const, text: `오류: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}

async function runStdio(ctx: ToolContext): Promise<void> {
  const server = buildServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio 모드에서는 stdout 을 프로토콜이 점유하므로 로그는 stderr 로만.
  console.error("[korea-health] stdio 트랜스포트로 실행 중");
}

/**
 * 원격(HTTP) 트랜스포트. Streamable HTTP(스테이트리스):
 * 요청마다 새 서버+트랜스포트를 만들어 처리하므로 세션 상태가 없어 수평 확장에 유리.
 * 도구 코드(buildServer)는 stdio 와 100% 공유된다.
 */
async function runHttp(ctx: ToolContext): Promise<void> {
  const { default: express } = await import("express");
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );

  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const server = buildServer(ctx);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // 스테이트리스
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[korea-health] HTTP 처리 오류:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // 스테이트리스 모드에선 GET/DELETE(서버→클라 스트림, 세션 종료) 미지원
  const methodNotAllowed = (_req: unknown, res: import("express").Response) =>
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  // 헬스체크
  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.error(`[korea-health] HTTP 트랜스포트: http://localhost:${port}/mcp`);
  });
}

async function main(): Promise<void> {
  const client = DataGoKrClient.fromEnv();
  if (!client.hasKey()) {
    console.error(
      "[korea-health] 경고: DATA_GO_KR_SERVICE_KEY 미설정. 도구 호출 시 에러를 반환합니다.",
    );
  }
  const ctx: ToolContext = { client };

  const transport = (process.env.TRANSPORT ?? "stdio").toLowerCase();
  if (transport === "http") {
    await runHttp(ctx);
  } else {
    await runStdio(ctx);
  }
}

main().catch((err) => {
  console.error("[korea-health] 치명적 오류:", err);
  process.exit(1);
});
