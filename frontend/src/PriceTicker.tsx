import { useEffect, useRef, useState } from "react";

interface PriceTickerProps {
  from: number;
  to: number;
  symbol: string;
  className?: string;
}

function prefersReduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/**
 * Animated neon ticker that counts from the advertised price up to the all-in
 * price. requestAnimationFrame driven with cleanup; honors reduced motion by
 * snapping straight to the final value.
 */
export function PriceTicker({ from, to, symbol, className }: PriceTickerProps) {
  const [value, setValue] = useState(from);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduced = prefersReduced();
    if (reduced) {
      setValue(to);
      return;
    }
    let start = 0;
    const DURATION = 1300;
    const frame = (ts: number) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [from, to]);

  const text =
    symbol +
    value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return <span className={className}>{text}</span>;
}
