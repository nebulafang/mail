import { Motes } from "./particles";
import { Cloud, Cumulus, Orb, StarField } from "./shapes";

const FLARES = [
  { right: "32cqw", top: "22cqh", size: "9cqmin" },
  { right: "44cqw", top: "31cqh", size: "4cqmin" },
  { right: "58cqw", top: "45cqh", size: "15cqmin" },
];

export function SummerArt({ still }: { still: boolean }) {
  return (
    <>
      <StarField />
      <Orb size="22cqmin" style={{ top: "4cqh", right: "10cqw" }} />
      {FLARES.map((f) => (
        <div
          key={f.right}
          className="absolute rounded-full bg-(--scene-flare)"
          style={{ right: f.right, top: f.top, width: f.size, height: f.size }}
        />
      ))}
      <Cloud style={{ top: "38cqh", right: "-6cqw", width: "min(34cqw, 30cqh)" }} />
      <div className="absolute inset-x-0 bottom-0 h-[40cqh] bg-[linear-gradient(to_bottom,transparent,var(--scene-far))]" />
      <Cumulus style={{ bottom: "-6cqh", left: "-14cqw", width: "min(86cqw, 70cqh)" }} />
      <Cumulus flip style={{ bottom: "-12cqh", right: "-18cqw", width: "min(74cqw, 60cqh)" }} />
      {!still && <Motes />}
    </>
  );
}
