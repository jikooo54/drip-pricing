# Allin — Drip-Pricing Detector

**Does the checkout price match the sticker price?**

Allin is a GenLayer StudioNet contract that exposes drip pricing — the hidden
fees stacked on top of the advertised price. A decentralised panel of validators
reads the submitted checkout evidence, performs a two-pass analysis (hidden-fee
magnitude + dark-pattern classification), and locks a transparency verdict
on-chain.

---

## The Audit Lifecycle

An audit progresses through three phases:

```
FILED → ANALYSED → CLAIMED
```

| Phase | What happens |
|-------|-------------|
| **FILED** | Shopper files a checkout receipt: merchant name, slug, checkout text. |
| **ANALYSED** | Validators extract hidden-fee percentage and classify the dark pattern. |
| **CLAIMED** | Drip-priced shopper draws compensation from the pool. |

---

## Verdict Thresholds

| Verdict | Hidden Fee % | Meaning |
|---------|-------------|---------|
| **TRANSPARENT** | ≤ 3% | Checkout is honest. |
| **MINOR** | 4–15% | Small hidden fees detected. |
| **DECEPTIVE** | > 15% | Significant drip pricing. |

---

## Dark-Pattern Taxonomy

| Pattern | Description |
|---------|-------------|
| RESORT_FEE | Hidden resort/facility fee |
| JUNK_PROCESSING | Bogus processing/handling fee |
| LAST_STEP_TAX | Tax added only at final step |
| MANDATORY_GRATUITY | Forced gratuity/tip |
| SHIPPING_SURPRISE | Unexpected shipping surcharge |
| MISC_SURCHARGE | Other hidden surcharge |

---

## The Contract

`backend/drip-pricing.py` — a GenLayer Python contract.

- 3-phase state machine
- Two-pass LLM analysis via `gl.nondet.exec_prompt`
- EWMA transparency score per merchant
- Watchlist for repeat offenders
- Compensation pool for drip-priced shoppers

### View functions

| View | Returns |
|------|---------|
| `get_ticket(id)` | Full audit record |
| `get_counts()` | Global counters |
| `get_pool_balance()` | Compensation pool balance |
| `list_all(limit)` | All audits |

---

## The Frontend

React 18 + TypeScript + Vite, styled with a dark palette.

- **Hero3D** — animated 3D visual
- **PriceStack** — visual fee breakdown
- **PriceTicker** — live price animation
- **Receipt parser** — extracts advertised price + hidden fees
- **Wallet integration** — RainbowKit + wagmi + genlayer-js

### Build & dev

```bash
cd frontend
npm install
npm run dev        # Vite dev server on port 5380
npm run build      # tsc -b && vite build → dist/
```

---

## Deploy (GitHub Pages)

A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds the frontend
and publishes `frontend/dist/` to GitHub Pages on every push to `main`.

**Once deployed, the app is live at:**

```
https://jikooo54.github.io/drip-pricing/
```

---

## Contract Address

**`0xc4d31075aca0DDF0A14a06c0d34CF2922703b947`** on GenLayer StudioNet
(chain ID 61999).

- Explorer: https://explorer-studio.genlayer.com/address/0xc4d31075aca0DDF0A14a06c0d34CF2922703b947
- RPC: https://studio.genlayer.com/api
