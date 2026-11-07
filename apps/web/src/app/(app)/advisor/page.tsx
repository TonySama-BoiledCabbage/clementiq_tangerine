"use client";
import { ShieldCheck, Sparkles } from "lucide-react";
import { useAccount, useAIStatus } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageKit";
import { GeminiChatPanel } from "@/components/ai/GeminiChatPanel";

export default function AdvisorPage() {
  const accountId = useAccount();
  const ai = useAIStatus();
  return (
    <div className="space-y-6">
      <PageHeader title="AI Financial Advisor" subtitle="ClementAI answers with server-side, audited tools — every number comes from Clement Core" />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="p-4"><GeminiChatPanel accountId={accountId} /></Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><div><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-invest" /> Engine</CardTitle></div></CardHeader>
            <CardContent className="space-y-2 text-xs text-ink-2">
              {ai.data?.gemini ? <p><Badge tone="violet">Gemini live</Badge> model <code>{ai.data.model}</code>{ai.data.grounding && " · Google Search grounding on"}</p>
                : <p><Badge>Template mode</Badge> GEMINI_API_KEY is not set, so answers come from Clement Core’s deterministic router using the same tools.</p>}
              <p className="font-semibold text-ink">Tools Gemini may call</p>
              <ul className="space-y-0.5">{ai.data?.tools.map((t) => <li key={t}><code>{t}</code></li>)}</ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-good" /> How answers are labelled</CardTitle><CardDescription>So you can see what each claim rests on</CardDescription></div></CardHeader>
            <CardContent className="space-y-1 text-xs text-ink-2">
              <p><b>record</b> — your verified bank records</p><p><b>calculated</b> — Clement Core output</p><p><b>retrieved</b> — dated news / official statistics, cited</p>
              <p><b>interpretation</b> — the model’s reading</p><p><b>hypothetical</b> — a modeled scenario, not a forecast</p>
              <p className="pt-2">Dollar figures in AI answers are automatically checked against tool results. Personal identifiers are never sent to the model. This is decision support, not financial advice.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
