export function ActionMessage({
  status,
  message,
}: {
  status?: "idle" | "error" | "success";
  message?: string;
}) {
  if (!message) return null;

  return (
    <p className={`action-message ${status === "error" ? "is-error" : "is-success"}`} role="status">
      {message}
    </p>
  );
}
