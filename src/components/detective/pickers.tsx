import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { Combobox, type ComboItem } from "./ui";
import { fmtMatricule } from "@/components/common/AgentTag";

// Sélecteurs de recherche du Detective Bureau. Chacun gère sa requête et rend un
// Combobox. `onPick` reçoit l'entité choisie.

export function AgentPicker({ divisionId, onPick, exclude = [], placeholder = "Rechercher un agent…" }: {
  divisionId: Id<"divisions">; onPick: (a: { agentId: Id<"agents">; name: string }) => void; exclude?: string[]; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const members = useQuery(api.divisionSpace.members, { divisionId }) ?? [];
  const ql = q.trim().toLowerCase();
  const items: ComboItem[] = members
    .filter((m) => !exclude.includes(m.agentId as string))
    .filter((m) => !ql || `${m.name} ${fmtMatricule(m.matricule) ?? ""}`.toLowerCase().includes(ql))
    .slice(0, 12)
    .map((m) => ({ id: m.agentId as string, label: m.name, sub: fmtMatricule(m.matricule) ?? "" }));
  return <Combobox query={q} onQuery={setQ} items={items} placeholder={placeholder}
    onPick={(it) => { const m = members.find((x) => (x.agentId as string) === it.id); if (m) { onPick({ agentId: m.agentId, name: m.name }); setQ(""); } }} />;
}

export function CitizenPicker({ onPick, placeholder = "Rechercher un citoyen (encodage)…" }: {
  onPick: (c: { citizenId: Id<"citizens">; name: string }) => void; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const res = useQuery(api.citizens.search, q.trim() ? { q } : "skip") ?? [];
  const items: ComboItem[] = res.map((c) => ({ id: c._id as string, label: `${c.prenom} ${c.nom}`, sub: c.deceased ? "†" : "" }));
  return <Combobox query={q} onQuery={setQ} items={items} placeholder={placeholder}
    onPick={(it) => { const c = res.find((x) => (x._id as string) === it.id); if (c) { onPick({ citizenId: c._id, name: `${c.prenom} ${c.nom}` }); setQ(""); } }} />;
}

export function PersonPicker({ divisionId, onPick, placeholder = "Rechercher dans le registre…" }: {
  divisionId: Id<"divisions">; onPick: (p: { personId: Id<"dbPersons">; name: string }) => void; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const res = useQuery(api.detectiveRegistry.personOptions, { divisionId, q }) ?? [];
  const items: ComboItem[] = res.map((p) => ({ id: p._id as string, label: p.name, sub: p.alias || "" }));
  return <Combobox query={q} onQuery={setQ} items={items} placeholder={placeholder}
    onPick={(it) => { const p = res.find((x) => (x._id as string) === it.id); if (p) { onPick({ personId: p._id, name: p.name }); setQ(""); } }} />;
}

export function GangPicker({ divisionId, onPick, placeholder = "Rechercher une organisation…" }: {
  divisionId: Id<"divisions">; onPick: (g: { gangId: Id<"dbGangs">; name: string }) => void; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const res = useQuery(api.detectiveGangs.gangOptions, { divisionId, q }) ?? [];
  const items: ComboItem[] = res.map((g) => ({ id: g._id as string, label: g.name, sub: g.orgType }));
  return <Combobox query={q} onQuery={setQ} items={items} placeholder={placeholder}
    onPick={(it) => { const g = res.find((x) => (x._id as string) === it.id); if (g) { onPick({ gangId: g._id, name: g.name }); setQ(""); } }} />;
}

export function VehiclePicker({ onPick, placeholder = "Rechercher un véhicule (plaque)…" }: {
  onPick: (v: { vehicleId: Id<"vehicles">; plaque: string; modele: string }) => void; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const res = useQuery(api.vehicles.search, q.trim() ? { q } : "skip") ?? [];
  const items: ComboItem[] = res.map((v) => ({ id: v._id as string, label: v.plaque, sub: v.modele ?? "" }));
  return <Combobox query={q} onQuery={setQ} items={items} placeholder={placeholder}
    onPick={(it) => { const v = res.find((x) => (x._id as string) === it.id); if (v) { onPick({ vehicleId: v._id, plaque: v.plaque, modele: v.modele ?? "" }); setQ(""); } }} />;
}
