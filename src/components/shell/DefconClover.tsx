import { useDefcon } from "@/hooks/useDefcon";
import { useCan } from "@/hooks/useCan";
import { Clover } from "@/components/common/Clover";

// Élément 1 du handoff : échelle DEFCON en trèfles. Le niveau courant est
// agrandi et coloré, les autres estompés. Cliquable si permission defcon.manage.
export function DefconClover() {
  const { current, levels, cycle } = useDefcon();
  const { can } = useCan();
  const canManage = can("defcon.manage");

  const list = levels ?? [];
  const currentColor = current?.color ?? "var(--muted)";

  return (
    <button
      onClick={canManage ? cycle : undefined}
      title={canManage ? "Niveau d'alerte global - cliquer pour changer" : "Niveau d'alerte global"}
      className="mdt-press flex items-center gap-[9px] rounded-[9px] border border-border bg-surface-2 px-[11px] py-[6px] hover:border-border-strong"
      style={{ cursor: canManage ? "pointer" : "default" }}
    >
      <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-faint">DEFCON</span>
      <span className="flex items-end gap-[5px]">
        {list.map((l) => {
          const active = l._id === current?._id;
          return (
            <Clover
              key={l._id}
              color={active ? l.color : "var(--faint)"}
              size={active ? 17 : 11}
              opacity={active ? 1 : 0.4}
              style={active ? { animation: "mdtBlink 2s ease-in-out infinite" } : undefined}
            />
          );
        })}
      </span>
      <span className="text-[12.5px] font-bold" style={{ color: currentColor }}>
        {current?.name ?? "…"}
      </span>
    </button>
  );
}
