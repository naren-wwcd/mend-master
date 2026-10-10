import { useId } from "react";

// Wave bands redrawn from ref/logo.jpg: parallel S-curves clipped to a rectangle.
const BANDS = [-11.5, 3.5, 18, 32.5, 47];

export default function Logo({ size = 28, wordmark = false, animated = false, className = "" }) {
  const clipId = useId();
  return (
    <span className={`logo ${animated ? "logo-animated" : ""} ${className}`.trim()}>
      <svg
        className="logo-mark"
        width={(size * 64) / 56}
        height={size}
        viewBox="0 0 64 56"
        role="img"
        aria-label={wordmark ? undefined : "Mend"}
        aria-hidden={wordmark ? "true" : undefined}
      >
        <clipPath id={clipId}><rect width="64" height="56" /></clipPath>
        <g clipPath={`url(#${clipId})`} fill="none" stroke="currentColor" strokeWidth="7.5">
          {BANDS.map((y, index) => (
            <g key={y} className="logo-ripple" style={{ "--i": index }}>
              <path className="logo-band" pathLength="1" d={`M-2 ${y}C24 ${y} 38 ${y + 18} 66 ${y + 18}`} />
            </g>
          ))}
        </g>
      </svg>
      {wordmark && <span className="logo-word">Mend</span>}
    </span>
  );
}
