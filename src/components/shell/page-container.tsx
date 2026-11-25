import { cn } from "@/lib/utils";

/** `narrow`: forms and lists (phone-first width). `wide`: tablet/desktop layouts such as the comparator. */
export const PAGE_WIDTH = {
  narrow: "max-w-[640px]",
  wide: "max-w-[1280px]",
} as const;

type Props = {
  width?: keyof typeof PAGE_WIDTH;
  className?: string;
  children: React.ReactNode;
};

/** Every signed-in page renders inside this; the page decides its own width. */
export function PageContainer({ width = "narrow", className, children }: Props) {
  return (
    <section
      data-width={width}
      className={cn("mx-auto flex w-full flex-col gap-4 py-4", PAGE_WIDTH[width], className)}
    >
      {children}
    </section>
  );
}
