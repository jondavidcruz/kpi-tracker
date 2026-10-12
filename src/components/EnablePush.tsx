"use client";
// 📲 One-tap notification setup for the installed War Room app. iOS only
// allows web push for apps ADDED TO THE HOME SCREEN (iOS 16.4+), so the
// button explains itself when it's running inside plain Safari.
import { useEffect, useState } from "react";

function b64ToUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function EnablePush() {
  const [status, setStatus] = useState<"checking" | "unsupported" | "needs-install" | "ready" | "on" | "denied" | "error">("checking");
  const [err, setErr] = useState("");

  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("Notification" in window) || !("PushManager" in window)) {
        // iPhone Safari (not installed) lacks PushManager → guide to install
        setStatus(/iPhone|iPad/i.test(navigator.userAgent) && !standalone() ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") { setStatus("denied"); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setStatus(sub ? "on" : "ready");
      } catch { setStatus("ready"); }
    })();
  }, []);

  const enable = async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setStatus("denied"); return; }
      const reg = await navigator.serviceWorker.ready;
      const kr = await fetch("/api/push/subscribe");
      const { key } = (await kr.json()) as { key: string };
      if (!key) throw new Error("push keys not configured");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sub: sub.toJSON() }) });
      if (!r.ok) throw new Error("couldn't save the subscription");
      setStatus("on");
    } catch (e) { setErr(String(e).slice(0, 120)); setStatus("error"); }
  };

  if (status === "checking") return <p className="text-xs text-slate-400">checking this device…</p>;
  if (status === "needs-install") return <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">📲 First add the app to your home screen (steps above), then open it from the home screen icon and come back here — iPhone only allows notifications for installed apps.</p>;
  if (status === "unsupported") return <p className="text-xs text-slate-400">This browser doesn&apos;t support push notifications.</p>;
  if (status === "denied") return <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700 ring-1 ring-red-100">Notifications are blocked for this app in your device settings — enable them there, then retry.</p>;
  if (status === "on") return <p className="rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">✅ Notifications are ON for this device — new texts and missed calls will pop up here.</p>;
  return (
    <div className="space-y-2">
      <button onClick={enable} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">🔔 Turn on notifications for this device</button>
      {status === "error" && <p className="text-xs font-bold text-red-500">{err}</p>}
    </div>
  );
}
