// The Freedom Offers wordmark — an elegant serif lockup (cream on navy),
// recreated as scalable type so it stays crisp at any size and themes cleanly.
export default function Logo({
  size = "md",
  className = "",
  tagline = false,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  tagline?: boolean;
}) {
  const cls = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";
  const wordmark = (
    <span
      className={`font-medium uppercase leading-none text-brand-cream ${cls} ${className}`}
      style={{ fontFamily: "var(--font-display), Georgia, serif", letterSpacing: "0.08em" }}
    >
      Freedom Offers
    </span>
  );
  if (!tagline) return wordmark;
  return (
    <span className="flex flex-col gap-1">
      {wordmark}
      <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-brand-gold-soft">
        War Room
      </span>
    </span>
  );
}
