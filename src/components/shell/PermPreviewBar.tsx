import { useQuery } from "convex/react";
import { Eye, X } from "lucide-react";
import { api, type Id } from "@/lib/api";
import { usePermPreview } from "@/providers/perm-preview";

// Barre flottante réservée aux gestionnaires de permissions (rbac.manage) : elle
// active le mode « voir le MDT comme le grade X ». Elle lit les VRAIES
// permissions de l'utilisateur (pas l'aperçu) pour rester visible même quand le
// grade prévisualisé ne dispose pas de rbac.manage.
export function PermPreviewBar() {
  const realPerms = useQuery(api.agents.myPermissions);
  const opts = useQuery(api.config.options);
  const { previewGradeId, previewGradeName, setPreview, active } = usePermPreview();

  const isManager = !!realPerms?.includes("rbac.manage");
  if (!isManager) return null;

  const grades = (opts?.grades ?? []).filter((g) => !g.academyOnly);

  return (
    <div
      className="fixed bottom-4 right-4 z-[9998] flex items-center gap-2 rounded-full border px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,.35)]"
      style={
        active
          ? { borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 16%, var(--elev))" }
          : { borderColor: "var(--border)", background: "var(--elev)" }
      }
    >
      <Eye className="h-[15px] w-[15px]" style={{ color: active ? "var(--accent)" : "var(--muted)" }} />
      <span className="text-[12px] font-semibold" style={{ color: active ? "var(--accent)" : "var(--muted)" }}>
        {active ? `Aperçu : ${previewGradeName ?? "grade"}` : "Aperçu grade"}
      </span>
      <select
        value={previewGradeId ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          const g = grades.find((x) => x._id === id);
          setPreview(id ? (id as Id<"grades">) : null, g?.name ?? null);
        }}
        className="h-8 rounded-sm border border-border bg-surface-2 px-2 text-[12px] outline-none focus:border-accent"
      >
        <option value="">— Désactivé —</option>
        {grades.map((g) => (
          <option key={g._id} value={g._id}>{g.name}</option>
        ))}
      </select>
      {active && (
        <button
          onClick={() => setPreview(null)}
          className="flex h-7 items-center gap-1 rounded-sm bg-accent px-2 text-[12px] font-semibold text-accent-contrast hover:brightness-[1.06]"
          title="Quitter l'aperçu"
        >
          <X className="h-[13px] w-[13px]" /> Quitter
        </button>
      )}
    </div>
  );
}
