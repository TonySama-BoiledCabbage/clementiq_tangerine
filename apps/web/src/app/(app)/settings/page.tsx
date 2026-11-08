"use client";
import { useSaveSettings, useSettings } from "@/lib/hooks";
import { useSession } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/controls";
import { ErrorState, SectionTitle, Skeleton } from "@/components/ui/misc";
import { AlertPreferences } from "@/components/alerts/AlertPreferences";

export default function SettingsPage() {
  const s = useSettings();
  const save = useSaveSettings();
  const sub = useSession((s) => s.sub);
  const d = s.data?.preferences.display;
  return <div className="space-y-6">
    <SectionTitle title="Settings" subtitle={`Personal preferences for ${sub}`} />
    {s.error && <ErrorState error={s.error} retry={s.refetch} />}
    {save.error && <ErrorState error={save.error} />}
    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><div><CardTitle>Notifications</CardTitle><CardDescription>Choose channels, timing and frequency.</CardDescription></div></CardHeader><CardContent><AlertPreferences /></CardContent></Card>
      <div className="space-y-6">
        <Card><CardHeader><div><CardTitle>Privacy & AI</CardTitle><CardDescription>Core calculations and plans work without AI.</CardDescription></div></CardHeader><CardContent>
          <label className="flex min-h-11 items-center justify-between gap-4 text-sm"><span>Allow personalized AI explanations</span><Switch checked={s.data?.preferences.privacy.personalized_ai ?? false} disabled={!s.data || save.isPending} onCheckedChange={(personalized_ai) => save.mutate({ privacy: { personalized_ai } })} /></label>
          <p className="mt-2 text-xs leading-relaxed text-ink-2">Explanations are requested manually. Turning AI off uses standard text and sends no personalized explanation request to the model.</p>
        </CardContent></Card>
        <Card><CardHeader><div><CardTitle>Display & accessibility</CardTitle></div></CardHeader><CardContent className="space-y-3">
          {!d ? <Skeleton className="h-16" /> : <>
            <label className="flex min-h-11 items-center justify-between gap-4 text-sm"><span>Reduced motion</span><Switch checked={d.reduced_motion} disabled={save.isPending} onCheckedChange={(reduced_motion) => save.mutate({ display: { ...d, reduced_motion } })} /></label>
            <label className="flex min-h-11 items-center justify-between gap-4 text-sm"><span>Enable 3D in optional visualisations</span><Switch checked={d.enable_3d} disabled={save.isPending} onCheckedChange={(enable_3d) => save.mutate({ display: { ...d, enable_3d } })} /></label>
          </>}
          <p className="text-xs leading-relaxed text-ink-2">Read aloud buttons use your browser speech support, only when selected. There is no automatic reading or separate paid speech service.</p>
        </CardContent></Card>
      </div>
    </div>
  </div>;
}
