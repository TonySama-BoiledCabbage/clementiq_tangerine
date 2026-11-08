"use client";
import { cn } from "@/lib/utils";
/** Layer 3 — the orchard character. Default: an illustrated person enjoying a tangerine.
 *  Personalised: the user's consented, generated avatar, softly masked into the scene.
 *  Position is shared by both so a personalised avatar sits exactly where the default one does. */

function DefaultCharacter() {
  return (
    <svg viewBox="0 0 400 480" className="h-full w-auto drop-shadow-[0_10px_30px_rgba(120,60,10,0.25)]" role="img" aria-label="Illustrated character enjoying a tangerine in the orchard">
      <defs>
        <linearGradient id="ch-sweater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbf1e4" /><stop offset="1" stopColor="#e8d3b9" /></linearGradient>
        <radialGradient id="ch-skin" cx="0.45" cy="0.4" r="0.75"><stop offset="0" stopColor="#e3ab84" /><stop offset="1" stopColor="#c68863" /></radialGradient>
        <radialGradient id="ch-tg" cx="0.38" cy="0.35" r="0.7"><stop offset="0" stopColor="#ffc06a" /><stop offset="0.6" stopColor="#ff8a1f" /><stop offset="1" stopColor="#e2620a" /></radialGradient>
        <linearGradient id="ch-rim" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stopColor="#ffd28a" stopOpacity="0.6" /><stop offset="0.45" stopColor="#ffd28a" stopOpacity="0" /></linearGradient>
      </defs>

      {/* hair volume behind the head, falling to the shoulders */}
      <g fill="#3a2317">
        {[[148, 175, 60], [262, 175, 60], [205, 128, 64], [128, 240, 50], [284, 240, 50], [132, 300, 42], [280, 300, 42], [118, 205, 40], [296, 205, 40]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
      </g>

      {/* knit sweater */}
      <path d="M44 480 C 46 384, 96 336, 164 324 L 246 324 C 314 336, 360 384, 364 480 Z" fill="url(#ch-sweater)" />
      {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${124 + i * 40} 352 q 6 60 0 128`} stroke="#e0caae" strokeWidth="3" fill="none" opacity="0.7" />)}
      <path d="M170 324 q 35 26 70 0" stroke="#e0caae" strokeWidth="5" fill="none" />

      {/* neck and face */}
      <path d="M182 270 L 184 326 Q 205 338 226 326 L 228 270 Z" fill="#c08560" />
      <ellipse cx="205" cy="200" rx="70" ry="86" fill="url(#ch-skin)" />
      <ellipse cx="205" cy="200" rx="70" ry="86" fill="url(#ch-rim)" />

      {/* side-swept fringe */}
      <path d="M134 178 C 140 112, 230 92, 278 150 C 268 140, 236 128, 206 134 C 180 140, 156 156, 134 178 Z" fill="#4a2c1c" />
      <path d="M262 140 C 280 160, 282 188, 276 208 C 272 182, 266 164, 252 150 Z" fill="#4a2c1c" />

      {/* closed, happy eyes; brows; blush */}
      <path d="M166 198 q 13 -11 26 0" stroke="#3a2317" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M218 198 q 13 -11 26 0" stroke="#3a2317" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M164 180 q 14 -6 28 -2" stroke="#3a2317" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
      <path d="M218 178 q 14 -4 28 2" stroke="#3a2317" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
      <ellipse cx="170" cy="226" rx="15" ry="8" fill="#ef8f7a" opacity="0.45" />
      <ellipse cx="242" cy="226" rx="15" ry="8" fill="#ef8f7a" opacity="0.45" />
      <path d="M196 214 q 6 8 12 0" stroke="#a96a48" strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {/* open, delighted smile */}
      <path d="M186 244 q 19 18 38 0 q -19 5 -38 0 Z" fill="#9b3b2c" />
      <path d="M192 246 q 13 4 26 0" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.85" />

      {/* raised hand holding a tangerine segment beside the mouth */}
      <g>
        <path d="M244 300 C 238 282, 240 262, 252 252 C 262 244, 278 248, 282 262 C 286 278, 280 296, 268 304 Z" fill="url(#ch-skin)" />
        <ellipse cx="248" cy="250" rx="7" ry="11" transform="rotate(-25 248 250)" fill="url(#ch-skin)" />
        <ellipse cx="258" cy="246" rx="6" ry="10" transform="rotate(-10 258 246)" fill="url(#ch-skin)" />
        <path d="M232 238 q 6 -10 18 -8 q -2 12 -14 14 q -6 0 -4 -6 Z" fill="#ff9a2e" stroke="#e6741a" strokeWidth="1.2" />
        <path d="M236 238 q 5 -4 10 -4" stroke="#ffd29a" strokeWidth="1.2" fill="none" />
      </g>

      {/* other hand holding a peeled tangerine in front of the chest */}
      <g>
        <circle cx="130" cy="352" r="36" fill="url(#ch-tg)" />
        {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M130 352 L ${130 + 34 * Math.cos((i * Math.PI) / 3 + 0.3)} ${352 + 34 * Math.sin((i * Math.PI) / 3 + 0.3)}`} stroke="#ffd29a" strokeWidth="2" opacity="0.85" />)}
        <circle cx="130" cy="352" r="8" fill="#fff1d6" opacity="0.9" />
        <path d="M94 362 q -22 10 -24 30 q 24 -2 36 -20 Z" fill="#ff8a1f" />
        <path d="M166 362 q 22 10 24 30 q -24 -2 -36 -20 Z" fill="#ff8a1f" />
        <path d="M84 396 C 96 378, 164 378, 176 396 C 168 414, 92 414, 84 396 Z" fill="url(#ch-skin)" />
        {[0, 1, 2, 3].map((i) => <path key={i} d={`M${104 + i * 16} 398 q 4 8 0 14`} stroke="#b07250" strokeWidth="1.5" fill="none" opacity="0.7" />)}
      </g>
      <circle cx="140" cy="292" r="5" fill="#ffd34d" />
    </svg>
  );
}

