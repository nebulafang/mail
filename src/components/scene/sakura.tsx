import { Petals } from "./particles";
import { Cloud, Orb } from "./shapes";

const PETAL = "M0 0C-4.6-2.6-6.2-9.4-2.6-12.6L0-10.8L2.6-12.6C6.2-9.4 4.6-2.6 0 0Z";
const ANGLES = [0, 72, 144, 216, 288];

const LIMBS: [d: string, width: number][] = [
  ["M340 12C292 22 246 42 200 70", 11],
  ["M200 70C160 92 120 112 70 128", 7],
  ["M70 128C55 133 40 141 22 154", 4],
  ["M234 52C228 88 238 120 262 150", 5],
  ["M262 150C270 164 272 178 270 196", 3],
  ["M152 98C142 120 132 150 136 184", 4],
  ["M110 114C100 96 96 82 98 60", 3],
  ["M292 22C296 50 292 76 284 96", 3],
  ["M206 66C204 52 204 42 206 30", 2.5],
];

const BLOSSOMS: [x: number, y: number, scale: number, rotate: number][] = [
  [30, 150, 1.1, 10],
  [58, 128, 1.3, 40],
  [86, 122, 1, 15],
  [100, 66, 1.1, 60],
  [112, 90, 0.9, 25],
  [134, 178, 1.2, 5],
  [144, 142, 1, 50],
  [170, 84, 1.25, 30],
  [192, 110, 0.9, 70],
  [214, 60, 1.1, 20],
  [262, 150, 1.3, 45],
  [268, 190, 1, 10],
  [246, 120, 1, 35],
  [250, 34, 1.2, 55],
  [292, 38, 1, 15],
  [206, 32, 0.85, 40],
  [122, 112, 0.8, 0],
  [284, 96, 1.1, 25],
];

const BUDS: [x: number, y: number][] = [
  [20, 158],
  [74, 136],
  [96, 56],
  [140, 190],
  [274, 202],
  [226, 72],
];

function Blossom({ x, y, scale, rotate, alt }: { x: number; y: number; scale: number; rotate: number; alt: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <g className={alt ? "fill-(--scene-blossom-2)" : "fill-(--scene-blossom)"}>
        {ANGLES.map((a) => (
          <path key={a} d={PETAL} transform={`rotate(${a})`} />
        ))}
      </g>
      <circle r="2.2" className="fill-(--scene-blossom-core)" />
    </g>
  );
}

function Branch() {
  return (
    <svg viewBox="0 0 320 260" className="absolute top-0 right-0 w-[min(58cqmin,360px)]">
      <g className="fill-none stroke-(--scene-branch)" strokeLinecap="round">
        {LIMBS.map(([d, width]) => (
          <path key={d} d={d} strokeWidth={width} />
        ))}
      </g>
      <g className="fill-(--scene-blossom)">
        {BUDS.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="3.2" />
        ))}
      </g>
      {BLOSSOMS.map(([x, y, scale, rotate], i) => (
        <Blossom key={`${x}-${y}`} x={x} y={y} scale={scale} rotate={rotate} alt={i % 3 === 1} />
      ))}
    </svg>
  );
}

function Torii({ style }: { style: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 60 50" className="absolute fill-(--scene-accent)" style={style}>
      <path d="M1 7Q30 1 59 7L58 12Q30 7 2 12Z" />
      <rect x="8" y="17" width="44" height="3.5" />
      <rect x="13" y="10" width="4.5" height="40" />
      <rect x="42.5" y="10" width="4.5" height="40" />
      <rect x="28" y="11" width="4" height="7" />
    </svg>
  );
}

export function SakuraArt({ still }: { still: boolean }) {
  return (
    <>
      <Orb size="20cqmin" style={{ top: "5cqh", right: "14cqw" }} />
      <Cloud style={{ top: "30cqh", left: "-14cqw", width: "min(64cqw, 60cqh)" }} />
      <Cloud flip style={{ top: "50cqh", right: "-18cqw", width: "min(56cqw, 52cqh)" }} />
      <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[34cqh] w-full">
        <path className="fill-(--scene-far)" d="M0 58C50 30 96 26 142 46S232 70 284 40S372 22 400 36V100H0Z" />
      </svg>
      <Torii style={{ bottom: "24.5cqh", right: "12cqw", width: "9cqmin" }} />
      <svg viewBox="0 0 400 60" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[14cqh] w-full">
        <path className="fill-(--scene-near)" d="M0 28C70 8 130 6 196 22S320 40 400 14V60H0Z" />
      </svg>
      <Branch />
      {!still && <Petals />}
    </>
  );
}
