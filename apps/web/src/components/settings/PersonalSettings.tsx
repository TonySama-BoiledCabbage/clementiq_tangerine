"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ImageUp, Monitor, Moon, RefreshCw, Sparkles, Sun, Trash2, Wand2 } from "lucide-react";
import { DEFAULT_ACCESSIBILITY, DEFAULT_APPEARANCE, useMe, useSettings, useUpdatePrefs, type Appearance } from "@/lib/hooks";
import { useMediaUrl, useProfile, useProfileAction, useUploadPhoto } from "@/lib/profile";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger, Switch } from "@/components/ui/controls";
import { ErrorState, Skeleton, Spinner } from "@/components/ui/misc";
import { ProfileAvatar } from "@/components/layout/AppChrome";
import { usePhotoAvailable, PHOTO_BACKGROUND } from "@/components/orchard/OrchardScene";

export function ToggleRow({ label, desc, checked, onChange, disabled }: { label: string; desc?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn("flex items-center justify-between gap-4 py-3", disabled && "opacity-50")}>
      <span><span className="block text-sm font-medium text-ink">{label}</span>{desc && <span className="block text-xs text-ink-2">{desc}</span>}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; icon?: React.ElementType }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex flex-wrap rounded-xl bg-peach p-1" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          className={cn("inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold", value === o.id ? "bg-surface text-tangerine shadow-sm" : "text-ink-2")}>
          {o.icon && <o.icon className="size-3.5" />}{o.label}
        </button>
      ))}
    </div>
  );
}

function useAppearance() {
  const s = useSettings();
  const update = useUpdatePrefs();
  const a: Appearance = { ...DEFAULT_APPEARANCE, ...(s.data?.preferences.appearance ?? {}) };
  return { s, update, a, set: (patch: Partial<Appearance>) => update.mutate({ appearance: patch }) };
}

// ───────────────────────────── My Profile ─────────────────────────────
export function ProfileSettings() {
  const p = useProfile();
  const me = useMe();
  const upload = useUploadPhoto();
  const delPhoto = useProfileAction("/profile/photo", "DELETE");
  const update = useUpdatePrefs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  if (p.isLoading || !p.data) return <Skeleton className="h-64" />;
  const prof = p.data;
  const maxMb = prof.max_upload_mb;
  const pick = (file: File | undefined) => {
    setClientError(null);
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setClientError("Please choose a PNG, JPEG or WebP image.");
    if (file.size > maxMb * 1024 * 1024) return setClientError(`Please choose an image under ${maxMb} MB.`);
    upload.mutate(file);
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-4">
          <ProfileAvatar size={88} />
          <div>
            <p className="text-lg font-bold text-ink">{prof.display_name}</p>
            <p className="text-sm text-ink-2">Role: <b>{me.data?.role ?? prof.role}</b>{me.data?.read_only ? " · read-only" : ""}</p>
            <p className="text-xs text-ink-3">Signed in as {prof.sub}{prof.account_id ? ` · account #${prof.account_id}` : ""}</p>
          </div>
        </div>
        <div>
          <p className="mb-1 font-semibold">Profile picture</p>
          <p className="text-xs text-ink-2">PNG, JPEG or WebP up to {maxMb} MB. Saved to your account (not just this browser), re-encoded with location and camera metadata removed, and visible only to you.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} aria-label="Choose a profile photo" />
            <Button onClick={() => fileRef.current?.click()} disabled={upload.isPending}>{upload.isPending ? <><Spinner /> Uploading…</> : <><ImageUp /> {prof.photo ? "Replace photo" : "Upload photo"}</>}</Button>
            {prof.photo && <Button variant="outline" onClick={() => delPhoto.mutate(undefined)} disabled={delPhoto.isPending}><Trash2 /> Remove photo</Button>}
          </div>
          {clientError && <p role="alert" className="mt-2 text-xs text-bad">{clientError}</p>}
          {upload.error && <div className="mt-2"><ErrorState error={upload.error} /></div>}
          {upload.isSuccess && (
            <div role="status" className="mt-3 space-y-2 rounded-xl bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">
              <p className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="size-4" /> Photo saved to your account.</p>
              <p className="text-xs">Want it in the orchard too? Show it as a portrait now (no AI), or create an illustrated character below.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => update.mutate({ avatar: { character: "photo" } })}>Show my photo in the orchard</Button>
                <Button size="sm" variant="outline" asChild><a href="#orchard-character">Create an illustrated character</a></Button>
              </div>
              {upload.data?.avatar_outdated && <p className="text-xs">Your AI character was made from your previous photo. Regenerate it to update the likeness.</p>}
            </div>
          )}
        </div>
      </Card>
      <Card className="space-y-2 p-5 text-sm text-ink-2">
        <p className="font-semibold text-ink">Where your photo is used</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your profile icon in the top bar and this page.</li>
          <li>Optionally, in the orchard on Home, either as a framed portrait or as an AI-illustrated character you create with consent.</li>
        </ul>
        <p className="pt-2">Manage your orchard character, consent and generated images in the section below.</p>
      </Card>
    </div>
  );
}

