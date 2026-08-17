import { useRef, useState, type ReactNode, type Ref } from "react";
import { X, Download, Send } from "lucide-react";
import { toPng } from "html-to-image";
import { useAction } from "convex/react";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { fmtMatricule } from "@/components/common/AgentTag";
import { useToast } from "@/providers/toast";

export type DocEmbed = {
  title: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
};

// Feuille du document officiel : en-tête au logo, corps, pied signé et cacheté.
// Isolée du modal pour pouvoir être rendue hors écran lors d'un envoi automatique.
export function DocSheet({
  title,
  subtitle,
  reference,
  innerRef,
  sheetIndex,
  sheetCount,
  children,
}: {
  title: string;
  subtitle: string;
  reference: string;
  innerRef?: Ref<HTMLDivElement>;
  // Numéro de feuille (1-based) et total : l'indicateur « Feuille k/N » n'apparaît
  // que sur un document multi-feuilles.
  sheetIndex?: number;
  sheetCount?: number;
  children: ReactNode;
}) {
  const me = useMe();
  const officerName = me ? `${fmtMatricule(me.agent.matricule) ?? ""} ${me.agent.prenomRP} ${me.agent.nomRP}`.trim() : "-";
  const multi = !!sheetCount && sheetCount > 1;

  return (
    <div ref={innerRef} className="h-fit bg-white p-[48px] text-[#0b0d10]" style={{ width: 820, flexShrink: 0, fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div className="flex items-center gap-4 border-b-2 pb-4" style={{ borderColor: "#49A24A" }}>
        <img src="/logos/logo-badge-light.svg" alt="Station 13" style={{ width: 70, height: 70 }} />
        <div className="flex-1">
          <div className="text-[19px] font-extrabold tracking-tight">LSPD · Station 13</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: "#2E6B2F" }}>Los Santos Police Department · Newton Street</div>
        </div>
        <div className="text-right text-[10.5px]" style={{ color: "#5c626e" }}>
          <div className="font-data font-semibold">{reference}</div>
          <div>Émis le {new Date().toLocaleDateString("fr-FR")}</div>
          {multi && <div className="font-semibold" style={{ color: "#2E6B2F" }}>Feuille {sheetIndex}/{sheetCount}</div>}
        </div>
      </div>

      <h1 className="mb-1 mt-6 text-center text-[22px] font-extrabold uppercase tracking-[0.06em]">{title}</h1>
      <div className="mb-6 text-center text-[11.5px]" style={{ color: "#5c626e" }}>{subtitle}</div>

      {children}

      <div className="mt-8 flex items-end justify-between border-t pt-4 text-[11px]" style={{ borderColor: "#e5e8ec", color: "#5c626e" }}>
        <div>
          <div>Délivré par {officerName}</div>
          <div>LSPD · Station 13 · Lucky Thirteen</div>
          <div className="mt-1">Fait à Los Santos, le {new Date().toLocaleDateString("fr-FR")}</div>
        </div>
        <div className="relative flex items-end gap-4">
          <div className="text-center">
            <div className="leading-none" style={{ fontFamily: "'Dancing Script',cursive", fontSize: 30, fontWeight: 700, color: "#12233b" }}>
              {me ? `${me.agent.prenomRP} ${me.agent.nomRP}` : "Station 13"}
            </div>
            <div className="mt-1 h-[1px] w-[170px]" style={{ background: "#cfd4db" }} />
            <div className="mt-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: "#98a0ab" }}>Signature de l'agent</div>
          </div>
          <Stamp />
        </div>
      </div>
    </div>
  );
}

// Rend le document en PNG. Les logos sont des SVG distants : on attend leur
// chargement, sinon la capture sort avec des trous.
export async function snapshotDoc(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    images.map((img) =>
      img.complete ? Promise.resolve() : new Promise((res) => { img.onload = res; img.onerror = res; }),
    ),
  );
  return await toPng(node, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true, style: { margin: "0" } });
}

// Nom de fichier d'une feuille : inchangé pour un document mono-feuille, suffixé
// « -1of2 » / « -2of2 » sinon (juste avant l'extension).
export function sheetFilename(filename: string, index: number, count: number): string {
  if (count <= 1) return filename;
  const dot = filename.lastIndexOf(".");
  const base = dot >= 0 ? filename.slice(0, dot) : filename;
  const ext = dot >= 0 ? filename.slice(dot) : ".png";
  return `${base}-${index + 1}of${count}${ext}`;
}

// Embed Discord d'une feuille : embed complet sur la première, rappel léger
// (titre + couleur) sur les suivantes pour ne pas dupliquer champs et lien.
export function sheetEmbed(embed: DocEmbed, index: number, count: number): DocEmbed {
  if (count <= 1 || index === 0) return embed;
  return { title: `${embed.title} · Feuille ${index + 1}/${count}`, color: embed.color };
}

