import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { formatEther, parseEther } from "viem";
import {
  Receipt,
  Storefront,
  Scan,
  Gavel,
  Flag,
  Coins,
  ShieldCheck,
  Warning,
  WarningOctagon,
  Eye,
  Lightning,
  Plus,
  ArrowRight,
  Stack,
} from "@phosphor-icons/react";
import {
  fundPool,
  fileAudit,
  analyse,
  claimCompensation,
  getTicket,
  getCounts,
  getPoolBalance,
  listAll,
  TicketView,
  TicketRow,
} from "./contractService";
import { PriceStack, StackSeg } from "./PriceStack";
import { PriceTicker } from "./PriceTicker";
import { Hero3D } from "./Hero3D";
import { BgGeo } from "./BgGeo";

type Hex = `0x${string}`;
const STATUS_LABEL = ["filed", "analysed", "claimed"];

// Bespoke Allin mark: a price tag with an eyelet, holding an ascending price
// stack (advertised -> +fees -> all-in). Drawn in the bright accent green.
function AllinMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M6 7.2C6 6.54 6.54 6 7.2 6h10.74c.69 0 1.35.27 1.84.76l8.46 8.46a2.6 2.6 0 0 1 0 3.68l-9.34 9.34a2.6 2.6 0 0 1-3.68 0L6.76 19.78A2.6 2.6 0 0 1 6 17.94V7.2Z"
        fill="#006239"
        fillOpacity="0.4"
        stroke="#4ade80"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="11.6" cy="11.6" r="2.15" stroke="#4ade80" strokeWidth="1.8" />
      <g fill="#4ade80">
        <rect x="11.5" y="18.4" width="2.6" height="3.4" rx="0.7" fillOpacity="0.65" />
        <rect x="15.1" y="15.6" width="2.6" height="6.2" rx="0.7" fillOpacity="0.82" />
        <rect x="18.7" y="12.3" width="2.6" height="9.5" rx="0.7" />
      </g>
    </svg>
  );
}

function shortAddr(a: string): string {
  return a && a.length > 12 ? `${a.slice(0, 6)}\u2026${a.slice(-4)}` : a || "-";
}

