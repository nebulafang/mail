import { Twinkles } from "./particles";
import { Crescent, StarField } from "./shapes";

const BUILDINGS: [x: number, w: number, h: number][] = [
  [0, 22, 34],
  [20, 16, 46],
  [34, 24, 30],
  [56, 14, 52],
  [68, 26, 38],
  [92, 18, 58],
  [108, 22, 42],
  [128, 30, 34],
  [156, 16, 50],
  [170, 24, 40],
  [192, 12, 62],
  [202, 28, 36],
  [228, 20, 48],
  [246, 26, 32],
  [270, 14, 54],
  [282, 24, 40],
  [304, 18, 46],
  [320, 30, 30],
  [348, 16, 56],
  [362, 22, 38],
  [382, 18, 44],
];

const WINDOWS = BUILDINGS.flatMap(([x, w, h], i) =>
  [6, 14, 22, 30]
    .filter((row, j) => row < h - 16 && (i + j) % 3 !== 0)
    .map((row, j) => ({ x: j % 2 ? x + w - 6 : x + 3, y: 80 - h + row })),
);

const SPARKLES = [
  { left: "54%", top: "13%", size: "2.6cqmin" },
  { left: "90%", top: "34%", size: "2.2cqmin" },
  { left: "8%", top: "36%", size: "1.8cqmin" },
  { left: "38%", top: "50%", size: "2.4cqmin" },
  { left: "72%", top: "60%", size: "1.6cqmin" },
];

function City() {
  return (
    <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[20cqh] w-full">
      <g className="fill-(--scene-far)">
        {BUILDINGS.map(([x, w, h]) => (
          <rect key={x} x={x} y={80 - h} width={w} height={h} />
        ))}
        <rect x="197" y="8" width="2" height="12" />
      </g>
      <g className="fill-(--scene-accent)">
        {WINDOWS.map((win) => (
          <rect key={`${win.x}-${win.y}`} x={win.x} y={win.y} width="3" height="4" />
        ))}
      </g>
      <path className="fill-(--scene-near)" d="M0 64C60 54 120 58 180 66S320 72 400 60V80H0Z" />
    </svg>
  );
}

export function StarryArt({ still }: { still: boolean }) {
  return (
    <>
      <StarField />
      <div
        className="absolute"
        style={{
          left: "-30cqw",
          top: "4cqh",
          width: "160cqw",
          height: "46cqmin",
          rotate: "-24deg",
          background: "radial-gradient(ellipse closest-side, var(--scene-band), transparent)",
        }}
      />
      <Crescent size="15cqmin" style={{ top: "9cqh", right: "13cqw" }} />
      {SPARKLES.map((s) => (
        <div
          key={s.left}
          className="scene-sparkle absolute bg-(--scene-particle)"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size }}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 h-[42cqh] bg-[radial-gradient(ellipse_90%_100%_at_50%_100%,var(--scene-horizon),transparent)]" />
      <City />
      {!still && <Twinkles shooting />}
    </>
  );
}
