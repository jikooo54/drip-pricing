import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS } from "./chain";

type Hex = `0x${string}`;
const TIMEOUT_MS = 240_000;

export type Verdict = "TRANSPARENT" | "MINOR" | "DECEPTIVE" | "";

// status: 0 FILED, 1 ANALYSED, 2 CLAIMED
export interface TicketView {
  shopper: string;
  merchant: string;        // merchant slug
  checkoutText: string;
  poolShare: string;       // compensation paid
  status: number;
  verdict: Verdict;
  hiddenFeePct: number;
  darkPattern: string;
  rationale: string;
}
export interface TicketRow extends TicketView { id: number; }
export interface MerchantRating { slug: string; displayName: string; audits: number; deceptive: number; transparencyScore: number; lastVerdict: string; lastPattern: string; watchlisted: boolean; }

function readClient() { return createClient({ chain: studionet, account: createAccount() }); }
function writeClient(account: Hex) { return createClient({ chain: studionet, account }); }
async function waitAccepted(client: any, hash: Hex) { let timer: ReturnType<typeof setTimeout> | undefined; const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Transaction timed out")), TIMEOUT_MS); }); try { await Promise.race([client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 64 }), timeout]); } finally { if (timer) clearTimeout(timer); } }
function pick(obj: any, key: string, idx: number): any { if (obj == null) return undefined; if (Array.isArray(obj)) return obj[idx]; if (typeof obj === "object" && key in obj) return obj[key]; return undefined; }
async function send(account: Hex, fn: string, args: any[], value: bigint = 0n): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({ address: CONTRACT_ADDRESS as Hex, functionName: fn, args, value })) as Hex;
  await waitAccepted(wc, h);
}

export async function fundPool(account: Hex, wei: bigint): Promise<void> { await send(account, "fund_pool", [], wei); }
export async function fileAudit(account: Hex, merchant: string, text: string): Promise<number> {
  await send(account, "file_audit", [merchant.trim(), merchant.trim(), text.trim()]);
  const c = await getCounts(); return c.next - 1;
}
export async function analyse(account: Hex, id: number): Promise<void> { await send(account, "analyse", [id]); }
export async function claimCompensation(account: Hex, id: number): Promise<void> { await send(account, "claim_compensation", [id]); }

export async function getTicket(id: number): Promise<TicketView> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_audit", args: [id] });
  return {
    shopper: String(pick(r, "shopper", 0) ?? ""),
    merchant: String(pick(r, "merchant_slug", 1) ?? ""),
    checkoutText: String(pick(r, "checkout_text", 2) ?? ""),
    poolShare: String(pick(r, "compensation", 3) ?? "0"),
    status: Number(pick(r, "status", 4) ?? 0),
    verdict: String(pick(r, "verdict", 5) ?? "") as Verdict,
    darkPattern: String(pick(r, "dark_pattern", 6) ?? ""),
    hiddenFeePct: Number(pick(r, "hidden_fee_pct", 7) ?? 0),
    rationale: String(pick(r, "rationale", 8) ?? ""),
  };
}
export async function getMerchant(slug: string): Promise<MerchantRating> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_merchant", args: [slug] });
  return {
    slug: String(pick(r, "slug", 0) ?? ""),
    displayName: String(pick(r, "display_name", 1) ?? ""),
    audits: Number(pick(r, "audits", 2) ?? 0),
    deceptive: Number(pick(r, "deceptive", 3) ?? 0),
    transparencyScore: Number(pick(r, "transparency_score", 4) ?? 0),
    lastVerdict: String(pick(r, "last_verdict", 5) ?? ""),
    lastPattern: String(pick(r, "last_pattern", 6) ?? ""),
    watchlisted: Boolean(pick(r, "watchlisted", 7) ?? false),
  };
}
export async function getCounts(): Promise<{ next: number; analysed: number; deceptive: number; watchlist: number }> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_counts", args: [] });
  const p = String(r).split("||").map((x) => Number(x) || 0);
  return { next: p[0] || 0, analysed: p[1] || 0, deceptive: p[2] || 0, watchlist: p[3] || 0 };
}
export async function getPoolBalance(): Promise<string> { const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_pool_balance", args: [] }); return String(r ?? "0"); }
export async function listAll(maxRows = 80): Promise<TicketRow[]> {
  const { next } = await getCounts(); if (next === 0) return [];
  const ids: number[] = []; for (let i = next - 1; i >= 0 && i >= next - maxRows; i--) ids.push(i);
  const rows = await Promise.all(ids.map(async (id) => { try { const c = await getTicket(id); return { id, ...c }; } catch { return null; } }));
  return rows.filter((r): r is TicketRow => r !== null);
}
