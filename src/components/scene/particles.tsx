type Vars = React.CSSProperties & Record<`--${string}`, string>;

const PETALS = [
  { x: 4, size: 11, dur: 15, delay: -3, sway: 26, swayDur: 4.4 },
  { x: 13, size: 8, dur: 18, delay: -11, sway: 18, swayDur: 3.6 },
  { x: 22, size: 12, dur: 13, delay: -7, sway: 30, swayDur: 5 },
  { x: 31, size: 9, dur: 17, delay: -1, sway: 22, swayDur: 4 },
  { x: 40, size: 10, dur: 16, delay: -13, sway: 28, swayDur: 4.8 },
  { x: 49, size: 7, dur: 20, delay: -5, sway: 16, swayDur: 3.4 },
  { x: 58, size: 12, dur: 14, delay: -9, sway: 32, swayDur: 5.2 },
  { x: 66, size: 9, dur: 19, delay: -15, sway: 20, swayDur: 3.8 },
  { x: 74, size: 11, dur: 15, delay: -2, sway: 26, swayDur: 4.6 },
  { x: 82, size: 8, dur: 17, delay: -12, sway: 18, swayDur: 3.5 },
  { x: 89, size: 10, dur: 13, delay: -6, sway: 24, swayDur: 4.2 },
  { x: 96, size: 9, dur: 18, delay: -16, sway: 20, swayDur: 4 },
];

const TWINKLES = [
  { x: 5, y: 44, size: 9, dur: 2.6, delay: -0.4 },
  { x: 48, y: 4, size: 6, dur: 3.2, delay: -1.8 },
  { x: 28, y: 34, size: 7, dur: 2.2, delay: -1 },
  { x: 41, y: 16, size: 10, dur: 3.6, delay: -2.4 },
  { x: 52, y: 42, size: 6, dur: 2.8, delay: -0.6 },
  { x: 60, y: 7, size: 8, dur: 3, delay: -2 },
  { x: 71, y: 28, size: 7, dur: 2.4, delay: -1.2 },
  { x: 79, y: 48, size: 9, dur: 3.4, delay: -2.8 },
  { x: 88, y: 20, size: 6, dur: 2.6, delay: -0.2 },
  { x: 13, y: 52, size: 7, dur: 3.1, delay: -1.5 },
  { x: 35, y: 58, size: 6, dur: 2.5, delay: -2.2 },
  { x: 93, y: 38, size: 8, dur: 2.9, delay: -0.9 },
];

const MOTES = [
  { x: 6, y: 82, size: 4, dur: 9, delay: -2, dx: 24, dy: -60 },
  { x: 15, y: 64, size: 3, dur: 11, delay: -6, dx: -18, dy: -44 },
  { x: 24, y: 90, size: 5, dur: 10, delay: -4, dx: 30, dy: -70 },
  { x: 33, y: 72, size: 3, dur: 12, delay: -9, dx: -26, dy: -50 },
  { x: 45, y: 86, size: 4, dur: 9.5, delay: -1, dx: 20, dy: -64 },
  { x: 56, y: 68, size: 3, dur: 11.5, delay: -7, dx: -22, dy: -40 },
  { x: 64, y: 93, size: 5, dur: 10.5, delay: -3, dx: 28, dy: -76 },
  { x: 73, y: 76, size: 4, dur: 12.5, delay: -8, dx: -30, dy: -56 },
  { x: 82, y: 60, size: 3, dur: 9, delay: -5, dx: 16, dy: -42 },
  { x: 90, y: 84, size: 4, dur: 11, delay: -10, dx: -20, dy: -62 },
  { x: 97, y: 70, size: 3, dur: 10, delay: -2.5, dx: -14, dy: -48 },
];

export function Petals() {
  return (
    <div className="scene-particles absolute inset-0">
      {PETALS.map((p) => (
        <div
          key={p.x}
          className="scene-drop"
          style={{ left: `${p.x}%`, "--dur": `${p.dur}s`, "--delay": `${p.delay}s` } as Vars}
        >
          <div
            className="scene-petal"
            style={{ "--size": `${p.size}px`, "--sway": `${p.sway}px`, "--sway-dur": `${p.swayDur}s` } as Vars}
          />
        </div>
      ))}
    </div>
  );
}

export function Twinkles({ shooting = false }: { shooting?: boolean }) {
  return (
    <div className="scene-particles absolute inset-0">
      {TWINKLES.map((t) => (
        <div
          key={`${t.x}-${t.y}`}
          className="scene-twinkle scene-sparkle"
          style={{ left: `${t.x}%`, top: `${t.y}%`, "--size": `${t.size}px`, "--dur": `${t.dur}s`, "--delay": `${t.delay}s` } as Vars}
        />
      ))}
      {shooting && (
        <>
          <div className="scene-shoot" style={{ left: "78%", top: "10%", "--dur": "9s", "--delay": "-3s" } as Vars} />
          <div className="scene-shoot" style={{ left: "46%", top: "4%", "--dur": "13s", "--delay": "-9s" } as Vars} />
        </>
      )}
    </div>
  );
}

export function Motes() {
  return (
    <div className="scene-particles absolute inset-0">
      {MOTES.map((m) => (
        <div
          key={m.x}
          className="scene-mote"
          style={{
            left: `${m.x}%`,
            top: `${m.y}%`,
            "--size": `${m.size}px`,
            "--dur": `${m.dur}s`,
            "--delay": `${m.delay}s`,
            "--dx": `${m.dx}px`,
            "--dy": `${m.dy}px`,
          } as Vars}
        />
      ))}
    </div>
  );
}
