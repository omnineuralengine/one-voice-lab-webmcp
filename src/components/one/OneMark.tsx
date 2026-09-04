import Image from "next/image";

export function OneMark({ className = "" }: { className?: string }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={className}
      height={32}
      loading="eager"
      src="/brand/one-voice-lab-logo.png"
      width={32}
    />
  );
}