export type CharacterMode = "default" | "photo" | "generated";

/** Your own photo as a warm, framed portrait in the orchard: the non-AI personalisation option. */
function PhotoPortrait({ url }: { url: string }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-end">
      <div className="relative h-[78%] overflow-hidden rounded-t-[999px] rounded-b-[28px] border-[7px] border-[#ffd29a] bg-[#ffd9b0] shadow-[0_18px_40px_-12px_rgba(120,60,10,0.55)]"
        style={{ aspectRatio: "3 / 4" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Your profile photo, framed in the orchard" className="h-full w-full object-cover"
          style={{ filter: "saturate(1.08) sepia(0.12) brightness(1.03)" }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(200deg, rgba(255,190,110,0.35), rgba(255,140,60,0) 45%, rgba(120,60,20,0.18))" }} />
      </div>
      <svg viewBox="0 0 120 70" className="-mt-7 h-[16%] w-auto drop-shadow" aria-hidden>
        <circle cx="60" cy="38" r="28" fill="#ff8a1f" />
        {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M60 38 L ${60 + 26 * Math.cos((i * Math.PI) / 3 + 0.3)} ${38 + 26 * Math.sin((i * Math.PI) / 3 + 0.3)}`} stroke="#ffd29a" strokeWidth="2" />)}
        <path d="M32 44 q -18 6 -22 22 q 18 -2 28 -14 Z M88 44 q 18 6 22 22 q -18 -2 -28 -14 Z" fill="#f2700f" />
        <path d="M60 10 q 8 -10 18 -6 q -8 8 -18 6" fill="#3f8a34" />
      </svg>
    </div>
  );
}

export function OrchardCharacter({ mode, url, transparent }: { mode: CharacterMode; url: string | null; transparent?: boolean }) {
  const effective: CharacterMode = mode !== "default" && url ? mode : "default";
  return (
    <div className={cn("anim-bob pointer-events-none absolute right-[2%] sm:right-auto sm:left-[6%] md:left-[18%]",
      effective === "photo"
        ? "bottom-[110px] h-[34%] sm:bottom-[110px] sm:h-[46%] lg:bottom-[100px] lg:h-[58%]"   // framed portrait: smaller, clear of the toolbar
        : "bottom-[104px] h-[40%] sm:bottom-[96px] sm:h-[62%] lg:bottom-[40px] lg:h-[80%]")}
      data-character={effective}>
      {effective === "photo" && url && <PhotoPortrait url={url} />}
      {effective === "generated" && url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Your personalised orchard character" className="h-full w-auto object-contain"
          style={transparent
            ? { aspectRatio: "1 / 1", filter: "drop-shadow(0 14px 22px rgba(120,60,10,0.35))" }
            : { aspectRatio: "1 / 1", maskImage: "radial-gradient(ellipse 50% 52% at 50% 48%, #000 62%, transparent 100%)",
                WebkitMaskImage: "radial-gradient(ellipse 50% 52% at 50% 48%, #000 62%, transparent 100%)" }} />
      )}
      {effective === "default" && <DefaultCharacter />}
    </div>
  );
}
