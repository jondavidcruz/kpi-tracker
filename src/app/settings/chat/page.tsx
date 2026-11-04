import ChatSettingsPanel from "@/components/settings/ChatSettingsPanel";

export const dynamic = "force-dynamic";

// Legacy route — the real home is the Settings hub tab (/admin#chat). Kept so old
// bookmarks still work; renders the same shared panel (Jon 2026-11-03 consolidation).
export default async function ChatSettingsPage() {
  return <ChatSettingsPanel />;
}