// Aperçu plein écran avec téléchargement et envoi Discord manuel.
// Un document est composé d'une ou plusieurs feuilles : `sheets` en fournit le
// corps ; le fallback `children` conserve l'API mono-feuille historique.
export function OfficialDoc({
  toolbarTitle,
  subtitle,
  title,
  reference,
  filename,
  discordEvent,
  discordEmbed,
  discordPath,
  sheets,
  children,
  onClose,
}: {
  toolbarTitle: string;
  subtitle: string;
  title: string;
  reference: string;
  filename: string;
  discordEvent: string;
  discordEmbed: DocEmbed;
  discordPath?: string;
  sheets?: ReactNode[];
  children?: ReactNode;
  onClose: () => void;
}) {
  const bodies = sheets && sheets.length > 0 ? sheets : [children];
  const count = bodies.length;
  const sheetRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [busy, setBusy] = useState<"png" | "discord" | null>(null);
  const postDocument = useAction(api.webhooks.postDocument);
  const toast = useToast();

  async function download() {
    setBusy("png");
    try {
      for (let i = 0; i < count; i++) {
        const node = sheetRefs.current[i];
        if (!node) continue;
        const a = document.createElement("a");
        a.download = sheetFilename(filename, i, count);
        a.href = await snapshotDoc(node);
        a.click();
      }
    } finally {
      setBusy(null);
    }
  }

  async function sendDiscord() {
    setBusy("discord");
    try {
      let res: string | undefined;
      for (let i = 0; i < count; i++) {
        const node = sheetRefs.current[i];
        if (!node) continue;
        const dataUrl = await snapshotDoc(node);
        res = await toast.guard(
          postDocument({
            event: discordEvent,
            filename: sheetFilename(filename, i, count),
            base64: dataUrl.split(",")[1],
            embed: sheetEmbed(discordEmbed, i, count),
            // Le lien vers le MDT n'accompagne que la première feuille.
            path: i === 0 ? discordPath : undefined,
          }),
          "Envoi impossible",
        );
      }
      if (res === "ok") toast.success(count > 1 ? `Document (${count} feuilles) envoyé sur Discord.` : "Document envoyé sur Discord.");
      else if (res) toast.warning(`Discord : ${res}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col" style={{ background: "rgba(0,0,0,.6)" }}>
      <div className="flex flex-shrink-0 items-center gap-3 bg-elev px-5 py-3 shadow">
        <span className="text-[13px] font-bold">{toolbarTitle}</span>
        <div className="flex-1" />
        <button onClick={sendDiscord} disabled={busy !== null} className="mdt-press flex items-center gap-[7px] rounded-[9px] border border-border bg-surface-2 px-[14px] py-[8px] text-[13px] font-semibold text-muted hover:border-border-strong disabled:opacity-50">
          <Send className="h-[15px] w-[15px]" /> {busy === "discord" ? "Envoi…" : "Envoyer sur Discord"}
        </button>
        <button onClick={download} disabled={busy !== null} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">
          <Download className="h-[15px] w-[15px]" /> {busy === "png" ? "Génération…" : count > 1 ? `Télécharger (${count} images)` : "Télécharger (image)"}
        </button>
        <button onClick={onClose} className="flex h-[34px] w-[34px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex flex-1 flex-col items-center gap-6 overflow-auto p-6">
        {bodies.map((body, i) => (
          <div key={i} className="h-fit shadow-[0_10px_40px_rgba(0,0,0,.3)]">
            <DocSheet
              title={title}
              subtitle={subtitle}
              reference={reference}
              sheetIndex={i + 1}
              sheetCount={count}
              innerRef={(el) => { sheetRefs.current[i] = el; }}
            >
              {body}
            </DocSheet>
          </div>
        ))}
      </div>
    </div>
  );
}

// Cachet officiel auto-généré : entièrement noir, texte circulaire symétrique, trèfle central.
export function Stamp() {
  const ink = "#0d0d0d";
  return (
    <svg viewBox="0 0 200 200" width="120" height="120" style={{ transform: "rotate(-7deg)", opacity: 0.9 }} aria-label="Cachet officiel">
      <defs>
        {/* Deux arcs de MÊME rayon (86) : le texte reste centré dans la bande entre les deux cercles. */}
        <path id="s13-top" d="M 14,100 A 86,86 0 0 1 186,100" fill="none" />
        <path id="s13-bot" d="M 14,100 A 86,86 0 0 0 186,100" fill="none" />
      </defs>
      <circle cx="100" cy="100" r="95" fill="none" stroke={ink} strokeWidth={2.5} />
      <circle cx="100" cy="100" r="76" fill="none" stroke={ink} strokeWidth={1.5} />
      <text fill={ink} fontSize={15} fontWeight={700} letterSpacing="1.4" dominantBaseline="central" fontFamily="'Inter',sans-serif">
        <textPath href="#s13-top" startOffset="50%" textAnchor="middle">LSPD · STATION 13</textPath>
      </text>
      <text fill={ink} fontSize={13} fontWeight={700} letterSpacing="2" dominantBaseline="central" fontFamily="'Inter',sans-serif">
        <textPath href="#s13-bot" startOffset="50%" textAnchor="middle">SERVICE OFFICIEL</textPath>
      </text>
      <circle cx="14" cy="100" r="2.4" fill={ink} />
      <circle cx="186" cy="100" r="2.4" fill={ink} />
      <image href="/logos/logo-mark.svg" x="67" y="67" width="66" height="66" style={{ filter: "brightness(0)" }} />
    </svg>
  );
}

export function DocBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#2E6B2F" }}>{title}</div>
      {children}
    </>
  );
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color: "#98a0ab" }}>{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border p-3 text-center" style={{ borderColor: "#e5e8ec" }}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color: "#98a0ab" }}>{label}</div>
      <div className="mt-1 font-data text-[17px] font-bold">{value}</div>
    </div>
  );
}

// ── Pagination des narratifs ────────────────────────────────────────────────
// Un texte long (rapport d'arrestation, déroulé des faits, observations) est
// réparti sur plusieurs feuilles pour ne jamais produire une image géante.

export type NarrativeSection = { heading: string; text: string };

// Budget souple par feuille : on ouvre une nouvelle feuille dès que l'un des
// deux seuils est dépassé.
const SHEET_CHAR_BUDGET = 2500;
const SHEET_LINE_BUDGET = 40;
// Largeur utile ~724px / ~12.5px : estimation grossière du nb de caractères
// par ligne rendue, pour compter les lignes visuelles d'un paragraphe.
const CHARS_PER_LINE = 95;

type NarrativeBlock = { sectionIdx: number; heading: string; continued: boolean; paragraphs: string[] };

function estLines(text: string): number {
  return text.split("\n").reduce((n, ln) => n + Math.max(1, Math.ceil(ln.length / CHARS_PER_LINE)), 0);
}

// Coupe un paragraphe démesuré sur des frontières de mots pour qu'aucun
// fragment ne dépasse `max` caractères (les textes issus du rich-text peuvent
// n'avoir aucun saut de ligne).
function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = "";
  for (const token of text.split(/(\s+)/)) {
    if (cur.length + token.length > max && cur.trim()) {
      out.push(cur.trim());
      cur = "";
    }
    cur += token;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Répartit des sections narratives en feuilles. Renvoie un corps de feuille
// (ReactNode) par feuille ; tableau vide si tout est vide (document mono-feuille).
export function buildNarrativeSheets(sections: NarrativeSection[]): ReactNode[] {
  const paras: { sectionIdx: number; heading: string; text: string }[] = [];
  sections.forEach((s, si) => {
    const text = (s.text ?? "").trim();
    if (!text) return;
    const parts = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    (parts.length ? parts : [text]).forEach((part) => {
      splitLong(part, SHEET_CHAR_BUDGET).forEach((chunk) => paras.push({ sectionIdx: si, heading: s.heading, text: chunk }));
    });
  });
  if (paras.length === 0) return [];

  const sheets: NarrativeBlock[][] = [];
  let sheet: NarrativeBlock[] = [];
  let chars = 0;
  let lines = 0;
  const seen = new Set<number>();

  for (const p of paras) {
    const pLines = estLines(p.text) + 1; // +1 : espacement inter-paragraphe
    const overflow = sheet.length > 0 && (chars + p.text.length > SHEET_CHAR_BUDGET || lines + pLines > SHEET_LINE_BUDGET);
    if (overflow) {
      sheets.push(sheet);
      sheet = [];
      chars = 0;
      lines = 0;
    }
    let block = sheet[sheet.length - 1];
    if (!block || block.sectionIdx !== p.sectionIdx) {
      block = { sectionIdx: p.sectionIdx, heading: p.heading, continued: seen.has(p.sectionIdx), paragraphs: [] };
      sheet.push(block);
      seen.add(p.sectionIdx);
      lines += 2; // coût visuel de l'en-tête de bloc
    }
    block.paragraphs.push(p.text);
    chars += p.text.length;
    lines += pLines;
  }
  if (sheet.length) sheets.push(sheet);

  return sheets.map((blocks, i) => <NarrativeSheetBody key={i} blocks={blocks} />);
}

function NarrativeSheetBody({ blocks }: { blocks: NarrativeBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <div key={i} className="mb-5">
          <DocBlock title={b.continued ? `${b.heading} (suite)` : b.heading}>
            <div className="whitespace-pre-wrap rounded-[8px] border p-4 text-[12.5px] leading-[1.6]" style={{ borderColor: "#e5e8ec" }}>
              {b.paragraphs.join("\n\n")}
            </div>
          </DocBlock>
        </div>
      ))}
    </>
  );
}