function fmtMoney(n: number, sym: string): string {
  return sym + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtGen(wei: string): string {
  try {
    const g = Number(formatEther(BigInt(wei || "0")));
    return g.toLocaleString("en-US", { maximumFractionDigits: 3 });
  } catch {
    return "0";
  }
}

// ---------------------------------------------------------------------------
// Receipt parsing: turn raw checkout text into an advertised price plus the
// stacked hidden fees that build up to the all-in total.
// ---------------------------------------------------------------------------
interface Breakdown {
  symbol: string;
  advertised: number;
  fees: StackSeg[];
  hiddenTotal: number;
  allIn: number;
}

const FEE_RE =
  /(fee|charge|service|tax|tip|gratuity|surcharge|booking|convenience|processing|handling|delivery|shipping|resort|facility|cleaning|admin|fuel|airport|insurance|deposit)/i;
const BASE_RE = /(advertised|base|subtotal|sub-total|listed|list price|^price|fare|room rate|nightly|item price|sticker)/i;
const AMT_RE = /[$€£]?\s?(\d[\d,]*(?:\.\d{1,2})?)/;

function detectSymbol(t: string): string {
  if (t.includes("€")) return "€";
  if (t.includes("£")) return "£";
  return "$";
}

function toNum(s: string): number {
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function tidyLabel(s: string): string {
  const out = s.replace(/[:.\-\u2013\u2014]+$/, "").replace(/\s+/g, " ").trim();
  return out.length > 30 ? out.slice(0, 30) : out || "fee";
}

function parseReceipt(text: string, pct: number): Breakdown {
  const symbol = detectSymbol(text);
  const lines = text
    .split(/\r?\n|;|\u00b7|\|/)
    .map((l) => l.trim())
    .filter(Boolean);

  const fees: StackSeg[] = [];
  let advertised = NaN;

  for (const line of lines) {
    const m = line.match(AMT_RE);
    if (!m) continue;
    const amt = toNum(m[1]);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const isTotal = /total|all[-\s]?in|grand/i.test(line);
    const rawLabel = line.replace(AMT_RE, "").trim();

    if (FEE_RE.test(line) && !isTotal) {
      if (fees.length < 8) fees.push({ label: tidyLabel(rawLabel), amount: amt });
    } else if (!isTotal && (BASE_RE.test(line) || BASE_RE.test(rawLabel)) && !Number.isFinite(advertised)) {
      advertised = amt;
    }
  }

  // Fallback advertised: the first non-fee positive number.
  if (!Number.isFinite(advertised)) {
    for (const line of lines) {
      const m = line.match(AMT_RE);
      if (!m) continue;
      const amt = toNum(m[1]);
      if (Number.isFinite(amt) && amt > 0 && !FEE_RE.test(line) && !/total/i.test(line)) {
        advertised = amt;
        break;
      }
    }
  }

  if (!Number.isFinite(advertised) || advertised <= 0) advertised = 100;

  let hiddenTotal = fees.reduce((a, f) => a + f.amount, 0);

  // If no explicit fee lines were found, synthesize one from the verdict pct.
  if (fees.length === 0) {
    const h = pct > 0 ? (advertised * pct) / 100 : advertised * 0.18;
    fees.push({ label: "undisclosed fees", amount: Math.round(h * 100) / 100 });
    hiddenTotal = h;
  }

  return { symbol, advertised, fees, hiddenTotal, allIn: advertised + hiddenTotal };
}

function verdictTone(v: string): "clean" | "minor" | "alert" {
  if (v === "TRANSPARENT") return "clean";
  if (v === "MINOR") return "minor";
  return "alert";
}

// ---------------------------------------------------------------------------
// Demo sample ticket so the visuals populate when the chain is empty.
// ---------------------------------------------------------------------------
const DEMO_ID = -1;
const DEMO: TicketRow = {
  id: DEMO_ID,
  shopper: "0xDEMO000000000000000000000000000000000000",
  merchant: "Skyline Festival Tickets",
  checkoutText: `Advertised price: $89.00
General admission, 1 ticket

At checkout:
Service fee: $18.50
Facility charge: $9.00
Processing fee: $4.75
Order delivery fee: $5.25
Order total before tax: $126.50`,
  poolShare: "0",
  status: 1,
  verdict: "DECEPTIVE",
  hiddenFeePct: 42,
  darkPattern: "JUNK_PROCESSING",
  rationale:
    "The advertised $89.00 ticket reaches an all-in price of $126.50 once mandatory service, facility, processing and delivery fees appear at the final step. None were disclosed alongside the headline price, so the panel rules this checkout DECEPTIVE drip pricing.",
};

const VERDICTS: { v: string; label: string }[] = [
  { v: "TRANSPARENT", label: "Transparent" },
  { v: "MINOR", label: "Minor drip" },
  { v: "DECEPTIVE", label: "Deceptive" },
];

function VerdictBadge({ verdict }: { verdict: string }) {
  const v = verdict || "PENDING";
  const tone = verdict ? verdictTone(verdict) : "pending";
  const Icon =
    verdict === "TRANSPARENT" ? ShieldCheck : verdict === "MINOR" ? Warning : verdict === "DECEPTIVE" ? WarningOctagon : Eye;
  return (
    <span className={`vbadge t-${tone}`}>
      <Icon size={14} weight="fill" />
      {v}
    </span>
  );
}

export function App() {
  const { address, isConnected } = useAccount();
  const acct = address as Hex | undefined;

  const [rows, setRows] = useState<TicketRow[]>([]);
  const [counts, setCounts] = useState({ next: 0, analysed: 0, deceptive: 0, watchlist: 0 });
  const [pool, setPool] = useState("0");
  const [selId, setSelId] = useState<number | null>(null);
  const [sel, setSel] = useState<TicketView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [netErr, setNetErr] = useState(false);

  const [merchant, setMerchant] = useState("");
  const [checkoutText, setCheckoutText] = useState("");
  const [fundGen, setFundGen] = useState("");

  async function refreshAll() {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const [c, p, l] = await Promise.all([getCounts(), getPoolBalance(), listAll(80)]);
      setCounts(c);
      setPool(p);
      setRows(l);
      if (selId != null && selId >= 0) {
        try {
          setSel(await getTicket(selId));
        } catch {
          /* ignore */
        }
      }
      setNetErr(false);
    } catch {
      setNetErr(true);
    }
  }

  useEffect(() => {
    refreshAll();
    const t = setInterval(refreshAll, 12000);
    const onVis = () => {
      if (!document.hidden) refreshAll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickTicket(id: number) {
    if (id === DEMO_ID) {
      setSelId(DEMO_ID);
      setSel(null);
      return;
    }
    setSelId(id);
    try {
      setSel(await getTicket(id));
    } catch {
      setSel(null);
    }
  }

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setNote("");
    try {
      return await fn();
    } catch (e) {
      setNote(String((e as Error).message || e).slice(0, 220));
      return undefined;
    } finally {
      setBusy(null);
      refreshAll();
    }
  }

  async function onSubmit() {
    if (!acct) return;
    if (merchant.trim().length < 2) return setNote("Merchant name is required.");
    if (checkoutText.trim().length < 30) return setNote("Paste the full checkout, at least 30 characters.");
    const id = await run("Filing audit", () => fileAudit(acct, merchant, checkoutText));
    if (id != null) {
      setSelId(id);
      setMerchant("");
      setCheckoutText("");
      try {
        setSel(await getTicket(id));
      } catch {
        /* ignore */
      }
    }
  }

  async function onAnalyze() {
    if (!acct || selId == null || selId < 0) return;
    await run("Analysing checkout", () => analyse(acct, selId));
  }
  async function onClaim() {
    if (!acct || selId == null || selId < 0) return;
    await run("Claiming compensation", () => claimCompensation(acct, selId));
  }

  async function onFund() {
    if (!acct) return;
    const raw = fundGen.trim();
    if (!/^\d*\.?\d+$/.test(raw) || Number(raw) <= 0) return setNote("Enter a GEN amount, for example 1.5");
    let wei: bigint;
    try {
      wei = parseEther(raw as `${number}`);
    } catch {
      return setNote("That GEN amount could not be parsed.");
    }
    const ok = await run("Funding the pool", () => fundPool(acct, wei));
    if (ok !== undefined) setFundGen("");
  }

  // Active ticket drives the hero receipt. Falls back to first row, then demo.
  const activeTicket: TicketRow | TicketView | null = useMemo(() => {
    if (selId === DEMO_ID) return DEMO;
    if (sel) return sel;
    if (selId != null) {
      const r = rows.find((x) => x.id === selId);
      if (r) return r;
    }
    if (rows.length > 0) return rows[0];
    return DEMO;
  }, [sel, selId, rows]);

  const isDemo = activeTicket === DEMO;
  const activeStatus = activeTicket?.status ?? 0;
  const activeVerdict = activeTicket?.verdict ?? "";
  const activeId = isDemo ? DEMO_ID : selId != null && selId >= 0 ? selId : rows.length > 0 ? rows[0].id : DEMO_ID;

  const breakdown = useMemo(
    () => parseReceipt(activeTicket?.checkoutText ?? "", activeTicket?.hiddenFeePct ?? 0),
    [activeTicket]
  );

  // Hero hidden-fee percentage: contract value once analyzed, else derived.
  const derivedPct = breakdown.advertised > 0 ? (breakdown.hiddenTotal / breakdown.advertised) * 100 : 0;
  const heroPct = (activeTicket?.hiddenFeePct ?? 0) > 0 ? (activeTicket as TicketView).hiddenFeePct : Math.round(derivedPct);
  const tone = verdictTone(activeVerdict);

  const canAct = isConnected && !busy && !isDemo;

  return (
    <div className="app">
      <BgGeo />
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <AllinMark />
          </span>
          <span className="brand-name">
            All<span className="brand-in">in</span>
          </span>
          <span className="brand-tag">drip-pricing detector</span>
        </div>
        <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
      </header>

      <section className="hero">
        <Hero3D />
        <div className="hero-copy">
          <p className="eyebrow">
            <Lightning size={14} weight="fill" /> ON-CHAIN FEE FORENSICS / GENLAYER
          </p>
          <h1 className="hero-title">
            The price you see is not <span className="hl">the price you pay.</span>
          </h1>
          <p className="hero-sub">
            Allin reads a real online checkout, itemizes every fee that was not in the headline, and stacks them up to
            the true all-in price. Validators rule each checkout TRANSPARENT, MINOR, or DECEPTIVE.
          </p>
          <div className="stat-strip">
            <div className="stat">
              <Scan size={18} weight="bold" />
              <div>
                <span className="stat-n">{counts.next}</span>
                <span className="stat-l">checkouts</span>
              </div>
            </div>
            <div className="stat">
              <Gavel size={18} weight="bold" />
              <div>
                <span className="stat-n">{counts.analysed}</span>
                <span className="stat-l">analysed</span>
              </div>
            </div>
            <div className="stat">
              <WarningOctagon size={18} weight="bold" />
              <div>
                <span className="stat-n alert">{counts.deceptive}</span>
                <span className="stat-l">deceptive</span>
              </div>
            </div>
            <div className="stat">
              <Coins size={18} weight="bold" />
              <div>
                <span className="stat-n">{fmtGen(pool)}</span>
                <span className="stat-l">GEN pool</span>
              </div>
            </div>
          </div>
        </div>

        {/* HERO RECEIPT: price-breakdown stack */}
        <div className={`receipt-hero t-${tone}`}>
          <div className="receipt-head">
            <div className="r-merchant">
              <Storefront size={16} weight="fill" />
              <span>{activeTicket?.merchant || "Unknown merchant"}</span>
            </div>
            <VerdictBadge verdict={activeVerdict} />
          </div>

          <div className="receipt-body">
            <div className="receipt-paper">
              <div className="rp-title">
                <span>ITEMIZED CHECKOUT</span>
                <span className="rp-id">{isDemo ? "DEMO" : `#${String(activeId).padStart(4, "0")}`}</span>
              </div>
              <div className="rp-row adv">
                <span>Advertised price</span>
                <span className="rp-amt">{fmtMoney(breakdown.advertised, breakdown.symbol)}</span>
              </div>
              <div className="rp-divider" />
              <p className="rp-cap">Hidden fees revealed at checkout</p>
              <ul className="rp-fees">
                {breakdown.fees.map((f, i) => (
                  <li key={i} className="rp-row fee" style={{ animationDelay: `${0.12 * i + 0.1}s` }}>
                    <span className="fee-dot" />
                    <span className="fee-label">{f.label}</span>
                    <span className="rp-amt">+ {fmtMoney(f.amount, breakdown.symbol)}</span>
                  </li>
                ))}
              </ul>
              <div className="rp-divider dashed" />
              <div className="rp-row total">
                <span>ALL-IN PRICE</span>
                <PriceTicker
                  className="rp-amt allin"
                  from={breakdown.advertised}
                  to={breakdown.allIn}
                  symbol={breakdown.symbol}
                />
              </div>
              <div className="rp-perf" aria-hidden="true" />
            </div>

            <div className="receipt-viz">
              <div className="hero-pct">
                <span className="pct-label">HIDDEN FEES</span>
                <span className="pct-num">
                  {heroPct}
                  <span className="pct-sign">%</span>
                </span>
                <span className="pct-foot">
                  {breakdown.symbol}
                  {breakdown.hiddenTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })} on top of{" "}
                  {breakdown.symbol}
                  {breakdown.advertised.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <PriceStack
                advertised={breakdown.advertised}
                fees={breakdown.fees}
                symbol={breakdown.symbol}
                tone={tone}
              />
            </div>
          </div>

          <div className="receipt-actions">
            {isDemo ? (
              <p className="hint">
                <Eye size={14} weight="fill" /> Sample checkout. Connect a wallet and submit a real one below.
              </p>
            ) : activeStatus === 0 ? (
              <button className="btn primary" disabled={!canAct} onClick={onAnalyze}>
                <Scan size={16} weight="bold" /> Analyse checkout
              </button>
            ) : activeStatus === 1 && activeVerdict && activeVerdict !== "TRANSPARENT" ? (
              <button className="btn danger" disabled={!canAct} onClick={onClaim}>
                <Flag size={16} weight="fill" /> Claim compensation
              </button>
            ) : activeStatus === 2 ? (
              <p className="hint">
                <Coins size={14} weight="fill" /> Compensation claimed from the pool.
              </p>
            ) : (
              <p className="hint">
                <ShieldCheck size={14} weight="fill" /> Ruling final: {activeVerdict || "pending"}.
              </p>
            )}
          </div>

          {!isDemo && (activeTicket as TicketView)?.rationale ? (
            <div className="rationale">
              <p className="rat-label">PANEL RATIONALE</p>
              <p className="rat-text">{(activeTicket as TicketView).rationale}</p>
            </div>
          ) : null}
        </div>
      </section>

      {/* LEDGER: itemized receipt cards */}
      <section className="ledger">
        <div className="section-head">
          <h2>
            <Stack size={18} weight="bold" /> Checkout ledger
          </h2>
          <span className="section-meta">{netErr ? "reconnecting" : "live on studionet"}</span>
        </div>
        <div className="ledger-grid">
          {(rows.length === 0 ? [DEMO] : rows).map((r) => {
            const bd = parseReceipt(r.checkoutText, r.hiddenFeePct);
            const rTone = verdictTone(r.verdict);
            const rPct = r.hiddenFeePct > 0 ? r.hiddenFeePct : Math.round((bd.hiddenTotal / bd.advertised) * 100);
            const active = r.id === activeId;
            return (
              <button
                key={r.id}
                className={`led-card t-${rTone} ${active ? "active" : ""}`}
                onClick={() => pickTicket(r.id)}
                aria-label={`Open checkout ${r.merchant}`}
              >
                <div className="lc-top">
                  <span className="lc-merchant">
                    <Storefront size={14} weight="fill" /> {r.merchant || "Unknown"}
                  </span>
                  <VerdictBadge verdict={r.verdict} />
                </div>
                <div className="lc-prices">
                  <span className="lc-adv">{fmtMoney(bd.advertised, bd.symbol)}</span>
                  <ArrowRight size={14} weight="bold" className="lc-arrow" />
                  <span className="lc-allin">{fmtMoney(bd.allIn, bd.symbol)}</span>
                </div>
                <div className="lc-bar" aria-hidden="true">
                  <span className="lc-bar-adv" />
                  <span
                    className="lc-bar-hidden"
                    style={{ width: `${Math.min(80, (bd.hiddenTotal / bd.allIn) * 100)}%` }}
                  />
                </div>
                <div className="lc-foot">
                  <span className="lc-pct">+{rPct}% hidden</span>
                  <span className="lc-status">
                    {r.id === DEMO_ID ? "demo" : STATUS_LABEL[r.status]} / {shortAddr(r.shopper)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* CONSOLE: submit checkout + fund pool */}
      <section className="console">
        <div className="panel submit-panel">
          <div className="section-head">
            <h2>
              <Receipt size={18} weight="bold" /> Submit a checkout
            </h2>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <label htmlFor="merchant">Merchant</label>
            <input
              id="merchant"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="store, brand or domain"
              autoComplete="off"
            />
            <label htmlFor="checkout">Checkout text</label>
            <textarea
              id="checkout"
              value={checkoutText}
              onChange={(e) => setCheckoutText(e.target.value)}
              rows={6}
              placeholder={"Paste the cart: advertised price, then every fee, surcharge, tax and the final total."}
            />
            <button type="submit" className="btn primary wide" disabled={!isConnected || !!busy}>
              <Plus size={16} weight="bold" /> Submit for judgment
            </button>
          </form>
        </div>

        <div className="panel pool-panel">
          <div className="section-head">
            <h2>
              <Coins size={18} weight="bold" /> The pool
            </h2>
          </div>
          <div className="pool-balance">
            <span className="pb-num">{fmtGen(pool)}</span>
            <span className="pb-unit">GEN</span>
          </div>
          <p className="pool-note">
            The pool funds validator scans. Top it up so checkouts keep getting judged.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onFund();
            }}
          >
            <label htmlFor="fund">Amount in GEN</label>
            <input
              id="fund"
              value={fundGen}
              onChange={(e) => setFundGen(e.target.value)}
              placeholder="e.g. 1.5"
              inputMode="decimal"
              autoComplete="off"
            />
            <button type="submit" className="btn ghost wide" disabled={!isConnected || !!busy}>
              <ArrowRight size={16} weight="bold" /> Fund the pool
            </button>
          </form>
          <div className="legend">
            {VERDICTS.map((x) => (
              <span key={x.v} className={`legend-item t-${verdictTone(x.v)}`}>
                <span className="legend-dot" /> {x.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <footer className="foot">
        <span>Allin / drip-pricing detector on GenLayer studionet.</span>
        <span className={`net ${netErr ? "err" : "ok"}`}>{netErr ? "reconnecting" : "live"}</span>
      </footer>

      {(busy || note) && (
        <div className="toast" role="status">
          {busy ? `${busy}\u2026` : note}
        </div>
      )}
    </div>
  );
}
