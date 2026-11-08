"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "./api";
import { useSession } from "./store";

export interface MediaMeta { updated_at: string | null; width: number; height: number; source: string; version: string; transparent?: boolean }
export interface Profile {
  sub: string; role: string; account_id: number | null; display_name: string;
  photo: MediaMeta | null; avatar: MediaMeta | null;
  avatar_prefs: { generation_consent: boolean; consent_at: string | null; personalized_enabled: boolean };
  avatar_generation_available: boolean; image_model: string | null; max_upload_mb: number;
}

export function useProfile() {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile"), enabled: !!token, staleTime: 60_000 });
}

/** Images are private: fetched with the bearer token and shown through an object URL. */
export function useMediaUrl(kind: "photo" | "avatar", version: string | undefined | null) {
  const token = useSession((s) => s.token);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!version || !token) { setUrl(null); return; }
    let revoked = false;
    let objectUrl: string | null = null;
    fetch(`/api/profile/${kind}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!b || revoked) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => { revoked = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [kind, version, token]);
  return url;
}

export function useUploadPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const { token } = useSession.getState();
      const res = await fetch("/api/profile/photo", { method: "PUT", body: file, headers: { "Content-Type": file.type, Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        let detail = res.statusText;
        try { detail = (await res.json()).detail; } catch { /* non-JSON */ }
        throw new ApiError(res.status, detail);
      }
      return res.json() as Promise<{ ok: boolean; avatar_outdated: boolean }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}

export function useProfileAction<T = unknown>(path: string, method: "POST" | "DELETE", json?: unknown) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: unknown) => api<T>(path, { method, json: body ?? json }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profile"] }); qc.invalidateQueries({ queryKey: ["settings"] }); },
  });
}

export function initials(name: string | undefined | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
