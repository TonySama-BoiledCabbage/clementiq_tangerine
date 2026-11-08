"use client";
import "@solana/wallet-adapter-react-ui/styles.css";
import { useMemo, useState } from "react";
import { Buffer } from "buffer";
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction, clusterApiUrl } from "@solana/web3.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, Fingerprint, ShieldCheck, Wallet } from "lucide-react";
import { SolanaAddressSchema } from "@clementiq/shared-types";
import { api } from "@/lib/api";
import { money, signedMoney } from "@/lib/format";
import { useAccount, useSummary } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { ErrorState, Spinner } from "@/components/ui/misc";
import { ShockParameterSlider } from "@/components/finance/Shock";
import { ChartTooltip, SERIES, axisProps, gridProps } from "@/components/finance/chart-kit";

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

interface WalletSummary {
  public_key: string; network: string; sol: number; tokens: { mint: string; symbol: string | null; amount: number; program: string }[];
  transactions: { signature: string; slot: number; error: boolean; block_time: string | null; memo: string | null }[];
  valuation: { sol_price_cad?: number; value_cad?: number; price_source?: string; price_as_of?: string; change_24h_pct?: number | null; note?: string };
  concentration: { distinct_assets: number; note: string }; retrieved_at: string; source: string;
}
interface Goal { id: number; name: string; target_amount: number; proof_hash: string; memo: string; devnet_signature: string | null; devnet_verified: boolean; explorer_url: string | null }

