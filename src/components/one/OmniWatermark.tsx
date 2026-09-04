import Image from "next/image";

import {
  clampWatermarkOpacity,
  OMNI_WATERMARK_ASSET_PATH,
} from "@/lib/one-design-system";

export interface OmniWatermarkProps {
  /** Keep false until the approved asset exists at OMNI_WATERMARK_ASSET_PATH. */
  enabled?: boolean;
  className?: string;
  opacity?: number;
}

export function OmniWatermark({
  enabled = false,
  className = "",
  opacity = 0.055,
}: OmniWatermarkProps) {
  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className={`one-omni-watermark pointer-events-none select-none ${className}`}
      data-testid="omni-watermark"
      style={{ opacity: clampWatermarkOpacity(opacity) }}
    >
      <Image
        alt=""
        aria-hidden="true"
        className="one-omni-watermark-image object-contain"
        fill
        sizes="(max-width: 767px) 1px, (max-width: 1199px) 42vw, 38rem"
        src={OMNI_WATERMARK_ASSET_PATH}
      />
    </div>
  );
}
