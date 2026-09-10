type BrandMarkProps = {
  width?: number;
  height?: number;
  className?: string;
};

/**
 * The Cineclub concentric-arc logomark, extracted verbatim (same path data)
 * from app/components/site-header.tsx so it can be reused at other sizes
 * without touching the working header component.
 */
export function BrandMark({ width = 46, height = 48, className }: BrandMarkProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 380 400" aria-hidden="true" className={className}>
      <g fill="none" stroke="#0c0806" strokeWidth={16} strokeLinecap="round">
        <path d="M 236.54,216.27 A 40,40 0 1 1 236.54,183.73" />
        <path d="M 258.47,226.03 A 64,64 0 1 1 258.47,173.97" />
        <path d="M 280.39,235.79 A 88,88 0 1 1 280.39,164.21" />
        <path d="M 302.32,245.56 A 112,112 0 1 1 302.32,154.45" />
        <path d="M 324.24,255.32 A 136,136 0 1 1 324.24,144.68" />
        <path d="M 346.17,265.08 A 160,160 0 1 1 346.17,134.92" />
        <path d="M 368.09,274.84 A 184,184 0 1 1 368.09,125.16" />
      </g>
      <g fill="none" stroke="#f7ece0" strokeWidth={10} strokeLinecap="round">
        <path d="M 236.54,216.27 A 40,40 0 1 1 236.54,183.73" />
        <path d="M 258.47,226.03 A 64,64 0 1 1 258.47,173.97" />
        <path d="M 280.39,235.79 A 88,88 0 1 1 280.39,164.21" />
        <path d="M 302.32,245.56 A 112,112 0 1 1 302.32,154.45" />
        <path d="M 324.24,255.32 A 136,136 0 1 1 324.24,144.68" />
        <path d="M 346.17,265.08 A 160,160 0 1 1 346.17,134.92" />
        <path d="M 368.09,274.84 A 184,184 0 1 1 368.09,125.16" />
      </g>
    </svg>
  );
}
