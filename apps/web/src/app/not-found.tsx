import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div><p className="text-5xl font-extrabold text-tangerine">404</p><p className="mt-2 text-ink-2">This page does not exist.</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-tangerine underline">Back to ClementIQ</Link></div>
    </div>
  );
}