// ───────────────────────────── Accessibility & Comfort ─────────────────────────────
export function AccessibilitySettings() {
  const { s, update, a, set } = useAppearance();
  if (!s.data) return <Skeleton className="h-60" />;
  const d = s.data.preferences.display;
  const ax = { ...DEFAULT_ACCESSIBILITY, ...(s.data.preferences.accessibility ?? {}) };
  const setAx = (patch: Partial<typeof ax>) => update.mutate({ accessibility: patch });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <div>
          <p className="mb-2 font-semibold">Text size</p>
          <Segmented label="Text size" value={ax.text_size} onChange={(v) => setAx({ text_size: v })}
            options={[{ id: "default", label: "Default" }, { id: "large", label: "Large" }, { id: "x-large", label: "Extra large" }]} />
          <p className="mt-1 text-xs text-ink-2">Scales all text and controls. Browser zoom works too.</p>
        </div>
        <div>
          <p className="mb-2 font-semibold">Animation intensity</p>
          <Segmented label="Animation intensity" value={a.animation_intensity} onChange={(v) => set({ animation_intensity: v })}
            options={[{ id: "low", label: "Gentle" }, { id: "medium", label: "Medium" }, { id: "high", label: "Lively" }]} />
        </div>
        <div className="divide-y divide-line">
          <ToggleRow label="High contrast" desc="Darker text, stronger borders and solid panels instead of see-through ones." checked={ax.high_contrast} onChange={(v) => setAx({ high_contrast: v })} />
          <ToggleRow label="Reduced motion" desc="Turns off all animation and transitions. Your device’s reduce-motion setting is always respected too." checked={d.reduced_motion} onChange={(v) => update.mutate({ display: { ...d, reduced_motion: v } })} />
          <ToggleRow label="Enhanced keyboard focus" desc="A thicker, high-visibility outline on whatever has keyboard focus." checked={ax.enhanced_focus} onChange={(v) => setAx({ enhanced_focus: v })} />
          <ToggleRow label="3D visualisations" desc="The globe and digital twin. Off shows the equivalent 2D views." checked={d.enable_3d} onChange={(v) => update.mutate({ display: { ...d, enable_3d: v } })} />
        </div>
      </Card>
      <Card className="divide-y divide-line px-5 py-2">
        <ToggleRow label="Simple Mode" desc="Fewer distractions, plain-language summaries with definitions of financial terms, and one task at a time. Decorations are turned off." checked={ax.simple_mode} onChange={(v) => setAx({ simple_mode: v })} />
        <ToggleRow label="Financial Calm Mode" desc="Supportive wording, softer colours and no alarming animation. Important numbers are never hidden." checked={ax.calm_mode} onChange={(v) => setAx({ calm_mode: v })} />
        <ToggleRow label="Accessible charts" desc="Show the data table under every chart by default, in addition to the chart." checked={ax.chart_tables} onChange={(v) => setAx({ chart_tables: v })} />
        <ToggleRow label="Read-aloud buttons" desc="Adds a “Read aloud” button to summaries, AI explanations, alerts and recommendations. Nothing is ever spoken automatically." checked={ax.read_aloud} onChange={(v) => setAx({ read_aloud: v })} />
        <ToggleRow label="Read amounts aloud" desc="Off (recommended): dollar amounts are replaced with “amount” when reading aloud, so balances aren’t spoken in public." checked={ax.read_amounts} onChange={(v) => setAx({ read_amounts: v })} disabled={!ax.read_aloud} />
      </Card>
    </div>
  );
}

