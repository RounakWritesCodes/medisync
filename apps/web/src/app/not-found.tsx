import Link from "next/link";
import { Brain } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="text-center" style={{ maxWidth: "420px" }}>
        <div className="inline-flex items-center justify-center" style={{ marginBottom: "24px" }}>
          <Brain style={{ color: "var(--color-primary)", width: 48, height: 48 }} />
        </div>

        <h1
          className="font-bold"
          style={{ fontSize: "64px", color: "var(--color-primary)", lineHeight: 1 }}
        >
          404
        </h1>

        <p
          className="font-semibold"
          style={{ fontSize: "20px", marginTop: "8px", color: "var(--color-on-surface)" }}
        >
          Page not found
        </p>

        <p style={{ fontSize: "14px", color: "var(--color-on-surface-variant)", marginTop: "8px", lineHeight: 1.6 }}>
          The page you are looking for does not exist or has been moved.
        </p>

        <Link
          href="/"
          className="btn-primary"
          style={{ marginTop: "32px", textDecoration: "none" }}
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
