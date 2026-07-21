import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAction, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { DocSheet, snapshotDoc, type DocEmbed } from "./OfficialDoc";
import { CitationBody, citationMeta } from "./ContraventionDoc";
import { CasierBody, casierMeta } from "./CasierDoc";

// Envoi automatique du document officiel sur Discord juste après sa création.
// L'image ne peut être produite que par le navigateur : le document est donc
// monté hors écran, capturé, puis transmis à l'action Convex qui le relaie.
type Job = { kind: "citation"; id: Id<"citations"> } | { kind: "casier"; id: Id<"casierEntries"> };

const Ctx = createContext<{ send: (job: Job) => void } | null>(null);

export function useDocSender() {
  const ctx = useContext(Ctx);
  // Absent en dehors du provider : l'envoi devient simplement inopérant.
  return ctx ?? { send: () => {} };
}

export function DocSenderProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<Job | null>(null);
  const send = useCallback((j: Job) => setJob(j), []);

  return (
    <Ctx.Provider value={{ send }}>
      {children}
      {job && (
        // Hors du flux visuel mais toujours mis en page : html-to-image a besoin
        // de dimensions réelles, `display:none` donnerait une capture vide.
        <div aria-hidden style={{ position: "fixed", top: 0, left: -20000, zIndex: -1, pointerEvents: "none" }}>
          {job.kind === "citation"
            ? <CitationSender id={job.id} onDone={() => setJob(null)} />
            : <CasierSender id={job.id} onDone={() => setJob(null)} />}
        </div>
      )}
    </Ctx.Provider>
  );
}

// Capture puis envoie dès que la feuille est rendue. `done` évite un second
// envoi si le composant re-rend (nouvelle donnée, réabonnement Convex).
function useAutoSend(ready: boolean, event: string, filename: string, embed: DocEmbed | null, path: string | undefined, onDone: () => void) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const postDocument = useAction(api.webhooks.postDocument);
  const done = useRef(false);

  useEffect(() => {
    if (!ready || !embed || done.current || !nodeRef.current) return;
    done.current = true;
    const node = nodeRef.current;
    (async () => {
      try {
        const dataUrl = await snapshotDoc(node);
        await postDocument({ event, filename, base64: dataUrl.split(",")[1], embed, path });
      } catch {
        // L'envoi Discord ne doit jamais bloquer le travail de l'agent.
      } finally {
        onDone();
      }
    })();
  }, [ready, event, filename, embed, path, postDocument, onDone]);

  return nodeRef;
}

function CitationSender({ id, onDone }: { id: Id<"citations">; onDone: () => void }) {
  const entry = useQuery(api.citations.getEntry, { citationId: id });
  const meta = entry ? citationMeta(entry, id) : null;
  const ref = useAutoSend(!!entry, "contravention.create", meta?.filename ?? "", meta?.embed ?? null, entry?.citizenId ? `/citoyen/${entry.citizenId}` : undefined, onDone);
  if (!entry || !meta) return null;
  return (
    <DocSheet
      title="Avis de contravention"
      subtitle="Document officiel · délivré par le département de police de Los Santos"
      reference={meta.reference}
      innerRef={ref}
    >
      <CitationBody entry={entry} reference={meta.reference} />
    </DocSheet>
  );
}

function CasierSender({ id, onDone }: { id: Id<"casierEntries">; onDone: () => void }) {
  const entry = useQuery(api.casier.getEntry, { entryId: id });
  const meta = entry ? casierMeta(entry, id) : null;
  const ref = useAutoSend(!!entry, "casier.create", meta?.filename ?? "", meta?.embed ?? null, entry ? `/citoyen/${entry.citizenId}` : undefined, onDone);
  if (!entry || !meta) return null;
  const label = meta.isDossier ? "Dossier d'arrestation" : "Rapport au casier";
  return (
    <DocSheet
      title={label}
      subtitle="Document officiel · délivré par le département de police de Los Santos"
      reference={meta.reference}
      innerRef={ref}
    >
      <CasierBody entry={entry} reference={meta.reference} />
    </DocSheet>
  );
}
