"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/misc";
import { PageHeader } from "@/components/layout/PageKit";

const SolanaApp = dynamic(() => import("@/components/invest/SolanaApp"), { ssr: false, loading: () => <Skeleton className="h-96" /> });

export default function SolanaPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Solana Portfolio" subtitle="Optional, read-only wallet analysis, crypto stress tests, and privacy-preserving goal commitments on Devnet" />
      <SolanaApp />
    </div>
  );
}
