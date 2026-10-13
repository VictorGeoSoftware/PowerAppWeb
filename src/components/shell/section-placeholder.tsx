/** Temporary screen body until the section's own feature lands. */
export function SectionPlaceholder({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-2 py-4">
      <h1 className="text-[22px] font-semibold">{title}</h1>
      <p className="text-base text-muted-foreground">Próximamente.</p>
    </section>
  );
}
