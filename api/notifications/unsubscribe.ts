import {
  isNodeResponse,
  sendNodeResponse,
  toWebRequest,
} from "../../src/server/httpAdapter.js";
import { getSupabaseAdminClient } from "../../src/server/supabaseAdmin.js";
import { verifyUnsubscribeToken } from "../../src/server/unsubscribeToken.js";

const CONFIRM_FORM =
  '<form method="post"><button type="submit" style="font-size:16px;padding:10px 18px;border:0;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer;">Unsubscribe</button></form>';

function htmlResponse(message: string, status = 200, extra = ""): Response {
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resume Maker reminders</title></head><body style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;color:#0f172a;"><p style="font-size:18px;">${message}</p>${extra}</body></html>`;
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function handleRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== "GET" && request.method !== "POST") {
      return htmlResponse("Method not allowed.", 405);
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get("u") || "";
    const token = url.searchParams.get("t") || "";

    if (!verifyUnsubscribeToken(userId, token)) {
      return htmlResponse("This unsubscribe link is not valid.", 400);
    }

    // Mail scanners open links in emails, so a GET only asks; the button (or
    // the mail client's one-click List-Unsubscribe POST) does the change.
    if (request.method === "GET") {
      return htmlResponse(
        "Stop daily reminder emails from Resume Maker?",
        200,
        CONFIRM_FORM,
      );
    }

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return htmlResponse("Unsubscribe is not available right now.", 500);
    }

    const { error } = await supabase
      .from("app_user_notifications")
      .update({
        reminder_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) {
      console.error("Unsubscribe update failed:", error);
      return htmlResponse(
        "Something went wrong. Please try again in a moment.",
        500,
      );
    }

    return htmlResponse("You're unsubscribed from Resume Maker reminders.");
  } catch (error) {
    console.error("Unsubscribe failed:", error);
    return htmlResponse("Something went wrong. Please try again.", 500);
  }
}

export default async function handler(
  requestOrNodeReq: Request | Record<string, unknown>,
  maybeNodeRes?: unknown,
): Promise<Response | void> {
  const request = toWebRequest(requestOrNodeReq);
  const response = await handleRequest(request);

  if (isNodeResponse(maybeNodeRes)) {
    await sendNodeResponse(maybeNodeRes, response);
    return;
  }

  return response;
}
