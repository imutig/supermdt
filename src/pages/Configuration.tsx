import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { ListEditor } from "@/components/config/ListEditor";
import { WebhooksEditor } from "@/components/config/WebhooksEditor";

type Section =
  | "grades"
  | "divisions"
  | "mandatTypes"
  | "vehicleFlagTypes"
  | "licenseTypes"
  | "sanctionTypes"
  | "callsignTypes"
  | "qualifications"
  | "disciplineSanctionTypes"
  | "resourceCategories"
  | "defconLevels"
  | "weaponTypes"
  | "complaintStatuses"
  | "dossierStatuses"
  | "ethnies"
  | "hairColors"
  | "eyeColors"
  | "citizenGroups"
  | "saisieObjectTypes"
  | "weaponOrigins"
  | "dispatchSectors"
  | "webhooks"
  | "penal";

// Regroupées par domaine : la liste à plat était devenue illisible.
const GROUPS: { group: string; items: { key: Section; label: string }[] }[] = [
  {
    group: "Effectif",
    items: [
      { key: "grades", label: "Grades" },
      { key: "divisions", label: "Divisions" },
      { key: "callsignTypes", label: "Callsigns" },
      { key: "qualifications", label: "Formations & spécialités" },
      { key: "disciplineSanctionTypes", label: "Sanctions disciplinaires" },
    ],
  },
  {
    group: "Citoyens",
    items: [
      { key: "ethnies", label: "Ethnies" },
      { key: "hairColors", label: "Couleurs de cheveux" },
      { key: "eyeColors", label: "Couleurs des yeux" },
      { key: "citizenGroups", label: "Groupes / appartenances" },
      { key: "licenseTypes", label: "Licences / permis" },
      { key: "vehicleFlagTypes", label: "Flags véhicule" },
    ],
  },
  {
    group: "Procédure",
    items: [
      { key: "penal", label: "Code pénal" },
      { key: "mandatTypes", label: "Types de mandat" },
      { key: "sanctionTypes", label: "Sanctions pénales" },
      { key: "dossierStatuses", label: "Statuts dossier arrestation" },
      { key: "complaintStatuses", label: "Statuts de plainte" },
      { key: "weaponTypes", label: "Types d'arme" },
      { key: "weaponOrigins", label: "Origines d'arme" },
      { key: "saisieObjectTypes", label: "Types d'objet saisi" },
    ],
  },
  {
    group: "Opérations",
    items: [
      { key: "dispatchSectors", label: "Dispatch : secteurs" },
      { key: "defconLevels", label: "Niveaux DEFCON" },
    ],
  },
  {
    group: "Documentation",
    items: [{ key: "resourceCategories", label: "Catégories Ressources" }],
  },
  {
    group: "Intégrations",
    items: [{ key: "webhooks", label: "Webhooks Discord" }],
  },
];
const SIMPLE_SECTIONS: { key: Section; label: string; table: string; desc?: string }[] = [
  { key: "weaponTypes", label: "Types d'arme", table: "weaponTypes" },
  { key: "weaponOrigins", label: "Origines d'arme", table: "weaponOrigins", desc: "Provenance d'une arme : légale, militaire, marché noir…" },
  { key: "complaintStatuses", label: "Statuts de plainte", table: "complaintStatuses" },
  { key: "dossierStatuses", label: "Statuts dossier arrestation", table: "dossierStatuses", desc: "En attente de jugement, En cellule, Jugé…" },
  { key: "ethnies", label: "Ethnies", table: "ethnies" },
  { key: "hairColors", label: "Couleurs de cheveux", table: "hairColors" },
  { key: "eyeColors", label: "Couleurs des yeux", table: "eyeColors" },
  { key: "citizenGroups", label: "Groupes / appartenances", table: "citizenGroups" },
  { key: "saisieObjectTypes", label: "Types d'objet saisi", table: "saisieObjectTypes", desc: "« Autre » est toujours proposé en plus (saisie libre)." },
];

