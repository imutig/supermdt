import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAction, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { DocSheet, snapshotDoc, sheetFilename, sheetEmbed, type DocEmbed } from "./OfficialDoc";
import { citationMeta, citationSheets } from "./ContraventionDoc";
import { casierMeta, casierSheets } from "./CasierDoc";

// Envoi automatique du document officiel sur Discord juste après sa création.
// L'image ne peut être produite que par le navigateur : le document est donc
// monté hors écran, capturé, puis transmis à l'action Convex qui le relaie.
// Un document peut compter plusieurs feuilles (rapport narratif long) : chacune
// est capturée puis envoyée dans l'ordre.
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

// Rend toutes les feuilles hors écran puis, une fois montées, les capture et les
// envoie séquentiellement. `done` évite un second envoi si le composant re-rend
// (nouvelle donnée, réabonnement Convex).
function AutoSheets({
  sheets,
  title,
  subtitle,
  reference,
  event,
  filename,
  embed,
  path,
  onDone,
}: {
  sheets: ReactNode[];
  title: string;
  subtitle: string;
  reference: string;
  event: string;
  filename: string;
  embed: DocEmbed;
  path: string | undefined;
  onDone: () => void;
}) {
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  const postDocument = useAction(api.webhooks.postDocument);
  const done = useRef(false);
  const count = sheets.length;

  useEffect(() => {
    if (done.current) return;
    const nodes = refs.current.slice(0, count);
    // On attend que toutes les feuilles soient montées avant de capturer.
    if (nodes.length < count || nodes.some((n) => !n)) return;
    done.current = true;
    void (async () => {
      try {
        for (let i = 0; i < count; i++) {
          const node = nodes[i];
          if (!node) continue;
          const dataUrl = await snapshotDoc(node);
          await postDocument({
            event,
            filename: sheetFilename(filename, i, count),
            base64: dataUrl.split(",")[1],
            embed: sheetEmbed(embed, i, count),
            path: i === 0 ? path : undefined,
          });
        }
      } catch {
        // L'envoi Discord ne doit jamais bloquer le travail de l'agent.
      } finally {
        onDone();
      }
    })();
  }, [count, event, filename, embed, path, postDocument, onDone]);

  return (
    <>
      {sheets.map((body, i) => (
        <DocSheet
          key={i}
          title={title}
          subtitle={subtitle}
          reference={reference}
          sheetIndex={i + 1}
          sheetCount={count}
          innerRef={(el) => { refs.current[i] = el; }}
        >
          {body}
        </DocSheet>
      ))}
    </>
  );
}

const SUBTITLE = "Document officiel · délivré par le département de police de Los Santos";

function CitationSender({ id, onDone }: { id: Id<"citations">; onDone: () => void }) {
  const entry = useQuery(api.citations.getEntry, { citationId: id });
  if (!entry) return null;
  const meta = citationMeta(entry, id);
  return (
    <AutoSheets
      sheets={citationSheets(entry, meta.reference)}
      title="Avis de contravention"
      subtitle={SUBTITLE}
      reference={meta.reference}
      event="contravention.create"
      filename={meta.filename}
      embed={meta.embed}
      path={entry.citizenId ? `/citoyen/${entry.citizenId}` : undefined}
      onDone={onDone}
    />
  );
}

function CasierSender({ id, onDone }: { id: Id<"casierEntries">; onDone: () => void }) {
  const entry = useQuery(api.casier.getEntry, { entryId: id });
  if (!entry) return null;
  const meta = casierMeta(entry, id);
  const label = meta.isDossier ? "Dossier d'arrestation" : "Rapport au casier";
  return (
    <AutoSheets
      sheets={casierSheets(entry, meta.reference)}
      title={label}
      subtitle={SUBTITLE}
      reference={meta.reference}
      event="casier.create"
      filename={meta.filename}
      embed={meta.embed}
      path={`/citoyen/${entry.citizenId}`}
      onDone={onDone}
    />
  );
}
