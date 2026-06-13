// The Freedom Offers wordmark — an elegant serif lockup (cream on navy),
// recreated as scalable type so it stays crisp at any size and themes cleanly.
export default function Logo({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const cls = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";
  return (
    <span
      className={`font-medium uppercase leading-none text-brand-cream ${cls} ${className}`}
      style={{ fontFamily: "var(--font-display), Georgia, serif", letterSpacing: "0.08em" }}
    >
      Freedom Offers
    </span>
  );
}
