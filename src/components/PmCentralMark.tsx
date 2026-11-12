// The PM Central product mark ("Swirl"): a house with three ribbons circling
// it — the systems (Rentvine, bank & cards, communications…) flowing into one
// place. This is the PRODUCT's mark; the company using it (BRAND, e.g. PMI
// Lighthouse) keeps its own logo. The house takes `houseColor` (default
// currentColor, so it follows the text color: white in the sidebar, dark on
// light surfaces). Source art: the logo canvas, board "9 · Swirl".

export const PM_CENTRAL_NAME = "PM Central";

const RIBBONS: { color: string; d: string }[] = [
  {
    color: "#F2645A",
    d: "M20.27 2.83 L22.2 2.58 L24.15 2.5 L26.1 2.6 L28.03 2.88 L29.93 3.33 L31.77 3.96 L33.56 4.74 L35.27 5.69 L36.88 6.78 L38.39 8.02 L39.78 9.39 L41.03 10.88 L42.15 12.48 L43.12 14.17 L43.93 15.95 L44.58 17.79 L45.06 19.68 L45.37 21.6 L45.5 23.55 L45.45 25.5 L45.15 25.48 L44.88 23.56 L44.44 21.71 L43.84 19.93 L43.07 18.24 L42.17 16.66 L41.13 15.19 L39.98 13.86 L38.72 12.66 L37.38 11.61 L35.96 10.71 L34.49 9.97 L32.99 9.4 L31.46 8.98 L29.92 8.73 L28.4 8.65 L26.91 8.72 L25.47 8.96 L24.1 9.36 L22.82 9.94 L21.67 10.8 Z",
  },
  {
    color: "#F6A623",
    d: "M44.2 31.35 L43.45 33.15 L42.54 34.88 L41.48 36.52 L40.28 38.05 L38.94 39.47 L37.47 40.76 L35.9 41.91 L34.23 42.91 L32.47 43.76 L30.64 44.45 L28.76 44.97 L26.84 45.31 L24.9 45.48 L22.95 45.47 L21.01 45.29 L19.09 44.93 L17.21 44.4 L15.39 43.7 L13.64 42.84 L11.98 41.82 L12.15 41.58 L13.94 42.3 L15.77 42.85 L17.61 43.21 L19.45 43.4 L21.27 43.41 L23.06 43.24 L24.79 42.91 L26.46 42.42 L28.04 41.78 L29.53 41 L30.9 40.1 L32.16 39.08 L33.28 37.97 L34.26 36.76 L35.1 35.49 L35.77 34.16 L36.29 32.8 L36.62 31.41 L36.77 30.01 L36.59 28.58 Z",
  },
  {
    color: "#B0287A",
    d: "M7.53 37.82 L6.35 36.27 L5.31 34.62 L4.42 32.88 L3.7 31.07 L3.14 29.2 L2.75 27.29 L2.54 25.35 L2.51 23.4 L2.65 21.45 L2.97 19.53 L3.46 17.64 L4.12 15.81 L4.95 14.04 L5.93 12.35 L7.06 10.76 L8.33 9.28 L9.73 7.92 L11.24 6.69 L12.86 5.61 L14.58 4.68 L14.71 4.95 L13.18 6.13 L11.79 7.44 L10.56 8.86 L9.48 10.36 L8.56 11.94 L7.81 13.56 L7.23 15.23 L6.82 16.92 L6.58 18.61 L6.51 20.28 L6.61 21.93 L6.86 23.52 L7.27 25.05 L7.82 26.51 L8.5 27.86 L9.31 29.11 L10.24 30.24 L11.27 31.23 L12.41 32.05 L13.74 32.61 Z",
  },
];

// House with the door cut out (widened by the stroke so the door reads at 3.6
// units once the 1.4 round-join stroke is applied).
const HOUSE =
  "M24 14.5 L31.3 21 V31.6 H26.5 V25.9 Q26.5 25.3 25.9 25.3 H22.1 Q21.5 25.3 21.5 25.9 V31.6 H16.7 V21 Z";

export function PmCentralMark({
  size = 24,
  decorative = false,
  houseColor = "currentColor",
  className,
}: {
  size?: number;
  decorative?: boolean; // true when "PM Central" is already written beside it
  houseColor?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": PM_CENTRAL_NAME })}
    >
      {RIBBONS.map((r) => (
        <path key={r.color} d={r.d} fill={r.color} stroke={r.color} strokeWidth={0.8} strokeLinejoin="round" />
      ))}
      <path d={HOUSE} fill={houseColor} stroke={houseColor} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

// Small product credit for screens that show the customer's own logo (login).
export function PoweredByPmCentral({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-xs text-white/70 ${className}`}>
      <PmCentralMark size={20} decorative houseColor="#FFFFFF" />
      <span>
        Powered by <span className="font-semibold text-white">{PM_CENTRAL_NAME}</span>
      </span>
    </div>
  );
}