export function SolanaWalletPanel({ onValue }: { onValue: (v: number | null) => void }) {
  const { publicKey } = useWallet();
  const [manual, setManual] = useState("");
  const [network, setNetwork] = useState<"mainnet" | "devnet">("mainnet");
  const [consent, setConsent] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const addr = publicKey?.toBase58() ?? manual.trim();
  const valid = SolanaAddressSchema.safeParse(addr).success;
  const w = useQuery({
    queryKey: ["wallet", active, network],
    queryFn: async () => { const r = await api<WalletSummary>(`/solana/wallet/${active}?network=${network}`); onValue(r.valuation.value_cad ?? null); return r; },
    enabled: !!active,
  });
  const connect = useMutation({
    mutationFn: () => api("/solana/connect", { method: "POST", json: { public_key: addr, network, consent } }),
    onSuccess: () => setActive(addr),
  });
  const activity = useMemo(() => {
    const by = new Map<string, number>();
    for (const t of w.data?.transactions ?? []) if (t.block_time) by.set(t.block_time.slice(0, 10), (by.get(t.block_time.slice(0, 10)) ?? 0) + 1);
    return [...by.entries()].sort().map(([day, n]) => ({ day, n }));
  }, [w.data]);

  return (
    <Card>
      <CardHeader><div><CardTitle className="flex items-center gap-2"><Wallet className="size-4 text-invest" /> Wallet analysis (read-only)</CardTitle>
        <CardDescription>Optional. ClementIQ never asks for seed phrases or private keys and never moves funds.</CardDescription></div></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><WalletMultiButton /><span className="text-xs text-ink-3">or paste a public address</span></div>
        {!publicKey && <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Public address (base58)" aria-label="Solana public address" />}
        {addr && !valid && <p className="text-xs text-bad">Not a valid Solana public address.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Select className="h-9 w-36 text-xs" value={network} onChange={(e) => setNetwork(e.target.value as "mainnet" | "devnet")} aria-label="Network"><option value="mainnet">Mainnet</option><option value="devnet">Devnet</option></Select>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I allow ClementIQ to read this public address’s balances and history.</label>
        </div>
        <Button disabled={!valid || !consent || connect.isPending} onClick={() => connect.mutate()}>{connect.isPending && <Spinner />} Analyse wallet</Button>
        {connect.error && <ErrorState error={connect.error} />}
        {w.error && <ErrorState error={w.error} retry={w.refetch} />}
        {w.isFetching && <p className="flex items-center gap-2 text-xs text-ink-2"><Spinner /> Querying Solana RPC…</p>}
        {w.data && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-cream p-3"><p className="text-[0.6875rem] text-ink-2">SOL balance</p><p className="tabular text-xl font-bold">{w.data.sol.toLocaleString("en-CA", { maximumFractionDigits: 4 })}</p></div>
              <div className="rounded-xl bg-cream p-3"><p className="text-[0.6875rem] text-ink-2">Value (CAD)</p><p className="tabular text-xl font-bold">{w.data.valuation.value_cad !== undefined ? money(w.data.valuation.value_cad) : "—"}</p>
                <p className="text-[0.625rem] text-ink-3">{w.data.valuation.price_source ? `${w.data.valuation.price_source} · ${money(w.data.valuation.sol_price_cad, true)}/SOL` : w.data.valuation.note}</p></div>
              <div className="rounded-xl bg-cream p-3"><p className="text-[0.6875rem] text-ink-2">Assets</p><p className="tabular text-xl font-bold">{w.data.concentration.distinct_assets}</p><p className="text-[0.625rem] text-ink-3">{w.data.concentration.note}</p></div>
            </div>
            {w.data.tokens.length > 0 && <ul className="text-xs">{w.data.tokens.map((t) => <li key={t.mint} className="flex justify-between border-t border-line py-1"><span>{t.symbol ?? `${t.mint.slice(0, 6)}…`} <Badge>{t.program}</Badge></span><span className="tabular">{t.amount.toLocaleString()}</span></li>)}</ul>}
            {activity.length > 0 && <ResponsiveContainer width="100%" height={140}><BarChart data={activity}><CartesianGrid {...gridProps} /><XAxis dataKey="day" {...axisProps} /><YAxis allowDecimals={false} {...axisProps} width={28} /><Tooltip content={<ChartTooltip fmt={(v) => `${v} tx`} />} /><Bar dataKey="n" name="Transactions" fill={SERIES.invest} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>}
            <ul className="max-h-48 overflow-y-auto text-[0.6875rem]">{w.data.transactions.map((t) => (
              <li key={t.signature} className="flex justify-between gap-2 border-t border-line py-1"><a className="truncate underline hover:text-tangerine" target="_blank" rel="noopener noreferrer" href={`https://explorer.solana.com/tx/${t.signature}${network === "devnet" ? "?cluster=devnet" : ""}`}>{t.signature.slice(0, 20)}…</a><span className="text-ink-3">{t.block_time?.slice(0, 16).replace("T", " ")}{t.error && " · failed"}</span></li>
            ))}</ul>
            <p className="text-[0.625rem] text-ink-3">{w.data.source} · retrieved {w.data.retrieved_at.slice(0, 19).replace("T", " ")} UTC</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CryptoShockSimulator({ accountId, walletValue }: { accountId: number | null; walletValue: number | null }) {
  const [value, setValue] = useState(walletValue ?? 2000);
  const [p, setP] = useState(-40);
  const body = { value: walletValue ?? value, pct_change: p, account_id: accountId };
  const q = useQuery({ queryKey: ["crypto-shock", body], queryFn: () => api<{ initial_value: number; modeled_value: number; gain_loss: number; relative_to_buffer?: number | null; note?: string }>("/solana/scenario", { method: "POST", json: body }) });
  return (
    <Card>
      <CardHeader><div><CardTitle>Crypto price shock simulator</CardTitle><CardDescription>Hypothetical declines and gains</CardDescription></div></CardHeader>
      <CardContent className="space-y-3">
        {walletValue === null && <ShockParameterSlider label="Hypothetical crypto holdings" unit="$" value={value} min={0} max={100000} step={100} onChange={setValue} />}
        <ShockParameterSlider label="Price change" unit="%" value={p} min={-90} max={200} onChange={setP} />
        {q.data && <div className="rounded-xl bg-cream p-3 text-sm">
          <p>{money(q.data.initial_value)} → <b>{money(q.data.modeled_value)}</b> <span className={q.data.gain_loss >= 0 ? "text-good" : "text-bad"}>({signedMoney(q.data.gain_loss)})</span></p>
          {q.data.relative_to_buffer != null && <p className="text-xs text-ink-2">Equivalent to {Math.abs(q.data.relative_to_buffer * 100).toFixed(0)}% of the customer’s liquid buffer.</p>}
          {q.data.note && <p className="text-[0.6875rem] text-ink-3">{q.data.note}</p>}
        </div>}
      </CardContent>
    </Card>
  );
}

function GoalProof({ accountId }: { accountId: number }) {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const summary = useSummary(accountId);
  const qc = useQueryClient();
  const goals = useQuery({ queryKey: ["goals"], queryFn: () => api<{ items: Goal[] }>("/solana/goals") });
  const [name, setName] = useState("3-month emergency fund");
  const [status, setStatus] = useState<string | null>(null);
  const target = summary.data ? Math.round(summary.data.metrics.emergency_fund_target_3m) : 0;
  const create = useMutation({ mutationFn: () => api<Goal>("/solana/goals", { method: "POST", json: { account_id: accountId, name, target_amount: target } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }) });
  const airdrop = useMutation({ mutationFn: async () => {
    if (!publicKey) throw new Error("Connect a wallet first");
    const sig = await connection.requestAirdrop(publicKey, 0.2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    return sig;
  } });
  const record = useMutation({
    mutationFn: async (g: Goal) => {
      if (!publicKey) throw new Error("Connect a Devnet wallet first");
      setStatus("Preparing memo…");
      const { memo } = await api<{ memo: string }>("/solana/devnet/goal-proof", { method: "POST", json: { goal_id: g.id } });
      const tx = new Transaction().add(new TransactionInstruction({ keys: [{ pubkey: publicKey, isSigner: true, isWritable: false }], programId: MEMO_PROGRAM, data: Buffer.from(memo, "utf8") }));
      setStatus("Waiting for your wallet approval…");
      const sig = await sendTransaction(tx, connection);
      setStatus("Confirming on Devnet…");
      await connection.confirmTransaction(sig, "confirmed");
      setStatus("Verifying memo on-chain…");
      return api<Goal & { verification: { memo_found: boolean } }>("/solana/devnet/goal-proof", { method: "POST", json: { goal_id: g.id, signature: sig } });
    },
    onSuccess: (r) => { setStatus(r.verification.memo_found ? "Verified ✓" : "Transaction found but memo did not match"); qc.invalidateQueries({ queryKey: ["goals"] }); },
    onError: () => setStatus(null),
  });
  return (
    <Card>
      <CardHeader><div><CardTitle className="flex items-center gap-2"><Fingerprint className="size-4 text-invest" /> Commit to a savings goal on Solana Devnet</CardTitle>
        <CardDescription>Only a salted SHA-256 hash goes on-chain via the SPL Memo program, signed by your wallet. Goal details stay private. This records <i>when</i> you committed — it does not prove you hold savings.</CardDescription></div></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div><Label htmlFor="gname">Goal name</Label><Input id="gname" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></div>
          <div className="self-end"><Button onClick={() => create.mutate()} disabled={!target || create.isPending}>Create goal ({money(target)})</Button></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-2">Wallet must be on <b>Devnet</b>. Need fees?</span>
          <Button size="sm" variant="outline" disabled={!connected || airdrop.isPending} onClick={() => airdrop.mutate()}>{airdrop.isPending && <Spinner />} Request 0.2 devnet SOL</Button>
          <a className="underline" href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer">faucet.solana.com</a>
          {airdrop.isSuccess && <Badge tone="good">airdrop confirmed</Badge>}
          {airdrop.error && <span className="text-bad">{(airdrop.error as Error).message.slice(0, 120)}</span>}
        </div>
        <ul className="space-y-2">{goals.data?.items.map((g) => (
          <li key={g.id} className="rounded-xl border border-line p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{g.name} · {money(g.target_amount)}</p>
              {g.devnet_verified ? <Badge tone="good"><ShieldCheck /> On-chain verified</Badge> : g.devnet_signature ? <Badge tone="warn">signature unverified</Badge> : <Badge>not recorded</Badge>}</div>
            <p className="mt-1 break-all font-mono text-[0.625rem] text-ink-3">{g.memo}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {!g.devnet_verified && <Button size="sm" disabled={!connected || record.isPending} onClick={() => record.mutate(g)}>{record.isPending && <Spinner />} Sign & record on Devnet</Button>}
              {g.explorer_url && <a href={g.explorer_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-tangerine">View on Solana Explorer <ExternalLink className="size-3" /></a>}
            </div>
          </li>
        ))}</ul>
        {status && <p className="text-xs font-semibold text-ink-2">{status}</p>}
        {record.error && <ErrorState error={record.error} />}
      </CardContent>
    </Card>
  );
}

export default function SolanaApp() {
  const accountId = useAccount();
  const [walletValue, setWalletValue] = useState<number | null>(null);
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC || clusterApiUrl("devnet");
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect={false}>
        <WalletModalProvider>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-6"><SolanaWalletPanel onValue={setWalletValue} /><CryptoShockSimulator accountId={accountId} walletValue={walletValue} key={String(walletValue)} /></div>
            <div>{accountId ? <GoalProof accountId={accountId} /> : <Card className="p-6 text-sm text-ink-2">Select a customer to create a savings-goal commitment.</Card>}</div>
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
