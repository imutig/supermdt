import { useState } from "react";
import { Car } from "lucide-react";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Clover } from "@/components/common/Clover";
import { LoadMore } from "@/components/common/Pagination";
import { VehicleModal } from "@/components/dossier/VehicleModal";
import { FleetPanel } from "@/components/fleet/FleetPanel";
import { TripsPanel } from "@/components/fleet/TripsPanel";

type Tab = "citoyens" | "flotte" | "sorties";

export function Vehicules() {
  const { can } = useCan();
  const canCreate = can("vehicules.create");
  const canEdit = can("vehicules.edit");
  const canFleet = can("flotte.view");
  const [tab, setTab] = useState<Tab>("citoyens");
  const [q, setQ] = useState("");
  const searching = q.trim().length > 0;
  const searchRes = useQuery(api.vehicles.list, searching ? { q } : "skip");
  const paged = usePaginatedQuery(api.vehicles.page, searching ? "skip" : {}, { initialNumItems: 20 });
  const vehicles = searching ? (searchRes ?? []) : paged.results;
  const loadingFirst = searching ? searchRes === undefined : paged.status === "LoadingFirstPage";
  const [modal, setModal] = useState<{ id?: Id<"vehicles"> } | null>(null);

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className="mdt-press rounded-[9px] px-[14px] py-[8px] text-[13px] font-semibold"
      style={tab === id ? { background: "var(--accent-soft)", color: "var(--accent)" } : { color: "var(--muted)" }}
    >
      {label}
    </button>
  );

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Véhicules</h1>
        <div className="ml-2 flex gap-1">
          <TabBtn id="citoyens" label="Registre civil" />
          {canFleet && <TabBtn id="flotte" label="Véhicules LSPD" />}
          {canFleet && <TabBtn id="sorties" label="Sorties véhicules" />}
        </div>
        <div className="flex-1" />
        {tab === "citoyens" && canCreate && <button onClick={() => setModal({})} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]"><Clover color="#fff" size={17} /> Véhicule</button>}
      </div>

      {tab === "flotte" ? <FleetPanel /> : tab === "sorties" ? <TripsPanel /> : (
      <>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (plaque, modèle, couleur, type)…" className="mb-[14px] h-10 w-full max-w-[440px] rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[56px_1fr_1.2fr_.9fr_.9fr_1.2fr_1fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span />
          <span>Plaque</span><span>Modèle</span><span>Couleur</span><span>Type</span><span>Propriétaire</span><span>Signalements</span>
        </div>
        {loadingFirst && <div className="p-4"><SkeletonRows rows={6} /></div>}
        {!loadingFirst && vehicles.length === 0 && <EmptyState title={q ? "Aucun véhicule trouvé" : "Aucun véhicule enregistré"} message={q ? "Essayez un autre terme." : "Enregistrez un véhicule pour commencer le registre."} />}
        {vehicles.map((v) => (
          <div key={v._id} onClick={() => setModal({ id: v._id })} className="grid cursor-pointer grid-cols-[56px_1fr_1.2fr_.9fr_.9fr_1.2fr_1fr] items-center gap-3 border-b border-border px-4 py-3 hover:bg-surface-2">
            <span>
              {v.photoUrl
                ? <img src={v.photoUrl} alt="" className="h-[36px] w-[48px] rounded-[5px] border border-border object-cover" />
                : <span className="flex h-[36px] w-[48px] items-center justify-center rounded-[5px] border border-dashed border-border text-faint"><Car className="h-[15px] w-[15px]" /></span>}
            </span>
            <span className="font-data text-[13px] font-semibold">{v.plaque}</span>
            <span className="text-[13px]">{v.modele}</span>
            <span className="text-[12.5px] text-muted">{v.couleur}</span>
            <span className="text-[12.5px] text-muted">{v.type}</span>
            <span className="truncate text-[12.5px] text-muted">{v.ownerName ?? "-"}</span>
            <span className="flex flex-wrap gap-[4px]">
              {v.flags.length === 0 ? <span className="text-[12px] text-faint">-</span> : v.flags.map((f, i) => (
                <span key={i} className="rounded-[5px] px-[7px] py-[2px] text-[10.5px] font-semibold" style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>{f}</span>
              ))}
            </span>
          </div>
        ))}
        {!searching && <LoadMore status={paged.status} onLoadMore={() => paged.loadMore(20)} count={vehicles.length} label="véhicules" />}
      </div>
      </>
      )}

      {modal && <VehicleModal vehicleId={modal.id} canEdit={canEdit} onClose={() => setModal(null)} />}
    </div>
  );
}
