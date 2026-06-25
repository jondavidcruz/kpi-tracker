"use client";

import dynamic from "next/dynamic";

// Defer the non-critical client widgets so their JS loads AFTER first paint — pages feel
// instant; Cortana, the presence window, and the heartbeat spin up a moment later.
const CortanaBot = dynamic(() => import("./CortanaBot"), { ssr: false });
const PresenceWidget = dynamic(() => import("./PresenceWidget"), { ssr: false });
const HeartbeatPing = dynamic(() => import("./HeartbeatPing"), { ssr: false });

export default function ClientWidgets({ showPresence }: { showPresence: boolean }) {
  return (
    <>
      <CortanaBot />
      {showPresence && <PresenceWidget />}
      <HeartbeatPing />
    </>
  );
}
