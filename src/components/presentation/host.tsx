"use client";

import dynamic from "next/dynamic";
import { usePresentation } from "@/presentation/store";

const load = {
  sheet: () => import("./sheet"),
  actionSheet: () => import("./action-sheet"),
  menu: () => import("./menu"),
  alert: () => import("./alert"),
  toast: () => import("./toast"),
};
const blank = () => null;
const SheetView = dynamic(() => load.sheet().then((m) => m.SheetView), { loading: blank });
const ActionSheetView = dynamic(() => load.actionSheet().then((m) => m.ActionSheetView), { loading: blank });
const MenuView = dynamic(() => load.menu().then((m) => m.MenuView), { loading: blank });
const AlertView = dynamic(() => load.alert().then((m) => m.AlertView), { loading: blank });
const ToastStack = dynamic(() => load.toast().then((m) => m.ToastStack), { loading: blank });

export function preloadOverlays() {
  for (const start of Object.values(load)) start();
}

export function SheetHost() {
  const items = usePresentation((s) => s.items);
  return items.map((item) => (item.kind === "sheet" ? <SheetView key={item.id} item={item} /> : null));
}

export function OverlayHost() {
  const items = usePresentation((s) => s.items);
  const firstAlert = items.find((i) => i.kind === "alert");
  return (
    <>
      {items.map((item) => {
        if (item.kind === "actionSheet") return <ActionSheetView key={item.id} item={item} />;
        if (item.kind === "menu") return <MenuView key={item.id} item={item} />;
        if (item.kind === "alert" && item === firstAlert) return <AlertView key={item.id} item={item} />;
        return null;
      })}
      <ToastStack />
    </>
  );
}
