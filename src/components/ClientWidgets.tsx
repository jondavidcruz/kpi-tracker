"use client";

import dynamic from "next/dynamic";

// Defer the non-critical client widgets so their JS loads AFTER first paint — pages feel
// instant; the presence window and heartbeat spin up a moment later.
// 🤖 Cortana removed from render (Jon 2026-10-26): usage audit showed 5 questions all-time / 0
// in the last week — not earning its spot, and it loaded on every page. Component + /api/assistant
// + the audit log are left intact, so re-adding <CortanaBot /> here is the only step to restore it.
const PresenceWidget = dynamic(() => import("./PresenceWidget"), { ssr: false });
const HeartbeatPing = dynamic(() => import("./HeartbeatPing"), { ssr: false });

export default function ClientWidgets({ showPresence }: { showPresence: boolean }) {
  return (
    <>
      {showPresence && <PresenceWidget />}
      <HeartbeatPing />
    </>
  );
}
