import { Brain } from "lucide-react";

export default function Loading() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="text-center">
        <div className="inline-flex items-center justify-center" style={{ marginBottom: "16px" }}>
          <Brain style={{ color: "var(--color-primary)", width: 32, height: 32 }} />
        </div>

        <div
          style={{
            width: "32px",
            height: "32px",
            border: "3px solid var(--color-outline-variant)",
            borderTopColor: "var(--color-primary)",
            borderRadius: "50%",
            margin: "0 auto",
            animation: "spin 0.8s linear infinite",
          }}
        />

        <p
          style={{
            marginTop: "16px",
            fontSize: "14px",
            color: "var(--color-on-surface-variant)",
          }}
        >
          Loading...
        </p>

        <style jsx>{`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
