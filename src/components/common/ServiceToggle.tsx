import { Clover } from "./Clover";

// Élément 3 du handoff : interrupteur « en / hors service », le curseur porte le trèfle.
export function ServiceToggle({
  onDuty,
  onToggle,
  label = true,
}: {
  onDuty: boolean;
  onToggle: () => void;
  label?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className="mdt-press flex items-center gap-[10px]"
      title={onDuty ? "Terminer le service" : "Prendre le service"}
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}
    >
      <span
        style={{
          position: "relative",
          width: 46,
          height: 25,
          borderRadius: 20,
          background: onDuty ? "var(--accent)" : "var(--border-strong)",
          transition: "background .22s ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: onDuty ? 24 : 3,
            width: 19,
            height: 19,
            borderRadius: "50%",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "left .22s cubic-bezier(.16,1,.3,1)",
            boxShadow: "0 1px 3px rgba(0,0,0,.3)",
          }}
        >
          <Clover color={onDuty ? "var(--accent)" : "var(--faint)"} size={11} />
        </span>
      </span>
      {label && (
        <span className="text-[13px] font-semibold" style={{ color: onDuty ? "var(--success)" : "var(--muted)" }}>
          {onDuty ? "En service" : "Hors service"}
        </span>
      )}
    </button>
  );
}
