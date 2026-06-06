import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full border-0 border-b border-ink bg-transparent px-0 py-2",
        "font-display text-2xl font-light italic placeholder:text-ink-20 placeholder:not-italic",
        "focus:outline-none focus-visible:outline-none focus:border-b-2",
        className,
      )}
      {...props}
    />
  );
}
