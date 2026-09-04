import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function WaveIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M3 12h2.2l2.1-6.4L11.4 19l2.8-9.2 1.9 4.2H21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M9.2 14.8 14.8 9.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.7 6.2 12 4.9a4.2 4.2 0 0 1 5.9 5.9l-1.3 1.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m13.3 17.8-1.3 1.3a4.2 4.2 0 0 1-5.9-5.9l1.3-1.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 16V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m7.5 9.5 4.5-4.5 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 16v1.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SpeakerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4.5 14.5v-5h3.2L13 5.2v13.6l-5.3-4.3H4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16.2 9.1a4.2 4.2 0 0 1 0 5.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18.7 6.7a7.7 7.7 0 0 1 0 10.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="9" y="3.8" width="6" height="10.5" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.8 11.8a6.2 6.2 0 0 0 12.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 18v2.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.8 20.7h6.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="8" y="8" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m5 12.5 4.1 4.1L19 6.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 8.2v5.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M12 17.2h.01" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M10.2 4.6 2.9 17.2A2.2 2.2 0 0 0 4.8 20.5h14.4a2.2 2.2 0 0 0 1.9-3.3L13.8 4.6a2.1 2.1 0 0 0-3.6 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 7h14M9 7V4.8h6V7M8 10v7M12 10v7M16 10v7M6.5 7l.7 13h9.6l.7-13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 4h11l3 3v13H5V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 4v6h8V4M8 20v-6h8v6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function ResetIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5.2 8.3A8 8 0 1 1 4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5.2 4.5v3.8H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 4v11M7.5 11.5 12 16l4.5-4.5M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m9 6-6 6 6 6M15 6l6 6-6 6M14 4l-4 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
