"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Alert } from "@clementiq/shared-types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { useAlerts, useMarkAlert, useSettings } from "@/lib/hooks";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/controls";
import { SeverityBadge } from "./SeverityBadge";

export function NotificationCenter({ className }: { className?: string }) {
  const { data } = useAlerts({ limit: 8 });
  const settings = useSettings();
  const mark = useMarkAlert();
  const qc = useQueryClient();
  const seen = useRef<Set<number>>(new Set());

  // Optional browser notifications: only after explicit opt-in in Settings and browser permission.
  useEffect(() => {
    const optIn = settings.data?.preferences.channels.browser_push.opt_in;
    if (!data || !optIn || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const a of data.items) {
      if (!a.is_read && !seen.current.has(a.id) && a.severity !== "low") {
        if (seen.current.size > 0) new Notification(`ClementIQ: ${a.title}`, { body: a.relevance.slice(0, 140), tag: `ciq-${a.id}` });
      }
      seen.current.add(a.id);
    }
  }, [data, settings.data]);

  const unread = data?.unread ?? 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Notifications, ${unread} unread`} className={cn("relative grid size-9 cursor-pointer place-items-center rounded-full", className)}>
        <Bell className="size-[18px]" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-tangerine px-1 text-[0.625rem] font-bold text-white ring-2 ring-white">{unread > 99 ? "99+" : unread}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <button className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-tangerine disabled:opacity-40" disabled={!unread}
            onClick={async () => { await api("/alerts/read-all", { method: "POST" }); qc.invalidateQueries({ queryKey: ["alerts"] }); }}>
            <CheckCheck className="size-3.5" /> Mark all read
          </button>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {!data?.items.length && <li className="p-6 text-center text-xs text-ink-2">No alerts yet. Alerts appear when Clement Core detects something relevant to you.</li>}
          {data?.items.map((a: Alert) => (
            <li key={a.id} className={`border-b border-line px-4 py-3 last:border-0 ${a.is_read ? "" : "bg-peach/50"}`}>
              <div className="flex items-start justify-between gap-2">
                <Link href={a.simulation_link || "/alerts"} className="text-[0.8125rem] font-semibold leading-snug hover:text-tangerine"
                  onClick={() => !a.is_read && mark.mutate({ id: a.id, is_read: true })}>{a.title}</Link>
                <SeverityBadge s={a.severity} />
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-ink-2">{a.relevance}</p>
              <p className="mt-1 text-[0.625rem] text-ink-3">{a.source} · {timeAgo(a.created_at)}</p>
            </li>
          ))}
        </ul>
        <Link href="/alerts" className="block border-t border-line px-4 py-2.5 text-center text-xs font-semibold text-tangerine hover:bg-peach">Open Alerts Center</Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
