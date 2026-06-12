export function OpgwRouteLoading({ label = "Loading OPGW planning view" }: { label?: string }) {
  return (
    <main className="opgw-route-loading">
      <section className="opgw-route-loading-card" aria-live="polite">
        <strong>{label}</strong>
        <span>Preparing synthetic cable, strand, splice, service, and continuity data. This demo view is not operational utility data.</span>
        <div className="opgw-route-loading-bar" />
      </section>
    </main>
  );
}
