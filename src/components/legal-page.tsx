export function LegalPage({
  intro,
  sections,
  title,
}: {
  intro: string;
  sections: Array<{ body: string; heading: string }>;
  title: string;
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 pt-16 pb-24 sm:px-8">
      <p className="text-muted-foreground text-sm">Store policy</p>
      <h1 className="mt-3 font-heading font-medium text-5xl tracking-[-0.06em]">
        {title}
      </h1>
      <p className="mt-6 text-lg text-muted-foreground leading-8">{intro}</p>
      <div className="mt-12 space-y-9 border-t pt-9">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-medium text-lg">{section.heading}</h2>
            <p className="mt-2 text-muted-foreground text-sm leading-7">
              {section.body}
            </p>
          </section>
        ))}
      </div>
      <p className="mt-12 rounded-2xl bg-muted p-4 text-muted-foreground text-xs leading-5">
        Placeholder policy copy. Replace this text with your merchant&apos;s
        reviewed policy before launching.
      </p>
    </main>
  );
}
