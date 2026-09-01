"use client";

import { useEffect } from "react";
import { Brain } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

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
          style={{ fontSize: "24px", color: "var(--color-on-surface)" }}
        >
          Something went wrong
        </h1>

        <p
          style={{
            fontSize: "14px",
            color: "var(--color-on-surface-variant)",
            marginTop: "8px",
            lineHeight: 1.6,
          }}
        >
          An unexpected error occurred. Please try again or go back to the
          home page.
        </p>

        <div
          className="flex items-center justify-center"
          style={{ gap: "12px", marginTop: "32px" }}
        >
          <button onClick={reset} className="btn-primary">
            Try Again
          </button>
          <a href="/" className="btn-secondary" style={{ textDecoration: "none" }}>
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}
