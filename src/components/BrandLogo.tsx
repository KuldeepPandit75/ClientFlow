import Image from "next/image";

interface BrandLogoProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showText?: boolean;
}

export function BrandLogo({
  className = "",
  iconClassName = "h-10 w-10",
  textClassName = "font-display text-lg font-bold tracking-tight text-foreground",
  showText = true,
}: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className={`${iconClassName} flex shrink-0 items-center justify-center rounded-2xl border border-border bg-white p-1.5 shadow-sm ring-1 ring-black/5`}>
        <Image
          src="/brand-icon.png"
          alt="ClientFlow icon"
          width={92}
          height={74}
          priority
          className="h-full w-full object-contain"
        />
      </span>
      {showText && (
        <span className={textClassName}>ClientFlow</span>
      )}
    </div>
  );
}
