/**
 * Stripe-style link arrow: a chevron at rest; on hover of the parent
 * `.hover-arrow-host` the shaft fades in and the tip slides forward.
 */
export function HoverArrow({ direction = "right" }: { direction?: "left" | "right" }) {
  return (
    <svg
      className={`hover-arrow${direction === "left" ? " hover-arrow-left" : ""}`}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
    >
      <path className="hover-arrow-line" d="M0 5h7" />
      <path className="hover-arrow-tip" d="M1 1l4 4-4 4" />
    </svg>
  );
}
