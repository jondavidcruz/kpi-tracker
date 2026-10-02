import { redirect } from "next/navigation";

// The Buyer Cascade lives inside Vetted Buyers now (Jon 2026-10-01) — this
// route sticks around only so old links land in the right place.
export default function CascadeRedirect() {
  redirect("/marketing");
}
