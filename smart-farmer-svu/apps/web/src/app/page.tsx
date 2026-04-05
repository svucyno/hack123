export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#f4f0e8",
        color: "#17301f",
        padding: "2rem",
      }}
    >
      <section style={{ maxWidth: 640, textAlign: "center" }}>
        <h1>Smart Farmer SVU Web</h1>
        <p>
          Next.js starter app scaffolded from the reference monorepo structure.
        </p>
      </section>
    </main>
  );
}
