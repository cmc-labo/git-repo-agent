// トップページ用: 白ベースに細い線の格子と、斜めに走る線だけの控えめな背景 (装飾のみ)
const LINES = [
  { x1: "0%", y1: "92%", x2: "45%", y2: "8%", cls: "" },
  { x1: "55%", y1: "100%", x2: "100%", y2: "30%", cls: "geo-draw-2" },
  { x1: "30%", y1: "0%", x2: "95%", y2: "95%", cls: "geo-draw-3" },
  { x1: "0%", y1: "35%", x2: "70%", y2: "100%", cls: "geo-draw-4" },
  { x1: "62%", y1: "0%", x2: "100%", y2: "60%", cls: "geo-draw-5" },
];

export default function GeoBackground() {
  return (
    <div className="geo-bg" aria-hidden>
      <div className="geo-lattice" />
      <svg className="geo-svg" width="100%" height="100%">
        {LINES.map((l, i) => (
          <line key={i} className={`geo-draw ${l.cls}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
        ))}
      </svg>
    </div>
  );
}
