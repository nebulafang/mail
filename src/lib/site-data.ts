"use client";

async function attempt(task: () => unknown) {
  try {
    await task();
  } catch {}
}

export async function clearSiteData() {
  await attempt(() => fetch("/api/site-data", { method: "DELETE", cache: "no-store" }));
  await attempt(() => localStorage.clear());
  await attempt(() => sessionStorage.clear());
  await attempt(() => {
    for (const entry of document.cookie.split(";")) {
      const name = entry.split("=")[0].trim();
      if (name) document.cookie = `${name}=; path=/; max-age=0`;
    }
  });
  await attempt(async () => {
    if (!("caches" in window)) return;
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
  });
  await attempt(async () => {
    const dbs = (await indexedDB.databases?.()) ?? [];
    for (const db of dbs) if (db.name) indexedDB.deleteDatabase(db.name);
  });
  await attempt(async () => {
    if (!navigator.serviceWorker) return;
    await Promise.all((await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister()));
  });
  location.replace("/");
}
