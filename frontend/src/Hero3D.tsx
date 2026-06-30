import { useEffect, useRef } from "react";
import Zdog from "zdog";

// A 3D price stack: an advertised base, a hidden-fee block, and the all-in cap
// rising on top, with a coral "drip" marking the gap. Rotates gently, bleeds out.
const GREEN = "#4ade80";
const DEEP = "#0f7a45";
const CORAL = "#f97362";
const DIM = "#1d4a33";

export function Hero3D() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const illo = new Zdog.Illustration({ element: el, zoom: 1, resize: true });
    const stack = new Zdog.Anchor({ addTo: illo, rotate: { x: -0.62, y: -0.72 } });
    const w = 96;
    // base (advertised)
    new Zdog.Box({ addTo: stack, width: w, height: w, depth: 44, stroke: 3, color: DEEP, leftFace: DIM, rightFace: DIM, topFace: GREEN, translate: { y: 60 } });
    // hidden fee block
    new Zdog.Box({ addTo: stack, width: w, height: w, depth: 34, stroke: 3, color: "#b8462f", leftFace: "#7a2d1f", rightFace: "#7a2d1f", topFace: CORAL, translate: { y: 10 } });
    // all-in cap
    new Zdog.Box({ addTo: stack, width: w, height: w, depth: 22, stroke: 3, color: DEEP, leftFace: DIM, rightFace: DIM, topFace: GREEN, translate: { y: -34 } });
    // floating spark
    new Zdog.Shape({ addTo: stack, path: [{}], stroke: 14, color: GREEN, translate: { x: 80, y: -60, z: 30 } });

    let raf = 0; let t = 0;
    const tick = () => {
      t += 0.018; illo.rotate.y = -0.72 + Math.sin(t) * 0.45;
      illo.updateRenderGraph();
      if (!reduce) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="hero3d" aria-hidden="true" />;
}
