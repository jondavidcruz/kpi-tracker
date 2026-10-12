import { getCurrentUser } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import EnablePush from "@/components/EnablePush";

export const dynamic = "force-dynamic";

// 📱 The War Room on your iPhone (Jon 2026-10-12): installable home-screen
// app + push notifications for texts and missed calls. No App Store needed.
export default async function IphonePage() {
  const me = await getCurrentUser();
  if (!me) return <Card className="p-10 text-center text-slate-400">Sign in first.</Card>;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SectionTitle title="📱 War Room on your iPhone" subtitle="Install it like an app, get pinged the second a seller texts or a call is missed — follow up from anywhere." accent="bg-emerald-400" />

      <Card className="p-5">
        <div className="text-sm font-extrabold text-slate-800">Step 1 — Add it to your home screen <span className="font-normal text-slate-400">(one time, ~20 seconds)</span></div>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
          <li>Open <b>kpi-tracker-lovat.vercel.app</b> in <b>Safari</b> on your iPhone (must be Safari).</li>
          <li>Tap the <b>Share</b> button (the square with the arrow, bottom middle).</li>
          <li>Scroll down and tap <b>&quot;Add to Home Screen&quot;</b>, then <b>Add</b>.</li>
          <li>A <b>War Room</b> icon appears on your home screen — always open it from there.</li>
        </ol>
      </Card>

      <Card className="p-5">
        <div className="text-sm font-extrabold text-slate-800">Step 2 — Turn on notifications <span className="font-normal text-slate-400">(from inside the installed app)</span></div>
        <p className="mb-3 mt-1 text-xs text-slate-500">Open the home-screen War Room, come to this page (sidebar → iPhone App), and tap:</p>
        <EnablePush />
      </Card>

      <Card className="p-5">
        <div className="text-sm font-extrabold text-slate-800">What you&apos;ll get pinged for</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>💬 A seller texts one of your leads — tap the ping, you&apos;re in the thread.</li>
          <li>📵 A missed inbound call — tap to see who, call back from the card.</li>
          <li>📞 An incoming call ringing the team (open the app on a computer to answer — phone calls on iPhone come in a later update).</li>
        </ul>
        <p className="mt-3 text-[11px] text-slate-400">Texting, the CRM, tasks, KPIs — everything works in the installed app. Each teammate does this once on their own phone.</p>
      </Card>
    </div>
  );
}
