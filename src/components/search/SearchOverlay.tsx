import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, UserPlus, Car, Home, FileText, Crosshair, BookText, CalendarDays,
  Users, BarChart3, User, Power, ListChecks, Boxes, type LucideIcon,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useApp } from "@/providers/app-state";
import { CreateCitizenModal } from "@/components/dossier/CreateCitizenModal";
import { WeaponModal } from "@/pages/Armes";
import { VehicleModal } from "@/components/dossier/VehicleModal";
import { useMe } from "@/hooks/useMe";
import { useCan } from "@/hooks/useCan";
import { useService } from "@/hooks/useService";

function splitName(q: string) {
  const parts = q.trim().split(/\s+/);
  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
  return { prenom: cap(parts[0] ?? ""), nom: parts.slice(1).map(cap).join(" ") };
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Item = { key: string; icon: LucideIcon; title: string; sub?: string; tag?: string; mono?: boolean; run: () => void };

export function SearchOverlay() {
  const { searchOpen, closeSearch } = useApp();
  const me = useMe();
  const { can } = useCan();
  const { onDuty, toggle: toggleDuty } = useService();
  const canCreateCitizen = !!me && (me.agent.isOwner || me.grade?.corps === "ETAT_MAJOR" || me.grade?.corps === "SUPERVISION" || me.grade?.corps === "OPERATIONNEL");
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [createCitizen, setCreateCitizen] = useState<{ prenom: string; nom: string } | null>(null);
  const [createVehicle, setCreateVehicle] = useState<{ plaque: string } | null>(null);
  const [createWeapon, setCreateWeapon] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useQuery(api.citizens.search, searchOpen && q.trim() && can("citoyens.view") ? { q } : "skip");
  const vehResults = useQuery(api.vehicles.search, searchOpen && q.trim() && can("vehicules.view") ? { q } : "skip");
  const wpnResults = useQuery(api.weapons.list, searchOpen && q.trim() && can("armes.view") ? { q } : "skip");
  const repResults = useQuery(api.reports.search, searchOpen && q.trim() && can("rapports.view") ? { q } : "skip");

  const close = () => { closeSearch(); setQ(""); setSel(0); };
  const go = (id: string) => { close(); navigate(`/citoyen/${id}`); };

  // ---- Commandes (navigation + actions) ----
  const commands = useMemo<Item[]>(() => {
    const nav = (to: string) => () => { close(); navigate(to); };
    const raw: (Item & { perm?: string; keywords?: string })[] = [
      { key: "cmd-new-cit", icon: UserPlus, title: "Encoder un citoyen", sub: "Nouveau dossier citoyen", keywords: "encoder creer nouveau citoyen dossier", perm: "citoyens.create", run: () => setCreateCitizen({ prenom: "", nom: "" }) },
      { key: "cmd-new-veh", icon: Car, title: "Encoder un véhicule", sub: "Nouvelle immatriculation", keywords: "encoder creer nouveau vehicule plaque", perm: "vehicules.create", run: () => setCreateVehicle({ plaque: "" }) },
      { key: "cmd-new-wpn", icon: Crosshair, title: "Encoder une arme", sub: "Nouvelle arme au registre", keywords: "encoder creer nouvelle arme serie", perm: "armes.create", run: () => setCreateWeapon(true) },
      { key: "cmd-home", icon: Home, title: "Accueil", sub: "Recherche / Dossiers", keywords: "accueil dashboard recherche", run: nav("/") },
      { key: "cmd-service", icon: Power, title: onDuty ? "Terminer le service" : "Prendre le service", sub: onDuty ? "Vous êtes en service" : "Vous êtes hors service", keywords: "service duty on off prise", perm: "service.self", run: () => { close(); toggleDuty(); } },
      { key: "cmd-rapports", icon: FileText, title: "Rapports", keywords: "rapports reports", perm: "rapports.view", run: nav("/rapports") },
      { key: "cmd-armes", icon: Crosshair, title: "Armes", keywords: "armes weapons", perm: "armes.view", run: nav("/armes") },
      { key: "cmd-vehicules", icon: Car, title: "Véhicules", keywords: "vehicules cars", perm: "vehicules.view", run: nav("/vehicules") },
      { key: "cmd-saisies", icon: Boxes, title: "Saisies", keywords: "saisies", perm: "saisies.view", run: nav("/saisies") },
      { key: "cmd-codepenal", icon: BookText, title: "Code pénal", keywords: "code penal loi", perm: "codepenal.view", run: nav("/codepenal") },
      { key: "cmd-protocoles", icon: ListChecks, title: "Protocoles", keywords: "protocoles sop", perm: "protocoles.view", run: nav("/protocoles") },
      { key: "cmd-calendrier", icon: CalendarDays, title: "Calendrier", keywords: "calendrier events", perm: "calendrier.view", run: nav("/calendrier") },
      { key: "cmd-effectif", icon: Users, title: "Effectif", keywords: "effectif agents", perm: "effectif.view", run: nav("/effectif") },
      { key: "cmd-stats", icon: BarChart3, title: "Statistiques", keywords: "statistiques stats", perm: "stats.view", run: nav("/statistiques") },
      { key: "cmd-profil", icon: User, title: "Mon profil", keywords: "profil profile compte", run: nav("/profil") },
    ];
    const nq = norm(q);
    return raw
      .filter((c) => !c.perm || can(c.perm))
      .filter((c) => !nq || norm(`${c.title} ${c.keywords ?? ""}`).includes(nq))
      .map(({ perm: _perm, keywords: _kw, ...item }) => item);
  }, [q, onDuty, can]); // eslint-disable-line react-hooks/exhaustive-deps

  const { prenom, nom } = splitName(q);
  const plaque = q.trim().toUpperCase();
  const noCitizens = !!results && results.length === 0;
  const noVehicles = !!vehResults && vehResults.length === 0;

  const citizenItems = useMemo<Item[]>(() => (results ?? []).map((c) => ({
    key: `cit-${c._id}`, icon: User, title: `${c.prenom} ${c.nom}`, sub: c.dateNaissance ?? "date inconnue", tag: c.deceased ? "✝ Décédé" : "Citoyen", run: () => go(c._id),
  })), [results]); // eslint-disable-line react-hooks/exhaustive-deps
  const vehicleItems = useMemo<Item[]>(() => (vehResults ?? []).filter((v) => v.ownerId).map((v) => ({
    key: `veh-${v._id}`, icon: Car, title: v.plaque, mono: true, sub: `${v.modele}${v.ownerName ? ` · ${v.ownerName}` : ""}`, tag: "Propriétaire", run: () => v.ownerId && go(v.ownerId),
  })), [vehResults]); // eslint-disable-line react-hooks/exhaustive-deps

  const weaponItems = useMemo<Item[]>(() => (wpnResults ?? []).slice(0, 6).map((w) => ({
    key: `wpn-${w._id}`, icon: Crosshair, title: w.serial, mono: true,
    sub: [w.typeName, w.modele, w.ownerName].filter(Boolean).join(" · "), tag: "Arme",
    run: () => { close(); navigate("/armes"); },
  })), [wpnResults]); // eslint-disable-line react-hooks/exhaustive-deps
  const reportItems = useMemo<Item[]>(() => (repResults ?? []).slice(0, 6).map((r) => ({
    key: `rep-${r._id}`, icon: FileText, title: r.title, sub: r.typeName, tag: "Rapport",
    run: () => { close(); navigate(`/rapport/${r._id}`); },
  })), [repResults]); // eslint-disable-line react-hooks/exhaustive-deps

  // Une plaque : suite alphanumérique sans espace, pas un nom de personne.
  const looksLikePlaque = /^[A-Z0-9]{4,10}$/.test(plaque);

  const createItems = useMemo<Item[]>(() => {
    const arr: Item[] = [];
    // Toujours proposé dès qu'un nom complet est saisi : des homonymes existent,
    // la présence d'un David ne doit pas empêcher de créer David Molas.
    if (q.trim() && canCreateCitizen && prenom && nom) {
      arr.push({ key: "new-cit", icon: UserPlus, title: `Créer le dossier de ${prenom} ${nom}`, tag: "Nouveau", run: () => setCreateCitizen({ prenom, nom }) });
    } else if (q.trim() && canCreateCitizen && prenom && noCitizens) {
      arr.push({ key: "new-cit", icon: UserPlus, title: `Créer le dossier de ${prenom}`, tag: "Nouveau", run: () => setCreateCitizen({ prenom, nom: "" }) });
    }
    if (q.trim() && looksLikePlaque && noVehicles) arr.push({ key: "new-veh", icon: Car, title: `Enregistrer le véhicule ${plaque}`, mono: true, tag: "Nouveau", run: () => setCreateVehicle({ plaque }) });
    return arr;
  }, [q, noCitizens, noVehicles, canCreateCitizen, prenom, nom, plaque, looksLikePlaque]);

  const sections = useMemo(() => [
    { label: q.trim() ? "Commandes" : "Aller à / Actions", items: commands },
    { label: "Citoyens", items: citizenItems },
    { label: "Véhicules", items: vehicleItems },
    { label: "Armes", items: weaponItems },
    { label: "Rapports", items: reportItems },
    { label: "Créer", items: createItems },
  ].filter((s) => s.items.length > 0), [q, commands, citizenItems, vehicleItems, weaponItems, reportItems, createItems]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { if (sel >= flat.length) setSel(0); }, [flat.length, sel]);

  // Fait défiler l'élément sélectionné dans la vue.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!searchOpen) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); flat[sel]?.run(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };

  let idxCounter = -1;

  return (
    <div
      onClick={close}
      className="absolute inset-0 z-40 flex items-start justify-center pt-[12vh]"
      style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[640px] max-w-[92vw] overflow-hidden rounded-[14px] border border-border-strong bg-elev shadow-[0_24px_70px_rgba(0,0,0,.32)]"
        style={{ animation: "mdtPop .18s ease" }}
      >
        <div className="flex items-center gap-3 border-b border-border px-[18px] py-4">
          <Search className="h-4 w-4 flex-shrink-0 text-faint" strokeWidth={2} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Nom, date de naissance, plaque, n° de série, rapport, commande…"
            autoFocus
            className="flex-1 border-none bg-transparent text-[16px] text-text outline-none"
          />
          <span className="rounded-[5px] border border-border px-[7px] py-[2px] font-data text-[11px] text-faint">ESC</span>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {q.trim() && (results === undefined || vehResults === undefined) && flat.length === commands.length && (
            <div className="px-3 py-4 text-center text-[12.5px] text-faint">Recherche…</div>
          )}
          {sections.map((section) => (
            <div key={section.label} className="mb-[6px]">
              <div className="px-3 pb-[6px] pt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">{section.label}</div>
              {section.items.map((item) => {
                idxCounter++;
                const idx = idxCounter;
                const Icon = item.icon;
                const active = idx === sel;
                return (
                  <button
                    key={item.key}
                    data-idx={idx}
                    onClick={item.run}
                    onMouseEnter={() => setSel(idx)}
                    className="flex w-full items-center gap-3 rounded-[9px] px-3 py-[9px] text-left"
                    style={active ? { background: "var(--accent-soft)" } : undefined}
                  >
                    <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[7px] border border-border bg-surface-2 text-muted" style={active ? { color: "var(--accent)", borderColor: "var(--accent)" } : undefined}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13.5px] font-semibold ${item.mono ? "font-data" : ""}`}>{item.title}</span>
                      {item.sub && <span className="block text-[11.5px] text-muted">{item.sub}</span>}
                    </span>
                    {item.tag && <span className="text-[11px] text-faint">{item.tag}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && (
            <div className="px-3 py-10 text-center text-[12.5px] text-faint">
              {q.trim() ? `Aucun résultat pour « ${q.trim()} ».` : "Tape un nom, une plaque, ou une commande…"}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border px-[18px] py-[10px] text-[11px] text-faint">
          <span><b className="font-data text-muted">↑↓</b> naviguer</span>
          <span><b className="font-data text-muted">↵</b> valider</span>
          <div className="flex-1" />
          <span>Citoyens · véhicules · armes · rapports</span>
        </div>
      </div>

      {createCitizen && (
        <CreateCitizenModal prenom={createCitizen.prenom} nom={createCitizen.nom} onClose={() => setCreateCitizen(null)} onCreated={(id) => { setCreateCitizen(null); go(id); }} />
      )}
      {createWeapon && (
        <WeaponModal canCreate canEdit canDelete={false} onClose={() => setCreateWeapon(false)} />
      )}
      {createVehicle && (
        <VehicleModal canEdit initialPlaque={createVehicle.plaque} onClose={() => setCreateVehicle(null)} />
      )}
    </div>
  );
}
