// トップページ用: 白ベースに細い線の幾何学模様がゆっくり動く背景 (装飾のみ)
const SHAPES = [
  { d: "M0,-60 L52,-30 L52,30 L0,60 L-52,30 L-52,-30 Z", x: "12%", y: "22%", cls: "geo-float-a" }, // 六角形
  { d: "M0,-46 L40,23 L-40,23 Z", x: "86%", y: "18%", cls: "geo-float-b" }, // 三角形
  { d: "M-34,-34 L34,-34 L34,34 L-34,34 Z", x: "78%", y: "72%", cls: "geo-float-c" }, // 正方形
  { d: "M0,-38 L36,-12 L22,31 L-22,31 L-36,-12 Z", x: "20%", y: "80%", cls: "geo-float-b" }, // 五角形
  { d: "M0,-70 L61,35 L-61,35 Z", x: "52%", y: "50%", cls: "geo-float-c geo-faint" }, // 大きい三角形
];

export default function GeoBackground() {
  return (
    <div className="geo-bg" aria-hidden>
      <div className="geo-lattice" />
      <svg className="geo-svg" width="100%" height="100%">
        {SHAPES.map((s, i) => (
          <svg key={i} x={s.x} y={s.y} overflow="visible">
            <g className={`geo-shape ${s.cls}`}>
              <path d={s.d} />
            </g>
          </svg>
        ))}
        <line className="geo-draw" x1="0%" y1="92%" x2="45%" y2="8%" />
        <line className="geo-draw geo-draw-2" x1="55%" y1="100%" x2="100%" y2="30%" />
        <line className="geo-draw geo-draw-3" x1="30%" y1="0%" x2="95%" y2="95%" />
      </svg>
    </div>
  );
}