const CORPS = [
  { value: "OPERATIONNEL", label: "Opérationnel" },
  { value: "SUPERVISION", label: "Supervision" },
  { value: "ETAT_MAJOR", label: "État-Major" },
];
const QUAL_KIND = [
  { value: "FORMATION", label: "Formation" },
  { value: "SPECIALITE", label: "Spécialité" },
];
const TIER = [
  { value: "PRINCIPALE", label: "Principale" },
  { value: "SECONDAIRE", label: "Secondaire" },
];

export function Configuration() {
  const [section, setSection] = useState<Section>("grades");
  const data = useQuery(api.configEditors.all);
  const dispatch = useQuery(api.dispatch.configList);
  const sectorUpsert = useMutation(api.dispatch.sectorUpsert);
  const sectorRemove = useMutation(api.dispatch.sectorRemove);
  const navigate = useNavigate();

  const qualificationCreate = useMutation(api.configEditors.qualificationCreate);
  const qualificationUpdate = useMutation(api.configEditors.qualificationUpdate);
  const qualificationRemove = useMutation(api.configEditors.qualificationRemove);
  const gradeCreate = useMutation(api.configEditors.gradeCreate);
  const gradeUpdate = useMutation(api.configEditors.gradeUpdate);
  const gradeRemove = useMutation(api.configEditors.gradeRemove);
  const gradeMove = useMutation(api.configEditors.gradeMove);
  const divisionCreate = useMutation(api.configEditors.divisionCreate);
  const divisionUpdate = useMutation(api.configEditors.divisionUpdate);
  const divisionRemove = useMutation(api.configEditors.divisionRemove);
  const namedCreate = useMutation(api.configEditors.namedCreate);
  const namedUpdate = useMutation(api.configEditors.namedUpdate);
  const namedRemove = useMutation(api.configEditors.namedRemove);
  const defconCreate = useMutation(api.configEditors.defconCreate);
  const defconUpdate = useMutation(api.configEditors.defconUpdate);
  const defconRemove = useMutation(api.configEditors.defconRemove);

  // Wrappers pour les tables "named" génériques.
  const named = (table: string) => ({
    onCreate: (v: Record<string, unknown>) =>
      namedCreate({ table, ...(v as { name: string; code?: string; color?: string; marksWanted?: boolean }) }),
    onUpdate: (id: string, v: Record<string, unknown>) =>
      namedUpdate({ table, id, ...(v as { name: string; code?: string; color?: string; marksWanted?: boolean }) }),
    onRemove: (id: string) => namedRemove({ table, id }),
  });

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <h1 className="m-0 mb-[4px] text-[21px] font-bold tracking-tight">Configuration</h1>
      <div className="mb-[18px] text-[12.5px] text-muted">
        Référentiels éditables par l'État-Major (config-as-data).
      </div>

      <div className="grid grid-cols-[210px_1fr] items-start gap-[18px]">
        <div className="flex flex-col gap-[10px] rounded-card border border-border bg-surface p-[8px]">
          {GROUPS.map((g) => (
            <div key={g.group}>
              <div className="px-[11px] pb-[4px] pt-[3px] text-[10px] font-bold uppercase tracking-[0.09em] text-faint">
                {g.group}
              </div>
              <div className="flex flex-col gap-[2px]">
                {g.items.map((s2) => (
                  <button
                    key={s2.key}
                    onClick={() => setSection(s2.key)}
                    className="rounded-sm px-[11px] py-[7px] text-left text-[12.5px] font-semibold hover:bg-surface-2"
                    style={section === s2.key ? { background: "var(--accent-soft)", color: "var(--accent)" } : { color: "var(--muted)" }}
                  >
                    {s2.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="min-w-0">
          {section === "webhooks" && <WebhooksEditor />}
          {section === "grades" && (
            <ListEditor
              title="Grades"
              description="Ordre hiérarchique : le grade le PLUS BAS de la liste est le plus élevé de la station. Les flèches déplacent un grade, ce qui détermine qui peut agir sur qui. « Abrév. » = tag court sur les cartes du dispatch (vide = 3 premières lettres). « Couleur » teinte le grade dans l'organigramme et les tags. « Extérieur » = accès au MDT sans faire partie de l'effectif (DOJ, EMS)."
              rows={data?.grades}
              columns={[
                { key: "name", label: "Nom", width: "1.4fr" },
                { key: "abbrev", label: "Abrév.", width: ".7fr" },
                { key: "corps", label: "Corps", type: "select", options: CORPS, width: "1.2fr" },
                { key: "color", label: "Couleur", type: "color", width: "1fr" },
                { key: "external", label: "Extérieur", type: "bool", width: ".6fr" },
              ]}
              onCreate={(v) => gradeCreate(v as { name: string; abbrev?: string; corps: "OPERATIONNEL" | "SUPERVISION" | "ETAT_MAJOR"; color?: string; external?: boolean })}
              onUpdate={(id, v) => gradeUpdate({ id: id as never, ...(v as { name: string; abbrev?: string; corps: "OPERATIONNEL" | "SUPERVISION" | "ETAT_MAJOR"; color?: string; external?: boolean }) })}
              onRemove={(id) => gradeRemove({ id: id as never })}
              onMove={(id, direction) => gradeMove({ id: id as never, direction })}
            />
          )}
          {section === "qualifications" && (
            <ListEditor
              title="Formations & spécialités"
              description="Attribuées agent par agent depuis sa fiche (permission « Attribuer des formations et spécialités »). Purement déclaratives : elles qualifient l'agent et n'ouvrent aucun droit. Le sigle est le tag court affiché sur la fiche."
              rows={data?.qualifications}
              columns={[
                { key: "code", label: "Sigle", width: ".7fr" },
                { key: "name", label: "Intitulé", width: "2fr" },
                { key: "kind", label: "Type", type: "select", options: QUAL_KIND, width: "1.1fr" },
                { key: "color", label: "Couleur", width: "1fr", type: "color" },
              ]}
              onCreate={(v) => qualificationCreate(v as { code: string; name: string; kind: "FORMATION" | "SPECIALITE"; color?: string })}
              onUpdate={(id, v) => qualificationUpdate({ id: id as never, ...(v as { code: string; name: string; kind: "FORMATION" | "SPECIALITE"; color?: string }) })}
              onRemove={(id) => qualificationRemove({ id: id as never })}
            />
          )}
          {section === "divisions" && (
            <ListEditor
              title="Divisions"
              rows={data?.divisions}
              columns={[
                { key: "name", label: "Nom", width: "1.4fr" },
                { key: "tier", label: "Tier", type: "select", options: TIER, width: "1.2fr" },
                { key: "color", label: "Couleur", type: "color", width: "1fr" },
              ]}
              onCreate={(v) => divisionCreate(v as { name: string; tier: "PRINCIPALE" | "SECONDAIRE"; color?: string })}
              onUpdate={(id, v) => divisionUpdate({ id: id as never, ...(v as { name: string; tier: "PRINCIPALE" | "SECONDAIRE"; color?: string }) })}
              onRemove={(id) => divisionRemove({ id: id as never })}
            />
          )}
          {section === "mandatTypes" && (
            <ListEditor
              title="Types de mandat"
              description="« Marque recherché » : un mandat actif de ce type place le citoyen en RECHERCHÉ."
              rows={data?.mandatTypes}
              columns={[
                { key: "name", label: "Nom", width: "2fr" },
                { key: "marksWanted", label: "Marque recherché", type: "bool", width: "1fr" },
              ]}
              {...named("mandatTypes")}
            />
          )}
          {section === "vehicleFlagTypes" && (
            <ListEditor
              title="Flags véhicule"
              rows={data?.vehicleFlagTypes}
              columns={[
                { key: "name", label: "Nom", width: "2fr" },
                { key: "color", label: "Couleur", type: "color", width: "1fr" },
              ]}
              {...named("vehicleFlagTypes")}
            />
          )}
          {section === "licenseTypes" && (
            <ListEditor title="Licences / permis" rows={data?.licenseTypes} columns={[{ key: "name", label: "Nom" }]} {...named("licenseTypes")} />
          )}
          {section === "sanctionTypes" && (
            <ListEditor title="Sanctions pénales" description="Ex. Saisie stupéfiants, Saisie arme." rows={data?.sanctionTypes} columns={[{ key: "name", label: "Nom" }]} {...named("sanctionTypes")} />
          )}
          {section === "callsignTypes" && (
            <ListEditor
              title="Callsigns"
              rows={data?.callsignTypes.map((c) => ({ ...c, name: c.label }))}
              columns={[
                { key: "code", label: "Code", width: "1fr" },
                { key: "name", label: "Libellé", width: "2fr" },
              ]}
              {...named("callsignTypes")}
            />
          )}
          {section === "disciplineSanctionTypes" && (
            <ListEditor title="Sanctions disciplinaires" description="Ex. Avertissement, Blâme, Mise à pied." rows={data?.disciplineSanctionTypes} columns={[{ key: "name", label: "Nom" }]} {...named("disciplineSanctionTypes")} />
          )}
          {section === "resourceCategories" && (
            <ListEditor title="Catégories Ressources" description="Rubriques du livret (codes radio, patrouilles...)." rows={data?.resourceCategories} columns={[{ key: "name", label: "Nom" }]} {...named("resourceCategories")} />
          )}
          {SIMPLE_SECTIONS.filter((s) => s.key === section).map((s) => (
            <ListEditor
              key={s.key}
              title={s.label}
              description={s.desc}
              rows={data ? (data[s.table as keyof typeof data] as { _id: string; name: string }[]) : undefined}
              columns={[{ key: "name", label: "Nom" }]}
              {...named(s.table)}
            />
          ))}
          {section === "dispatchSectors" && (
            <ListEditor
              title="Dispatch : secteurs"
              description="Secteurs proposés quand une patrouille passe « En patrouille ». L'option « Autre » (saisie libre) est toujours proposée en plus."
              rows={dispatch?.sectors}
              columns={[{ key: "name", label: "Nom" }]}
              onCreate={(v) => sectorUpsert({ name: (v.name as string), active: true })}
              onUpdate={(id, v) => sectorUpsert({ id: id as never, name: (v.name as string), active: true })}
              onRemove={(id) => sectorRemove({ id: id as never })}
            />
          )}
          {section === "defconLevels" && (
            <ListEditor
              title="Niveaux DEFCON"
              description="Le DEFCON n'affecte plus les amendes (100%) ; ces niveaux restent affichés en global."
              rows={data?.defconLevels}
              columns={[
                { key: "name", label: "Nom", width: "1.2fr" },
                { key: "color", label: "Couleur", type: "color", width: "1fr" },
                { key: "fineMultiplier", label: "Mult.", type: "number", width: ".7fr" },
                { key: "sensitiveFineMultiplier", label: "Mult. sensible", type: "number", width: ".9fr" },
              ]}
              onCreate={(v) => defconCreate(v as { name: string; color?: string; fineMultiplier: number; sensitiveFineMultiplier: number })}
              onUpdate={(id, v) => defconUpdate({ id: id as never, ...(v as { name: string; color?: string; fineMultiplier: number; sensitiveFineMultiplier: number }) })}
              onRemove={(id) => defconRemove({ id: id as never })}
            />
          )}
          {section === "penal" && (
            <div className="rounded-card border border-border bg-surface p-6 text-[13px] text-muted">
              L'édition complète du code pénal (catégories, charges, amendes, seuils min/max) se
              fait depuis la page{" "}
              <span onClick={() => navigate("/codepenal")} className="cursor-pointer font-semibold text-accent hover:underline">
                Code pénal
              </span>
              , en mode édition.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
