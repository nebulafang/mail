export type PageCursor = { at: Date; id: string };

export function parseCursor(cursor: string | null | undefined): PageCursor | null {
  if (!cursor) return null;
  const sep = cursor.indexOf("_");
  const time = Number(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  return sep > 0 && Number.isFinite(time) && id ? { at: new Date(time), id } : null;
}

export const cursorKey = (at: Date, id: string | number) => `${at.getTime()}_${id}`;

export function pageOf<T>(rows: T[], size: number, key: (row: T) => string) {
  const page = rows.slice(0, size);
  const last = page.at(-1);
  return { page, nextCursor: rows.length > size && last ? key(last) : null };
}
