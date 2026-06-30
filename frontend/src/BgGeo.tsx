import { useEffect, useRef } from "react";

// Allin background: a faint equalizer of vertical price bars oscillating across
// the bottom + a slow rising scan line. Green on dark. Canvas-2D, rm-safe.
export function BgGeo() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0, raf = 0, t = 0;
    const resize = () => { W = window.innerWidth; H = window.innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); window.addEventListener("resize", resize);
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const bw = 26, gap = 44; const n = Math.ceil(W / gap) + 1;
      for (let i = 0; i < n; i++) {
        const x = i * gap;
        const h = (0.18 + 0.16 * (Math.sin(t * 0.6 + i * 0.5) * 0.5 + 0.5)) * H;
        ctx.fillStyle = i % 5 === 0 ? "rgba(249,115,98,0.05)" : "rgba(74,222,128,0.045)";
        ctx.fillRect(x, H - h, bw, h);
      }
      // rising scan line
      const y = H - ((t * 26) % H);
      ctx.strokeStyle = "rgba(74,222,128,0.10)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      if (!reduce) { t += 0.02; raf = requestAnimationFrame(draw); }
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="bg-geo" aria-hidden="true" />;
}
