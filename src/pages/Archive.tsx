import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useMe } from "@/hooks/useMe";
import { useToast } from "@/providers/toast";
import { AgentTag } from "@/components/common/AgentTag";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";

type Kind =
  | "casier" | "citation" | "mandat" | "report" | "complaint" | "vehicle" | "weapon"
  | "saisie" | "discipline" | "deposition" | "note" | "relation" | "fleetVehicle" | "interview"
  | "amende" | "convocation" | "investigation" | "serviceWeapon" | "ceremony" | "protocol" | "resource" | "tenue"
  | "divisionAnnouncement" | "cadetNote" | "flEvaluation" | "ftoPatrol" | "salaryBonus" | "citizenLicense"
  | "citizen" | "agent";
const KIND_LABEL: Record<Kind, string> = {
  casier: "Casier",
  citation: "Contravention",
  mandat: "Mandat",
  report: "Rapport",
  complaint: "Plainte",
  vehicle: "Véhicule",
  weapon: "Arme",
  saisie: "Saisie",
  discipline: "Sanction",
  deposition: "Déposition",
  note: "Note",
  relation: "Lien familial",
  fleetVehicle: "Véhicule LSPD",
  interview: "Entretien",
  amende: "Amende",
  convocation: "Convocation",
  investigation: "Enquête interne",
  serviceWeapon: "Arme de service",
  ceremony: "Cérémonie",
  protocol: "Protocole",
  resource: "Ressource",
  tenue: "Tenue",
  divisionAnnouncement: "Annonce de division",
  cadetNote: "Note de cadet",
  flEvaluation: "Éval. First Lincoln",
  ftoPatrol: "Patrouille FTO",
  salaryBonus: "Prime",
  citizenLicense: "Licence",
  citizen: "Citoyen",
  agent: "Compte agent",
};
const FILTERS: { key: Kind | "all"; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "citizen", label: "Citoyens" },
  { key: "vehicle", label: "Véhicules" },
  { key: "weapon", label: "Armes" },
  { key: "casier", label: "Casiers" },
  { key: "citation", label: "Contraventions" },
  { key: "mandat", label: "Mandats" },
  { key: "report", label: "Rapports" },
  { key: "complaint", label: "Plaintes" },
  { key: "deposition", label: "Dépositions" },
  { key: "saisie", label: "Saisies" },
  { key: "discipline", label: "Sanctions" },
  { key: "note", label: "Notes" },
  { key: "relation", label: "Liens" },
  { key: "fleetVehicle", label: "Flotte" },
  { key: "interview", label: "Entretiens" },
  { key: "amende", label: "Amendes" },
  { key: "convocation", label: "Convocations" },
  { key: "investigation", label: "Enquêtes internes" },
  { key: "serviceWeapon", label: "Armes de service" },
  { key: "ceremony", label: "Cérémonies" },
  { key: "protocol", label: "Protocoles" },
  { key: "resource", label: "Ressources" },
  { key: "tenue", label: "Tenues" },
  { key: "divisionAnnouncement", label: "Annonces division" },
  { key: "cadetNote", label: "Notes cadet" },
  { key: "flEvaluation", label: "Évals First Lincoln" },
  { key: "ftoPatrol", label: "Patrouilles FTO" },
  { key: "salaryBonus", label: "Primes" },
  { key: "citizenLicense", label: "Licences" },
  { key: "agent", label: "Comptes agents" },
];

export function Archive() {
  const { can } = useCan();
  const toast = useToast();
  const [filter, setFilter] = useState<Kind | "all">("all");
  const rows = useQuery(api.archive.list, filter === "all" ? {} : { kind: filter });
  const counts = useQuery(api.archive.counts);
  const restore = useMutation(api.archive.restore);
  const purge = useMutation(api.archive.purge);
  const [purging, setPurging] = useState<string | null>(null);

  const me = useMe();
  const canRestore = can("archive.restore");
  // Suppression définitive : uniquement le compte propriétaire.
  const canPurge = !!me?.agent.isOwner;

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[6px] flex items-baseline gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Archive</h1>
        <span className="text-[12.5px] text-muted">
          Éléments supprimés (soft-delete). Restaurables ; purge définitive réservée.
        </span>
      </div>

      <div className="mb-[14px] mt-3 flex flex-wrap gap-[2px] rounded-card border border-border bg-surface p-[5px]">
        {FILTERS.map((f) => {
          const n =
            f.key === "all"
              ? counts
                ? Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)
                : undefined
              : counts?.[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="rounded-[7px] px-[12px] py-[7px] text-[12.5px] font-semibold hover:bg-surface-2"
              style={filter === f.key ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
            >
              {f.label}
              {n != null ? ` (${n})` : ""}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[1fr_1.6fr_1.2fr_1fr_auto] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Type</span>
          <span>Élément</span>
          <span>Supprimé par</span>
          <span>Date</span>
          <span>Actions</span>
        </div>
        {rows === undefined ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : rows.length === 0 ? (
          <EmptyState title="Aucun élément archivé" message="Les éléments supprimés atterrissent ici avant purge." />
        ) : (
          rows.map((r) => (
            <div
              key={`${r.kind}-${r._id}`}
              className="grid grid-cols-[1fr_1.6fr_1.2fr_1fr_auto] items-center gap-3 border-b border-border px-4 py-[11px]"
            >
              <span>
                <span
                  className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold"
                  style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                >
                  {KIND_LABEL[r.kind]}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{r.label}</span>
                <span className="block text-[11.5px] text-muted">{r.summary}</span>
              </span>
              <span className="text-[12.5px] text-muted">
                <AgentTag agent={r.deletedBy} />
              </span>
              <span className="font-data text-[11.5px] text-muted">
                {new Date(r.at).toLocaleString("fr-FR")}
              </span>
              <span className="flex items-center gap-2">
                <button
                  disabled={!canRestore}
                  title={canRestore ? "Restaurer" : "Permission requise"}
                  onClick={async () => {
                    const r2 = await toast.guard(
                      restore({ kind: r.kind, id: r._id }),
                      "Restauration impossible",
                    );
                    if (r2 !== undefined) toast.success("Élément restauré.");
                  }}
                  className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[10px] py-[6px] text-[12px] font-semibold hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw className="h-[14px] w-[14px]" /> {r.kind === "agent" ? "Réactiver" : "Restaurer"}
                </button>
                {canPurge && r.kind !== "agent" && r.kind !== "citizen" &&
                  (purging === r._id ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={async () => {
                          const res = await toast.guard(
                            purge({ kind: r.kind, id: r._id }),
                            "Purge impossible",
                          );
                          setPurging(null);
                          if (res !== undefined) toast.success("Purgé définitivement.");
                        }}
                        className="rounded-[5px] px-[8px] py-[5px] text-[11px] font-semibold text-white"
                        style={{ background: "var(--danger)" }}
                      >
                        Purger
                      </button>
                      <button
                        onClick={() => setPurging(null)}
                        className="rounded-[5px] border border-border px-[8px] py-[5px] text-[11px] text-muted"
                      >
                        Annuler
                      </button>
                    </span>
                  ) : (
                    <button
                      title="Purger définitivement"
                      onClick={() => setPurging(r._id)}
                      className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface-2 text-faint hover:border-border-strong hover:text-danger"
                    >
                      <Trash2 className="h-[14px] w-[14px]" />
                    </button>
                  ))}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
