export type MailBaseline = { ids: ReadonlySet<string>; newest: number };

type Arrival = { id: string; receivedAt: string };

const timeOf = (m: Arrival) => new Date(m.receivedAt).getTime();

export function createBaseline(messages: Arrival[]): MailBaseline {
  return { ids: new Set(messages.map((m) => m.id)), newest: Math.max(-Infinity, ...messages.map(timeOf)) };
}

export function detectArrivals(baseline: MailBaseline, messages: Arrival[]) {
  const unseen = messages.filter((m) => !baseline.ids.has(m.id));
  if (!unseen.length) return null;
  const arrivals = unseen.filter((m) => timeOf(m) > baseline.newest).length;
  const next: MailBaseline = {
    ids: new Set([...baseline.ids, ...unseen.map((m) => m.id)]),
    newest: Math.max(baseline.newest, ...unseen.map(timeOf)),
  };
  return { arrivals, baseline: next };
}

type LatestOf<M> = Omit<M, "preview">;

type Summary<M extends Arrival> = { address: string; total: number; unread: number; latest?: LatestOf<M> | null };

export function withNewMail<M extends Arrival & { preview: string; seen: boolean }, S extends Summary<M>>(
  list: S[],
  address: string,
  message: M,
): S[] | null {
  const index = list.findIndex((box) => box.address.toLowerCase() === address);
  if (index < 0) return null;
  const box = list[index];
  if (box.latest?.id === message.id) return list;
  const isNewest = !box.latest || timeOf(message) >= timeOf(box.latest);
  const updated: S = {
    ...box,
    total: box.total + 1,
    unread: box.unread + (message.seen ? 0 : 1),
    latest: isNewest ? message : box.latest,
  };
  const rest = list.filter((_, i) => i !== index);
  return isNewest ? [updated, ...rest] : list.map((b, i) => (i === index ? updated : b));
}
