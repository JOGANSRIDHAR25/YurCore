/**
 * AI Chat controller — proxies requests to the Python Flask backend.
 */
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { serverEnv } from "@/shared/config/env";

const FLASK_URL = serverEnv.FLASK_URL || "http://127.0.0.1:5001";

// Helper function to check if the Python Flask server is running and get status
async function getFlaskStatus() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    const res = await fetch(`${FLASK_URL}/status`, {
      method: "GET",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // Return null to signify server is down/not running
  }
  return null;
}

let lastSpawnTime = 0;
const SPAWN_COOLDOWN_MS = 15000;

// Helper function to auto-start the Python server in the background
function startPythonServer() {
  const now = Date.now();
  if (now - lastSpawnTime < SPAWN_COOLDOWN_MS) {
    return;
  }
  lastSpawnTime = now;

  try {
    const scriptPath = path.join(process.cwd(), "scripts", "ayurparam_server.py");
    console.log(`Starting AyurParam background service: python3.11 ${scriptPath}`);

    const child = spawn("python3.11", [scriptPath], {
      detached: true,
      stdio: "ignore",
    });

    child.unref();
  } catch (err) {
    console.error("Failed to spawn Python process:", err);
  }
}

/**
 * GET /api/ai-chat — Check AI backend status.
 */
export async function getStatus() {
  const status = await getFlaskStatus();

  if (!status) {
    startPythonServer();
    return NextResponse.json({
      loaded: false,
      message: "Starting Python backend service...",
      progress: 0,
      error: null,
    });
  }

  return NextResponse.json(status);
}

/**
 * POST /api/ai-chat — Handle load/chat actions.
 */
export async function handleAction(req: NextRequest) {
  const body = await req.json();
  const { action, message, role } = body;

  if (action === "load") {
    const status = await getFlaskStatus();
    if (!status) {
      startPythonServer();
      return NextResponse.json({
        loaded: false,
        message: "Starting Python backend service...",
        progress: 5,
        error: null,
      });
    }

    try {
      const res = await fetch(`${FLASK_URL}/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const loadStatus = await res.json();
        return NextResponse.json(loadStatus.state || loadStatus);
      }
    } catch (err: any) {
      return NextResponse.json({
        loaded: false,
        message: "Failed to trigger load on backend.",
        progress: 0,
        error: err.message,
      });
    }
  }

  if (action === "chat") {
    if (!message || !message.trim()) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 });
    }

    const status = await getFlaskStatus();
    if (!status) {
      return NextResponse.json({ error: "Backend AI service is offline. Please initialize first." }, { status: 503 });
    }

    if (!status.loaded) {
      return NextResponse.json({ error: "Model is still loading. Please wait." }, { status: 400 });
    }

    try {
      const res = await fetch(`${FLASK_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, role: role || "patient" }),
      });

      if (res.ok) {
        const chatResult = await res.json();
        return NextResponse.json(chatResult);
      } else {
        const errRes = await res.json();
        return NextResponse.json({ error: errRes.error || "Failed generating response from model." }, { status: res.status });
      }
    } catch (err: any) {
      return NextResponse.json({ error: `Backend service communication failure: ${err.message}` }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