// ───────────────────────────── Appearance & Avatar ─────────────────────────────
type Character = "default" | "photo" | "generated";

export function AvatarSettings() {
  const p = useProfile();
  const s = useSettings();
  const update = useUpdatePrefs();
  const consent = useProfileAction("/profile/avatar/consent", "POST");
  const generate = useProfileAction<{ transparent: boolean }>("/profile/avatar/generate", "POST");
  const delAvatar = useProfileAction("/profile/avatar", "DELETE");
  const delAll = useProfileAction("/profile/all", "DELETE");
  const [agreed, setAgreed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const photoUrl = useMediaUrl("photo", p.data?.photo?.version);
  const avatarUrl = useMediaUrl("avatar", p.data?.avatar?.version);
  useEffect(() => {
    if (!generate.isPending) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [generate.isPending]);
  if (!p.data || !s.data) return <Skeleton className="h-80" />;
  const prof = p.data;
  const character = ((s.data.preferences.avatar as { character?: Character }).character ?? "default") as Character;
  const consented = prof.avatar_prefs.generation_consent;
  const available = prof.avatar_generation_available;
  const choose = (c: Character) => update.mutate({ avatar: { character: c } });

  const options: { id: Character; title: string; desc: string; preview: React.ReactNode; disabled?: string }[] = [
    { id: "default", title: "Default character", desc: "The illustrated orchard character.", preview: <span className="text-4xl" aria-hidden>🍊</span> },
    { id: "photo", title: "My photo (portrait)", desc: "Your profile photo, framed in the orchard. No AI involved.",
      // eslint-disable-next-line @next/next/no-img-element
      preview: photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-ink-3">no photo</span>,
      disabled: prof.photo ? undefined : "Upload a profile photo above first." },
    { id: "generated", title: "AI-illustrated character", desc: "An illustrated likeness of you, created from your photo with your consent.",
      // eslint-disable-next-line @next/next/no-img-element
      preview: avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-contain" /> : <Wand2 className="size-7 text-invest" />,
      disabled: prof.avatar ? undefined : !available ? "Unavailable: AI image generation isn’t configured on this server." : "Create it below first." },
  ];

  return (
    <Card className="scroll-mt-24 space-y-5 p-5" id="orchard-character">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><Wand2 className="size-4 text-invest" /> Orchard character</h2>
        <p className="text-xs text-ink-2">Choose who sits in the orchard on Home. It’s a separate layer, so the orchard and trees stay exactly as they are.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Orchard character">
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={character === o.id} aria-disabled={!!o.disabled} disabled={!!o.disabled} onClick={() => choose(o.id)}
            className={cn("flex cursor-pointer gap-3 rounded-2xl border-2 p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
              character === o.id ? "border-tangerine bg-peach" : "border-line hover:border-tangerine/50")}>
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-b from-[#e9b3d0] to-[#ffc9a8]">{o.preview}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">{o.title}{character === o.id && <Badge tone="orange">in use</Badge>}</span>
              <span className="block text-xs text-ink-2">{o.desc}</span>
              {o.disabled && <span className="mt-1 block text-[0.6875rem] font-medium text-warn">{o.disabled}</span>}
            </span>
          </button>
        ))}
      </div>
      {update.error && <p role="alert" className="text-xs text-bad">{(update.error as Error).message}</p>}

      <div className="rounded-2xl border border-line p-4">
        <p className="mb-1 font-semibold text-ink">AI-illustrated character</p>
        {!available ? (
          <div className="space-y-2 text-sm text-ink-2" role="status">
            <p><b className="text-warn">Not available on this server.</b> Creating an illustrated likeness needs Google’s Gemini image model, and no Gemini API key is configured. Nothing is generated or sent anywhere.</p>
            <p className="text-xs">To enable it: add <code>GEMINI_API_KEY=your-key</code> to the <code>.env</code> file in the project root (optionally <code>GEMINI_IMAGE_MODEL=gemini-2.5-flash-image</code>), then restart with <code>npm run stop</code> and <code>npm run dev</code>. Until then you can use the default character or your photo as a portrait.</p>
          </div>
        ) : !prof.photo ? (
          <p className="text-sm text-ink-2">Upload a profile photo above first.</p>
        ) : !consented ? (
          <Dialog>
            <DialogTrigger asChild><Button><Sparkles /> Generate My Orchard Avatar</Button></DialogTrigger>
            <DialogContent title="Use your photo to create a character?" description="Please read before continuing">
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
                <li>Your profile photo will be sent to Google’s Gemini image model ({prof.image_model}) to create an illustrated likeness.</li>
                <li>Only the photo is sent: never your account, balances or other financial data.</li>
                <li>The result is stored privately in your ClementIQ account; only you can see it.</li>
                <li>You can withdraw consent, switch back to the default character, or delete your images at any time.</li>
              </ul>
              <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" /> I agree to my photo being used this way.</label>
              <Button className="mt-4 w-full" disabled={!agreed || consent.isPending || generate.isPending}
                onClick={() => consent.mutate({ consent: true }, { onSuccess: () => generate.mutate(undefined) })}>
                {generate.isPending ? <><Spinner /> Generating your character… {elapsed}s</> : "Agree and generate"}
              </Button>
              {generate.error && <div className="mt-3"><ErrorState error={generate.error} /></div>}
            </DialogContent>
          </Dialog>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => generate.mutate(undefined)} disabled={generate.isPending}>
                {generate.isPending ? <><Spinner /> Generating… {elapsed}s</> : prof.avatar ? <><RefreshCw /> Regenerate character</> : <><Sparkles /> Generate My Orchard Avatar</>}
              </Button>
              {prof.avatar && <Button variant="outline" onClick={() => delAvatar.mutate(undefined)}><Trash2 /> Delete generated character</Button>}
              <Button variant="ghost" onClick={() => consent.mutate({ consent: false })}>Withdraw consent</Button>
            </div>
            {generate.isPending && <p role="status" className="text-xs text-ink-2">This usually takes 10–60 seconds. Home keeps working meanwhile.</p>}
            {generate.isSuccess && <p role="status" className="text-xs font-semibold text-good">✓ Your character is ready and now sits in the orchard on Home{generate.data?.transparent ? "" : " (shown with a soft fade because the background couldn’t be removed)"}.</p>}
            {generate.error && <ErrorState error={generate.error} />}
            {prof.avatar && <p className="text-[0.6875rem] text-ink-3">Created {dateTime(prof.avatar.updated_at)} with {prof.avatar.source.replace("gemini:", "Gemini ")} · consent given {dateTime(prof.avatar_prefs.consent_at)}</p>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button variant="outline" size="sm" onClick={() => choose("default")} disabled={character === "default"}>Restore default character</Button>
        <Button variant="danger" size="sm" onClick={() => { if (confirm("Delete your profile photo and any generated character? This cannot be undone.")) delAll.mutate(undefined); }}><Trash2 /> Delete all my images</Button>
      </div>
    </Card>
  );
}

export function AppearanceSettings() {
  const { s, a, set } = useAppearance();
  const photoOk = usePhotoAvailable(a.orchard_style === "photo");
  if (!s.data) return <Skeleton className="h-80" />;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <p className="mb-3 font-semibold">Theme</p>
          <Segmented label="Theme" value={a.theme} onChange={(v) => set({ theme: v })}
            options={[{ id: "light", label: "Light", icon: Sun }, { id: "dark", label: "Dark", icon: Moon }, { id: "system", label: "System", icon: Monitor }]} />
          <p className="mb-2 mt-5 font-semibold">Orchard style</p>
          <Segmented label="Orchard style" value={a.orchard_style} onChange={(v) => set({ orchard_style: v })}
            options={[{ id: "illustrated", label: "Illustrated" }, { id: "photo", label: "Photorealistic" }]} />
          {a.orchard_style === "photo" && photoOk === false && (
            <p className="mt-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              No photographic orchard is installed, so the illustrated orchard is shown. Add an image at <code>apps/web/public{PHOTO_BACKGROUND}</code> to enable this style.
            </p>
          )}
        </Card>
        <Card className="divide-y divide-line px-5 py-2">
          <ToggleRow label="Orchard background" desc="The golden-hour scene on Home. Off shows a calm peach backdrop." checked={a.orchard_enabled} onChange={(v) => set({ orchard_enabled: v })} />
          <ToggleRow label="Money trees" desc="Dollar bills and coins on the branches (tangerines stay)." checked={a.money_trees} onChange={(v) => set({ money_trees: v })} disabled={!a.orchard_enabled} />
          <ToggleRow label="Floating coins" desc="Gentle sparkles drifting up through the orchard." checked={a.floating_coins} onChange={(v) => set({ floating_coins: v })} disabled={!a.orchard_enabled} />
          <ToggleRow label="Orchard reflects my progress" desc="Fruit, golden tangerines and canopy follow your real numbers, and never show setbacks harshly." checked={a.growth_visuals} onChange={(v) => set({ growth_visuals: v })} disabled={!a.orchard_enabled} />
          <ToggleRow label="Decorative animations" desc="Swaying leaves, swinging bills and glowing fruit." checked={a.animations} onChange={(v) => set({ animations: v })} disabled={!a.orchard_enabled} />
          <ToggleRow label="Show my personalised character" desc={<>Your photo portrait or generated character in the orchard. Off shows the default character; nothing is deleted. Manage it in <Link className="font-semibold text-tangerine underline" href="/profile">My Profile</Link>.</>}
            checked={a.show_personal_character !== false} onChange={(v) => set({ show_personal_character: v })} />
        </Card>
      </div>
    </div>
  );
}

// ───────────────────────────── Account Settings: notifications ─────────────────────────────
export function NotificationSettings() {
  const s = useSettings();
  const update = useUpdatePrefs();
  if (!s.data) return <Skeleton className="h-60" />;
  const a = s.data.preferences.alerts;
  const cat = a.categories;
  const setCats = (patch: Record<string, boolean>) => update.mutate({ alerts: { categories: { ...patch } } });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="divide-y divide-line px-5 py-2">
        <ToggleRow label="All alerts" desc="Master switch for the alert pipeline." checked={a.enabled} onChange={(v) => update.mutate({ alerts: { enabled: v } })} />
        <ToggleRow label="Financial alerts" desc="Low runway, unusual spending, loan burden." checked={cat.financial_health && cat.loan_exposure} disabled={!a.enabled}
          onChange={(v) => setCats({ financial_health: v, loan_exposure: v })} />
        <ToggleRow label="Savings goal updates" desc="Emergency-fund progress and low-savings notices." checked={cat.savings_goals} disabled={!a.enabled} onChange={(v) => setCats({ savings_goals: v })} />
        <ToggleRow label="Shock simulator reminders" desc="A gentle monthly nudge if you haven’t saved a stress test in 30 days." checked={cat.reminders ?? true} disabled={!a.enabled} onChange={(v) => setCats({ reminders: v })} />
        <ToggleRow label="Market notifications" desc="Large price moves in your investments and crypto." checked={cat.investments && cat.crypto} disabled={!a.enabled} onChange={(v) => setCats({ investments: v, crypto: v })} />
        <ToggleRow label="Global event alerts" desc="WorldPulse developments that could reach your budget." checked={cat.global_events} disabled={!a.enabled} onChange={(v) => setCats({ global_events: v })} />
        <ToggleRow label="AI insight notifications" desc="Plain-language Gemini explanations attached to new alerts." checked={a.ai_explanations ?? true} disabled={!a.enabled}
          onChange={(v) => update.mutate({ alerts: { ai_explanations: v } })} />
      </Card>
      <Card className="space-y-2 p-5 text-sm text-ink-2">
        <p className="font-semibold text-ink">Delivery, quiet hours and limits</p>
        <p>In-app alerts are always on. Email and browser notifications are opt-in, with quiet hours, a daily cap and a relevance threshold.</p>
        <Button asChild variant="outline" size="sm"><Link href="/alerts">Open advanced alert preferences</Link></Button>
        <p className="pt-2 text-xs">Hiding the Alerts card on Home does not change any of these settings.</p>
      </Card>
    </div>
  );
}

