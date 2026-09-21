import { connection } from "next/server";
import { interpret } from "@/lib/assistant/interpret";
import { MissingAnswerError } from "@/lib/assistant/jev";
import {
  type AssistantResponse,
  type AssistantStatus,
  assistantRequestSchema,
} from "@/lib/assistant/protocol";
import { lookupNode, nodeDefinitions } from "@/lib/nodes/registry";
import { createJevAsk, isServiceError, isTimeout } from "./jev-client";

/**
 * The assistant's one server route, and the app's only one (ADR 0014).
 *
 * It exists because the TypeSafe key must never reach the browser. It turns a
 * message into a *plan* and nothing more: it reads no storage, holds no
 * state, and never sees a whole document — only the element list the chat
 * chose to send. Every failure is an answer the chat can show, so the editor
 * behaves the same with this route down, unconfigured, or unreachable.
 */

function apiKey(): string | null {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  return key ? key : null;
}

/** Whether the assistant can work at all, so the chat can say so up front. */
export async function GET() {
  // Read per request, not baked in at build: the key is deployment config.
  await connection();
  return Response.json({
    available: apiKey() !== null,
  } satisfies AssistantStatus);
}

export async function POST(request: Request) {
  const key = apiKey();
  if (!key) {
    return reply(503, {
      ok: false,
      error: "unconfigured",
      message: "The assistant is not set up on this server.",
    });
  }

  const body = assistantRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return reply(400, {
      ok: false,
      error: "bad-request",
      message: "That request could not be read.",
    });
  }

  try {
    const result = await interpret(body.data, {
      ask: createJevAsk(
        key,
        process.env.TYPESAFE_MODEL?.trim() || "jev-latest",
      ),
      definitions: nodeDefinitions,
      lookup: lookupNode,
    });
    return reply(200, { ok: true, ...result });
  } catch (error) {
    if (isTimeout(error)) {
      return reply(504, {
        ok: false,
        error: "timeout",
        message: "Jev took too long to answer. Try again.",
      });
    }
    if (isServiceError(error) || error instanceof MissingAnswerError) {
      console.error(
        "[assistant]",
        error instanceof Error ? error.message : error,
      );
      return reply(502, {
        ok: false,
        error: "upstream",
        message: "Jev could not be reached just now. Try again in a moment.",
      });
    }
    throw error;
  }
}

function reply(status: number, body: AssistantResponse): Response {
  return Response.json(body, { status });
}
