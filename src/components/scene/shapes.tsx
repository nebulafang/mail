function starTile(size: number, count: number, seed: number) {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const dots = Array.from({ length: count }, () => {
    const x = (rand() * size).toFixed(1);
    const y = (rand() * size).toFixed(1);
    const r = (0.5 + rand() * 0.8).toFixed(2);
    const o = (0.4 + rand() * 0.6).toFixed(2);
    return `<circle cx='${x}' cy='${y}' r='${r}' fill='white' fill-opacity='${o}'/>`;
  }).join("");
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${dots}</svg>`)}")`;
}

const STAR_TILES = `${starTile(240, 22, 7)}, ${starTile(330, 18, 29)}`;

export function StarField() {
  return (
    <div
      className="scene-stars absolute inset-0 [mask-image:linear-gradient(#000_25%,transparent_75%)]"
      style={{ backgroundImage: STAR_TILES, backgroundSize: "240px 240px, 330px 330px", opacity: "var(--scene-star-alpha, 0)" }}
    />
  );
}

export function Orb({ size, style }: { size: string; style: React.CSSProperties }) {
  return (
    <div className="absolute" style={{ width: size, height: size, ...style }}>
      <div className="absolute -inset-[130%] rounded-full bg-[radial-gradient(circle_closest-side,var(--scene-orb-glow),transparent)]" />
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_38%_36%,var(--scene-orb)_55%,color-mix(in_srgb,var(--scene-orb)_82%,var(--scene-sky-2)))]" />
    </div>
  );
}

export function Crescent({ size, style }: { size: string; style: React.CSSProperties }) {
  return (
    <div className="absolute" style={{ width: size, height: size, ...style }}>
      <div className="absolute -inset-[110%] rounded-full bg-[radial-gradient(circle_closest-side,var(--scene-orb-glow),transparent)]" />
      <div
        className="absolute inset-0 rotate-[-20deg] rounded-full"
        style={{ boxShadow: `inset calc(${size} * 0.24) calc(${size} * -0.06) 0 0 var(--scene-orb)` }}
      />
    </div>
  );
}

const PUFFS = (
  <>
    <rect x="18" y="48" width="162" height="22" rx="11" />
    <circle cx="32" cy="58" r="13" />
    <circle cx="58" cy="48" r="22" />
    <circle cx="97" cy="38" r="30" />
    <circle cx="138" cy="46" r="24" />
    <circle cx="166" cy="56" r="14" />
  </>
);

export function Cloud({ style, flip = false }: { style: React.CSSProperties; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 200 80"
      className="absolute"
      style={{ opacity: "var(--scene-cloud-alpha)", scale: flip ? "-1 1" : undefined, ...style }}
    >
      <g className="fill-(--scene-cloud-shade)" transform="translate(0 5)">
        {PUFFS}
      </g>
      <g className="fill-(--scene-cloud)">{PUFFS}</g>
    </svg>
  );
}

const TOWER = (
  <>
    <rect x="10" y="118" width="220" height="42" rx="21" />
    <circle cx="40" cy="122" r="28" />
    <circle cx="80" cy="106" r="36" />
    <circle cx="128" cy="100" r="40" />
    <circle cx="174" cy="112" r="32" />
    <circle cx="210" cy="126" r="22" />
    <circle cx="96" cy="70" r="30" />
    <circle cx="136" cy="58" r="34" />
    <circle cx="168" cy="82" r="26" />
    <circle cx="116" cy="32" r="24" />
  </>
);

export function Cumulus({ style, flip = false }: { style: React.CSSProperties; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 240 160"
      className="absolute"
      style={{ opacity: "var(--scene-cloud-alpha)", scale: flip ? "-1 1" : undefined, ...style }}
    >
      <g className="fill-(--scene-cloud-shade)" transform="translate(6 8)">
        {TOWER}
      </g>
      <g className="fill-(--scene-cloud)">{TOWER}</g>
    </svg>
  );
}
