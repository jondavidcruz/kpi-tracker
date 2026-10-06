"use client";
// Drag-and-drop sidebar ordering (Jon 2026-10-04: "drag items instead of
// up-and-down-only"). Plain HTML5 DnD — no new dependencies. Drag a group
// card by its header to reorder groups; drag a tab row to reorder tabs
// within its group (tabs can't change groups — grouping is coded).
// Every drop saves the FULL order immediately and optimistically.
import { useState, useTransition } from "react";
import { saveNavOrderAction } from "@/app/actions";

export type NavGroupDef = { group: string; items: Array<{ href: string; label: string }> };

export default function NavOrderBoard({ groups: initial }: { groups: NavGroupDef[] }) {
  const [groups, setGroups] = useState(initial);
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<{ group: string; href: string } | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [savedAt, setSavedAt] = useState(0);

  const persist = (kind: "groups" | "items" | "move", next: NavGroupDef[], group?: string, href?: string) => {
    setGroups(next);
    const fd = new FormData();
    fd.set("kind", kind);
    if (kind === "groups") fd.set("order", JSON.stringify(next.map((g) => g.group)));
    else {
      fd.set("group", group!);
      fd.set("order", JSON.stringify(next.find((g) => g.group === group)!.items.map((i) => i.href)));
      if (kind === "move") fd.set("href", href!);
    }
    start(async () => { await saveNavOrderAction(fd); setSavedAt(Date.now()); });
  };

  const dropOnGroup = (target: string) => {
    if (!dragGroup || dragGroup === target) return;
    const next = [...groups];
    const from = next.findIndex((g) => g.group === dragGroup);
    const to = next.findIndex((g) => g.group === target);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist("groups", next);
  };

  const dropOnItem = (group: string, targetHref: string) => {
    if (!dragItem || dragItem.href === targetHref) return;
    if (dragItem.group === group) {
      const next = groups.map((g) => {
        if (g.group !== group) return g;
        const items = [...g.items];
        const from = items.findIndex((i) => i.href === dragItem.href);
        const to = items.findIndex((i) => i.href === targetHref);
        const [moved] = items.splice(from, 1);
        items.splice(to, 0, moved);
        return { ...g, items };
      });
      persist("items", next, group);
    } else {
      // Cross-group: pull the tab out of its old group, drop it at the target spot.
      moveAcross(group, targetHref);
    }
  };

  const moveAcross = (toGroup: string, beforeHref?: string) => {
    if (!dragItem) return;
    const moved = groups.find((g) => g.group === dragItem.group)?.items.find((i) => i.href === dragItem.href);
    if (!moved) return;
    const next = groups.map((g) => {
      if (g.group === dragItem.group) return { ...g, items: g.items.filter((i) => i.href !== dragItem.href) };
      if (g.group === toGroup) {
        const items = [...g.items];
        const at = beforeHref ? items.findIndex((i) => i.href === beforeHref) : items.length;
        items.splice(at < 0 ? items.length : at, 0, moved);
        return { ...g, items };
      }
      return g;
    });
    persist("move", next, toGroup, dragItem.href);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-400">
        <span>✋ Drag a group by its title, or drag any tab — within its group or into a different one. Order saves the moment you drop.</span>
        {pending ? <span className="font-bold text-amber-600">saving…</span> : savedAt ? <span className="font-bold text-emerald-600">✓ saved</span> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {groups.map((g) => (
          <div
            key={g.group}
            onDragOver={(e) => { if (dragGroup || (dragItem && dragItem.group !== g.group)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverKey(`g:${g.group}`); } }}
            onDrop={(e) => { e.preventDefault(); if (dragGroup) dropOnGroup(g.group); else if (dragItem && dragItem.group !== g.group) moveAcross(g.group); setOverKey(null); }}
            className={`rounded-2xl bg-white p-3.5 shadow-sm ring-1 transition ${overKey === `g:${g.group}` && ((dragGroup && dragGroup !== g.group) || (dragItem && dragItem.group !== g.group)) ? "ring-2 ring-indigo-400" : "ring-slate-200"} ${dragGroup === g.group ? "opacity-60" : ""}`}
          >
            <div
              draggable
              onDragStart={(e) => {
                // Safari/Firefox abort a drag with no payload; Chrome aborts if
                // the node re-renders during dragstart — so set data now, state later.
                e.dataTransfer.setData("text/plain", g.group);
                e.dataTransfer.effectAllowed = "move";
                setTimeout(() => setDragGroup(g.group), 0);
              }}
              onDragEnd={() => { setDragGroup(null); setOverKey(null); }}
              className="mb-2 flex cursor-grab items-center gap-2 active:cursor-grabbing"
              title="Drag to move this whole group"
            >
              <span className="text-slate-300">⠿</span>
              <span className="text-sm font-bold text-slate-700">{g.group}</span>
            </div>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <div
                  key={it.href}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData("text/plain", it.href);
                    e.dataTransfer.effectAllowed = "move";
                    setTimeout(() => setDragItem({ group: g.group, href: it.href }), 0);
                  }}
                  onDragEnd={() => { setDragItem(null); setOverKey(null); }}
                  onDragOver={(e) => { if (dragItem) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setOverKey(`i:${it.href}`); } }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOnItem(g.group, it.href); setOverKey(null); }}
                  className={`flex cursor-grab items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-slate-700 transition active:cursor-grabbing ${
                    overKey === `i:${it.href}` && dragItem && dragItem.href !== it.href ? "bg-indigo-50 ring-1 ring-indigo-300" : "bg-slate-50"
                  } ${dragItem?.href === it.href ? "opacity-50" : ""}`}
                >
                  <span className="text-slate-300">⠿</span>
                  <span className="flex-1">{it.label}</span>
                </div>
              ))}
              {dragItem && dragItem.group !== g.group && <div className="rounded-lg border border-dashed border-indigo-200 bg-indigo-50/40 px-2.5 py-1 text-[11px] text-indigo-400">drop here to move into {g.group}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
