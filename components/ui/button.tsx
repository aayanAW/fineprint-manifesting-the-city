import { cn } from "@/lib/utils";

type Variant = "solid" | "outline" | "ghost";

export function Button({
  variant = "solid",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 px-5 text-xs uppercase tracking-[0.18em]",
        "transition-[transform,background-color,color] duration-150 ease-[var(--ease-ledger)]",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
        variant === "solid" && "bg-ink text-paper hover:bg-ink/85",
        variant === "outline" &&
          "border border-ink bg-transparent text-ink hover:bg-ink hover:text-paper",
        variant === "ghost" && "text-ink-60 hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}
