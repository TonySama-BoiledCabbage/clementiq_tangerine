"use client";
import { useSession } from "./store";

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

function detailMessage(d: unknown): string {
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => (e?.loc ? `${e.loc.slice(1).join(".")}: ${e.msg}` : String(e))).join("; ");
  return "Request failed";
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { token, logout } = useSession.getState();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(0, "Cannot reach the ClementIQ API. Is the backend running on port 8000?");
  }
  if (res.status === 401 && token) logout();
  if (!res.ok) {
    let detail: unknown;
    try { detail = (await res.json()).detail; } catch { detail = res.statusText; }
    throw new ApiError(res.status, detailMessage(detail), detail);
  }
  return res.json() as Promise<T>;
}