// ───────────────────────────── Account Settings: privacy & AI ─────────────────────────────
export function PrivacySettings() {
  const s = useSettings();
  const update = useUpdatePrefs();
  const p = useProfile();
  if (!s.data) return <Skeleton className="h-60" />;
  const pv = s.data.preferences.privacy;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="divide-y divide-line px-5 py-2">
        <ToggleRow label="Personalized AI guidance" checked={pv.personalized_ai} onChange={(v) => update.mutate({ privacy: { personalized_ai: v } })}
          desc="On: Gemini receives rounded summaries of your numbers (never account IDs or personal details) to explain results. Off: nothing about you is sent to an AI service; explanations and chat use ClementIQ’s built-in templates." />
        <ToggleRow label="Optional AI insights" checked={pv.optional_ai_insights} onChange={(v) => update.mutate({ privacy: { optional_ai_insights: v } })}
          desc="Shows the “Explain with Clement Gemini” cards in workspaces. Off hides them; all calculations still work." />
        <ToggleRow label="Hide my balances (privacy mode)" checked={!!pv.mask_balances} onChange={(v) => update.mutate({ privacy: { mask_balances: v } })}
          desc="Replaces dollar amounts with •••• everywhere on screen, including tooltips and screen-reader text. Shortcut: Alt+Shift+H." />
        <ToggleRow label="AI explanations on alerts" checked={s.data.preferences.alerts.ai_explanations ?? true}
          onChange={(v) => update.mutate({ alerts: { ai_explanations: v } })} desc="Same as “AI insight notifications” above." />
      </Card>
      <Card className="space-y-2 p-5 text-sm text-ink-2">
        <p className="font-semibold text-ink">Your images</p>
        <p>Photo: {p.data?.photo ? "stored privately" : "none"} · Character: {p.data?.avatar ? "stored privately" : "none"} · Photo-generation consent: <b className="text-ink">{p.data?.avatar_prefs.generation_consent ? "given" : "not given"}</b></p>
        <Button asChild variant="outline" size="sm"><Link href="/profile">Manage images and consent in My Profile</Link></Button>
        <p className="pt-3 font-semibold text-ink">Data sharing</p>
        <p>ClementIQ never sells or shares your data. External services are used only for explanations (Gemini, when enabled above), public market and economic data, and read-only Solana lookups you explicitly connect.</p>
      </Card>
    </div>
  );
}
