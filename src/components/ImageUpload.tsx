"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Upload an image straight to Supabase Storage and expose its public URL via a
 *  hidden input named `name`, so a surrounding <form action={...}> can save it. */
export default function ImageUpload({ name, current = "", label = "Upload image" }: { name: string; current?: string; label?: string }) {
  const [url, setUrl] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { setMsg("That image is over 15 MB — please shrink it first."); return; }
    setBusy(true); setMsg("Uploading…");
    try {
      const ext = (f.name.split(".").pop() || "png").toLowerCase();
      const signRes = await fetch("/api/deck-image-upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ext }) });
      const sign = await signRes.json();
      if (!sign.path || !sign.token) throw new Error(sign.error || "upload failed");
      const supabase = createClient();
      const { error } = await supabase.storage.from("deck-images").uploadToSignedUrl(sign.path, sign.token, f);
      if (error) throw error;
      setUrl(sign.publicUrl);
      setMsg("✓ Uploaded");
    } catch {
      setMsg("Upload failed — try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name={name} value={url} />
      {url && <img src={url} alt="" className="h-12 w-20 rounded object-cover ring-1 ring-slate-200" />}
      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50">
        {busy ? "Uploading…" : url ? "🔁 Replace image" : `🖼️ ${label}`}
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
      {msg && <span className={`text-[11px] ${msg.startsWith("✓") ? "text-emerald-600" : "text-slate-400"}`}>{msg}</span>}
    </div>
  );
}
