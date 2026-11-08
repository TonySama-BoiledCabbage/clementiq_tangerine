"use client";
/** My Profile — the person's identity: name, username, role, photo and orchard character. */
import { AvatarSettings, ProfileSettings } from "@/components/settings/PersonalSettings";

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">My Profile</h1>
        <p className="text-sm text-ink-2">Who you are in ClementIQ: your photo, your orchard character and how your images are used. App preferences live in Settings.</p>
      </div>
      <ProfileSettings />
      <AvatarSettings />
    </div>
  );
}
