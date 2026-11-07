"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Gavel, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useSession, type Role } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/layout/Logo";
import { cn } from "@/lib/utils";

const schema = z.object({
  role: z.enum(["judge", "customer", "admin"]),
  access_code: z.string().min(1, "Access code required"),
  account_id: z.string().regex(/^\d*$/, "Digits only").optional(),
}).refine((v) => v.role !== "customer" || !!v.account_id, { path: ["account_id"], message: "Customer sign-in needs an account_id" });
type Form = z.infer<typeof schema>;

const ROLES: { id: Role; label: string; desc: string; icon: React.ElementType }[] = [
  { id: "judge", label: "Judge demo", desc: "Read-only access to any account in the challenge dataset.", icon: Gavel },
  { id: "customer", label: "Customer", desc: "Access scoped to a single account_id.", icon: UserRound },
  { id: "admin", label: "Admin", desc: "Data import and operations.", icon: ShieldCheck },
];

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const setSession = useSession((s) => s.setSession);
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema), defaultValues: { role: "judge", access_code: "", account_id: "" },
  });
  const role = watch("role");
  const showCodes = process.env.NEXT_PUBLIC_SHOW_DEMO_CODES === "true";

  const onSubmit = async (v: Form) => {
    setErr(null);
    try {
      const r = await api<{ access_token: string; role: Role; sub: string; account_id: number | null; expires_at: string }>(
        "/auth/demo-login", { method: "POST", json: { role: v.role, access_code: v.access_code, account_id: v.account_id ? Number(v.account_id) : null } });
      setSession({ token: r.access_token, role: r.role, sub: r.sub, account_id: r.account_id, expires_at: r.expires_at });
      router.replace(next.startsWith("/") ? next : "/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Sign-in role">
        {ROLES.map((r) => (
          <button type="button" role="radio" aria-checked={role === r.id} key={r.id} onClick={() => setValue("role", r.id)}
            className={cn("cursor-pointer rounded-2xl border p-3 text-left transition", role === r.id ? "border-tangerine bg-peach" : "border-line hover:border-tangerine/50")}>
            <r.icon className={cn("mb-1 size-5", role === r.id ? "text-tangerine" : "text-ink-3")} />
            <p className="text-sm font-semibold">{r.label}</p>
            <p className="text-[11px] text-ink-2">{r.desc}</p>
          </button>
        ))}
      </div>
      {role === "customer" && (
        <div>
          <Label htmlFor="acc">account_id</Label>
          <Input id="acc" inputMode="numeric" placeholder="e.g. 20111" {...register("account_id")} />
          {errors.account_id && <p className="mt-1 text-xs text-bad">{errors.account_id.message}</p>}
        </div>
      )}
      <div>
        <Label htmlFor="code">Access code</Label>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input id="code" type="password" autoComplete="current-password" className="pl-9" {...register("access_code")} />
        </div>
        {errors.access_code && <p className="mt-1 text-xs text-bad">{errors.access_code.message}</p>}
        {showCodes && <p className="mt-1 text-[11px] text-ink-3">Development codes (from .env.example): judge <code>tangerine-judge</code> · customer <code>tangerine-customer</code> · admin <code>tangerine-admin</code></p>}
      </div>
      {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{err}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="brand-gradient hidden flex-col justify-between p-10 text-white lg:flex">
        <Logo light />
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Your Daily Dose of<br />Financial Intelligence</h1>
          <p className="mt-3 max-w-md text-white/85">Know your numbers, test a shock, and get a plan — then see how events around the world could reach your budget.</p>
          <ul className="mt-6 space-y-2 text-sm text-white/90">
            <li>• Clement Core: deterministic, reproducible financial engine</li>
            <li>• Clement Gemini: plain-language explanations, sourced and labelled</li>
            <li>• WorldPulse: official statistics + news → modeled personal impact</li>
          </ul>
        </div>
        <p className="text-xs text-white/70">Built for the Tangerine Financial Resilience Challenge · Sheridan Datathon 2026. Original branding; not affiliated with Tangerine Bank.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <div className="mb-6 lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-bold">Sign in</h2>
          <p className="mb-6 text-sm text-ink-2">Financial data is protected — every API call requires a signed session.</p>
          <Suspense><LoginForm /></Suspense>
        </div>
      </div>
    </div>
  );
}
