import { useState } from "react";
import { Search, X, Plus } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";

type Role = "parent" | "child" | "spouse" | "sibling" | "grandparent" | "grandchild";
type Person = { _id: string; name: string; sexe: string | null; dob: string | null; deceased: boolean; relationId: string };

function relLabel(role: Role, sexe: string | null) {
  const H = sexe === "H", F = sexe === "F";
  switch (role) {
    case "parent": return H ? "Père" : F ? "Mère" : "Parent";
    case "grandparent": return H ? "Grand-père" : F ? "Grand-mère" : "Grand-parent";
    case "child": return H ? "Fils" : F ? "Fille" : "Enfant";
    case "grandchild": return H ? "Petit-fils" : F ? "Petite-fille" : "Petit-enfant";
    case "sibling": return H ? "Frère" : F ? "Sœur" : "Frère / Sœur";
    case "spouse": return H ? "Époux" : F ? "Épouse" : "Conjoint";
  }
}

export function FamilyTab({ citizenId, canEdit, onOpen }: { citizenId: Id<"citizens">; canEdit: boolean; onOpen: (id: Id<"citizens">) => void }) {
  const family = useQuery(api.relations.family, { citizenId });
  const add = useMutation(api.relations.add);
  const remove = useMutation(api.relations.remove);
  const toast = useToast();
  const [picker, setPicker] = useState<"parent" | "child" | "spouse" | "sibling" | null>(null);

  if (family === undefined) return <div className="flex min-h-[180px] items-center justify-center text-[13px] text-faint">Chargement…</div>;
  if (family === null) return null;

  const { parents, children, siblings, spouses, self } = family;
  const grandparents = parents.flatMap((p) => p.grandparents);
  const grandchildren = children.flatMap((c) => c.grandchildren);
  const empty = parents.length === 0 && children.length === 0 && siblings.length === 0 && spouses.length === 0;

  const doAdd = async (otherId: Id<"citizens">, role: "parent" | "child" | "spouse" | "sibling") => {
    const r = await toast.guard(add({ citizenId, otherId, role }), "Ajout impossible");
    if (r !== undefined) { toast.success("Lien ajouté."); setPicker(null); }
  };

  const Card = ({ p, role, small }: { p: Person; role: Role; small?: boolean }) => (
    <div className={`group relative flex items-center gap-2 rounded-sm border border-border bg-surface-2 ${small ? "px-[9px] py-[6px]" : "px-[11px] py-[8px]"}`}>
      <div className={`flex ${small ? "h-[24px] w-[24px] text-[10px]" : "h-[28px] w-[28px] text-[11px]"} items-center justify-center rounded-full font-bold`} style={{ background: p.sexe === "H" ? "color-mix(in srgb, #3b82f6 16%, transparent)" : p.sexe === "F" ? "color-mix(in srgb, #ec4899 16%, transparent)" : "var(--surface)", color: p.sexe === "H" ? "#3b82f6" : p.sexe === "F" ? "#ec4899" : "var(--muted)" }}>
        {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
      </div>
      <div className="min-w-0">
        <div onClick={() => onOpen(p._id as Id<"citizens">)} className={`cursor-pointer truncate font-semibold hover:text-accent hover:underline ${small ? "text-[12px]" : "text-[12.5px]"}`}>
          {p.name}{p.deceased ? " †" : ""}
        </div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-faint">{relLabel(role, p.sexe)}{p.dob ? ` · ${p.dob}` : ""}</div>
      </div>
      {canEdit && (
        <button onClick={() => toast.guard(remove({ relationId: p.relationId as Id<"citizenRelations"> }), "Retrait impossible")} className="ml-1 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100">
          <X className="h-[13px] w-[13px]" />
        </button>
      )}
    </div>
  );

  const Row = ({ label, children: kids }: { label: string; children: React.ReactNode }) => (
    <div className="flex flex-col items-center gap-[6px]">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className="flex flex-wrap justify-center gap-[8px]">{kids}</div>
    </div>
  );

  const connector = <div className="h-[14px] w-px bg-border" />;

  return (
    <div className="p-[18px]">
      {canEdit && (
        <div className="mb-4 flex flex-wrap justify-center gap-2">
          {([["parent", "Parent"], ["child", "Enfant"], ["spouse", "Conjoint"], ["sibling", "Frère / Sœur"]] as const).map(([role, label]) => (
            <button key={role} onClick={() => setPicker(picker === role ? null : role)} className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[11px] py-[7px] text-[12px] font-semibold text-text hover:border-border-strong">
              <Plus className="h-[14px] w-[14px]" /> {label}
            </button>
          ))}
        </div>
      )}
      {picker && <CitizenPicker excludeId={citizenId} role={picker} onPick={(id) => doAdd(id, picker)} onCancel={() => setPicker(null)} />}

      {empty ? (
        <EmptyState title="Aucun lien de parenté" message={canEdit ? "Ajoutez un parent, un enfant, un conjoint ou un membre de la fratrie." : "Aucune relation enregistrée pour ce citoyen."} />
      ) : (
        <div className="flex flex-col items-center gap-[6px]">
          {grandparents.length > 0 && <><Row label="Grands-parents">{grandparents.map((g) => <Card key={g.relationId} p={g} role="grandparent" small />)}</Row>{connector}</>}
          {parents.length > 0 && <><Row label="Parents">{parents.map((p) => <Card key={p.relationId} p={p} role="parent" />)}</Row>{connector}</>}
          <div className="flex flex-wrap items-stretch justify-center gap-[10px]">
            {siblings.length > 0 && <div className="flex flex-col items-center gap-[6px]"><div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-faint">Fratrie</div><div className="flex flex-col gap-[6px]">{siblings.map((s) => <Card key={s.relationId} p={s} role="sibling" />)}</div></div>}
            <div className="flex flex-col items-center gap-[6px]">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--accent)" }}>Citoyen</div>
              <div className="flex items-center gap-2 rounded-sm border-2 px-[12px] py-[9px]" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
                <span className="text-[13px] font-bold">{self.name}{self.deceased ? " †" : ""}</span>
              </div>
            </div>
            {spouses.length > 0 && <div className="flex flex-col items-center gap-[6px]"><div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-faint">Conjoint(s)</div><div className="flex flex-col gap-[6px]">{spouses.map((s) => <Card key={s.relationId} p={s} role="spouse" />)}</div></div>}
          </div>
          {children.length > 0 && <>{connector}<Row label="Enfants">{children.map((c) => <Card key={c.relationId} p={c} role="child" />)}</Row></>}
          {grandchildren.length > 0 && <>{connector}<Row label="Petits-enfants">{grandchildren.map((g) => <Card key={g.relationId} p={g} role="grandchild" small />)}</Row></>}
        </div>
      )}
    </div>
  );
}

function CitizenPicker({ excludeId, role, onPick, onCancel }: { excludeId: Id<"citizens">; role: string; onPick: (id: Id<"citizens">) => void; onCancel: () => void }) {
  const [q, setQ] = useState("");
  const results = useQuery(api.citizens.search, q.trim() ? { q } : "skip");
  const labels: Record<string, string> = { parent: "un parent", child: "un enfant", spouse: "un conjoint", sibling: "un frère / une sœur" };
  return (
    <div className="mx-auto mb-4 max-w-[440px] rounded-sm border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-sm border border-border bg-surface px-2">
          <Search className="h-[14px] w-[14px] text-faint" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Rechercher ${labels[role]} (citoyen enregistré)…`} className="h-9 flex-1 bg-transparent text-[12.5px] outline-none" />
        </div>
        <button onClick={onCancel} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
      </div>
      {results && results.length > 0 && (
        <div className="max-h-[200px] overflow-y-auto rounded-sm border border-border bg-surface">
          {results.filter((c) => c._id !== excludeId).map((c) => (
            <button key={c._id} onClick={() => onPick(c._id as Id<"citizens">)} className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-surface-2">
              <span className="flex-1 text-[12.5px] font-semibold">{c.prenom} {c.nom}</span>
              <span className="font-data text-[10.5px] text-muted">{c.dateNaissance ?? ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
