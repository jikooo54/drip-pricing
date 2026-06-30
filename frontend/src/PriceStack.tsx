import { useEffect, useRef } from "react";

export interface StackSeg {
  label: string;
  amount: number;
}

interface PriceStackProps {
  advertised: number;
  fees: StackSeg[];
  symbol: string;
  /** verdict tone drives the hidden-fee color: cyan = clean, amber = minor, magenta = deceptive */
  tone: "clean" | "minor" | "alert";
}

const TONES = {
  clean: "#4ade80",
  minor: "#fbbf24",
  alert: "#fb5070",
} as const;

// Price-stack chart colors per the brief: advertised reads teal, the hidden
// fees stack in amber + violet, and the all-in marker is highlighted green.
const ADV_TOP = "#2dd4bf";
const ADV_BOT = "#0e7d68";
const HIDDEN_A = "#fbbf24"; // amber
const HIDDEN_B = "#a78bfa"; // violet
const ALLIN = "#4ade80"; // bright accent green

function prefersReduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/**
 * Hand-rolled canvas-2D vertical stacked bar. The advertised price is drawn on
 * the very first frame (always visible); the hidden fees then grow upward and
 * stack on top, building toward the all-in total. requestAnimationFrame driven,
 * ResizeObserver aware, with explicit cleanup and reduced-motion support.
 */
export function PriceStack({ advertised, fees, symbol, tone }: PriceStackProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let start = 0;
    const reduced = prefersReduced();
    const DURATION = 1300;

    const hiddenTotal = fees.reduce((a, f) => a + Math.max(0, f.amount), 0);
    const grandTotal = Math.max(advertised + hiddenTotal, 1);
    const verdictAccent = TONES[tone];

    function fmt(n: number) {
      return symbol + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }

    function draw(progress: number) {
      const c = canvas!;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = c.clientWidth || 360;
      const cssH = c.clientHeight || 320;
      if (c.width !== Math.round(cssW * dpr) || c.height !== Math.round(cssH * dpr)) {
        c.width = Math.round(cssW * dpr);
        c.height = Math.round(cssH * dpr);
      }
      const g = ctx!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cssW, cssH);

      const padTop = 26;
      const padBot = 30;
      const axisX = 58;
      const barW = Math.min(120, cssW - axisX - 150);
      const barX = axisX + 18;
      const plotH = cssH - padTop - padBot;
      const baseY = cssH - padBot;

      // grid lines
      g.strokeStyle = "rgba(226,232,240,0.05)";
      g.lineWidth = 1;
      g.font = "500 10px 'JetBrains Mono', monospace";
      g.textBaseline = "middle";
      for (let i = 0; i <= 4; i++) {
        const y = padTop + (plotH * i) / 4;
        g.beginPath();
        g.moveTo(axisX, y);
        g.lineTo(cssW - 16, y);
        g.stroke();
        const val = grandTotal * (1 - i / 4);
        g.fillStyle = "rgba(162,162,162,0.6)";
        g.textAlign = "right";
        g.fillText(fmt(val), axisX - 8, y);
      }

      const pxPerUnit = plotH / grandTotal;

      // verdict-tinted baseline rule under the bar
      g.strokeStyle = verdictAccent;
      g.globalAlpha = 0.45;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(axisX, baseY + 0.5);
      g.lineTo(cssW - 16, baseY + 0.5);
      g.stroke();
      g.globalAlpha = 1;

      // advertised segment (always full, visible on first frame)
      const advH = advertised * pxPerUnit;
      const advY = baseY - advH;
      const advGrad = g.createLinearGradient(0, advY, 0, baseY);
      advGrad.addColorStop(0, ADV_TOP);
      advGrad.addColorStop(1, ADV_BOT);
      g.fillStyle = advGrad;
      roundRect(g, barX, advY, barW, advH, 3);
      g.fill();
      g.save();
      g.shadowColor = "rgba(45,212,191,0.45)";
      g.shadowBlur = 16;
      g.fillRect(barX, advY, barW, 2);
      g.restore();

      // hidden fee segments stacking upward, animated by progress
      let cursorY = advY;
      const animatedHidden = hiddenTotal * progress;
      let remaining = animatedHidden;
      for (let i = 0; i < fees.length; i++) {
        if (remaining <= 0) break;
        const segVal = Math.min(fees[i].amount, remaining);
        const segH = segVal * pxPerUnit;
        const segY = cursorY - segH;
        const shade = i % 2 === 0 ? HIDDEN_A : HIDDEN_B;
        const grad = g.createLinearGradient(0, segY, 0, cursorY);
        grad.addColorStop(0, shade);
        grad.addColorStop(1, i % 2 === 0 ? "#d99a16" : "#8b6ad6");
        g.fillStyle = grad;
        roundRect(g, barX, segY, barW, segH, 2);
        g.fill();
        // separator
        g.strokeStyle = "rgba(18,18,18,0.9)";
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(barX, cursorY);
        g.lineTo(barX + barW, cursorY);
        g.stroke();
        cursorY = segY;
        remaining -= segVal;
      }

      // glow cap on top of the growing stack: the all-in line, highlighted green
      g.save();
      g.shadowColor = ALLIN;
      g.shadowBlur = 22;
      g.fillStyle = ALLIN;
      g.fillRect(barX, cursorY - 1, barW, 2.5);
      g.restore();

      // labels: advertised baseline marker
      g.textAlign = "left";
      g.fillStyle = ADV_TOP;
      g.font = "700 11px 'JetBrains Mono', monospace";
      g.fillText("ADVERTISED " + fmt(advertised), barX + barW + 14, advY + advH / 2);

      // all-in marker (appears as the stack approaches the top), green highlight
      const allInY = baseY - grandTotal * pxPerUnit;
      const allInAlpha = Math.min(1, progress * 1.4);
      g.globalAlpha = allInAlpha;
      g.fillStyle = ALLIN;
      g.font = "800 12px 'JetBrains Mono', monospace";
      g.fillText("ALL-IN " + fmt(advertised + animatedHidden), barX + barW + 14, allInY + 8);
      g.strokeStyle = ALLIN;
      g.lineWidth = 1;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(barX, allInY);
      g.lineTo(barX + barW, allInY);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    }

    function frame(ts: number) {
      if (!start) start = ts;
      const elapsed = ts - start;
      const t = Math.min(1, elapsed / DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      draw(eased);
      if (t < 1) raf = requestAnimationFrame(frame);
    }

    // first frame is always visible
    draw(reduced ? 1 : 0);
    if (!reduced) raf = requestAnimationFrame(frame);

    const ro = new ResizeObserver(() => draw(reduced ? 1 : 1));
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [advertised, fees, symbol, tone]);

  return <canvas ref={canvasRef} className="stack-canvas" aria-hidden="true" />;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}
