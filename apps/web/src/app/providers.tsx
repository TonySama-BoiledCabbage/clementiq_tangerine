"use client";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSession } from "@/lib/store";
import { ApiError } from "@/lib/api";

function SessionQueries({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (count, err) => !(err instanceof ApiError && [401, 403, 404, 422].includes(err.status)) && count < 2,
      },
    },
  }));
  useEffect(() => () => { void client.cancelQueries(); client.clear(); }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** A new identity gets a new cache and component tree; financial data never carries across sign-ins. */
export function Providers({ children }: { children: React.ReactNode }) {
  const token = useSession((s) => s.token);
  return <SessionQueries key={token ?? "signed-out"}>{children}</SessionQueries>;
}
