import Mention from "@tiptap/extension-mention";
import { mergeAttributes } from "@tiptap/core";
import type { ConvexReactClient } from "convex/react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";

// Extension de mention "@" pour l'éditeur du Detective Bureau. Recherche en base
// (detectiveSearch.mentions) et insère un chip cliquable portant kind + id, que
// la lecture rendra navigable vers l'entité.

type MentionItem = { kind: string; id: string; label: string; sub: string };

const KIND_LABEL: Record<string, string> = {
  citizen: "Citoyen", vehicle: "Véhicule", case: "Enquête",
  person: "Personne", gang: "Organisation", drugsite: "Stup",
};

// Chip visuel : couleur d'accent + préfixe selon le type.
function itemRow(item: MentionItem, active: boolean) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "db-mention-item" + (active ? " is-active" : "");
  el.innerHTML = `<span class="db-mention-k">${KIND_LABEL[item.kind] ?? item.kind}</span><span class="db-mention-l">${escapeHtml(item.label)}</span><span class="db-mention-s">${escapeHtml(item.sub)}</span>`;
  return el;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function buildMention(convex: ConvexReactClient, divisionId: Id<"divisions">) {
  const DbMention = Mention.extend({
    addAttributes() {
      return {
        id: { default: null, parseHTML: (el) => el.getAttribute("data-id"), renderHTML: (a) => (a.id ? { "data-id": a.id } : {}) },
        kind: { default: null, parseHTML: (el) => el.getAttribute("data-kind"), renderHTML: (a) => (a.kind ? { "data-kind": a.kind } : {}) },
        label: { default: null, parseHTML: (el) => el.getAttribute("data-label"), renderHTML: (a) => (a.label ? { "data-label": a.label } : {}) },
      };
    },
  });

  return DbMention.configure({
    HTMLAttributes: { class: "db-mention" },
    renderHTML({ options, node }: { options: { HTMLAttributes: Record<string, unknown> }; node: any }) {
      return ["span", mergeAttributes(
        { "data-type": "mention", class: "db-mention", "data-kind": node.attrs.kind, "data-id": node.attrs.id, "data-label": node.attrs.label },
        options.HTMLAttributes,
      ), `@${node.attrs.label ?? ""}`];
    },
    renderText({ node }: { node: any }) {
      return `@${node.attrs.label ?? ""}`;
    },
    suggestion: {
      char: "@",
      items: async ({ query }: { query: string }) => {
        if (!query || query.trim().length < 1) return [];
        try {
          return (await convex.query(api.detectiveSearch.mentions, { divisionId, q: query })) as MentionItem[];
        } catch {
          return [];
        }
      },
      command: ({ editor, range, props }: { editor: any; range: any; props: any }) => {
        editor.chain().focus().insertContentAt(range, [
          { type: "mention", attrs: { id: props.id, kind: props.kind, label: props.label } },
          { type: "text", text: " " },
        ]).run();
      },
      render: () => {
        let popup: HTMLDivElement | null = null;
        let items: MentionItem[] = [];
        let selected = 0;
        let cmd: ((item: MentionItem) => void) | null = null;

        const paint = () => {
          if (!popup) return;
          popup.innerHTML = "";
          if (items.length === 0) {
            const empty = document.createElement("div");
            empty.className = "db-mention-empty";
            empty.textContent = "Aucun résultat";
            popup.appendChild(empty);
            return;
          }
          items.forEach((it, i) => {
            const row = itemRow(it, i === selected);
            row.addEventListener("mousedown", (e) => { e.preventDefault(); cmd?.(it); });
            popup!.appendChild(row);
          });
        };

        const place = (rect: DOMRect | null) => {
          if (!popup || !rect) return;
          popup.style.left = `${rect.left}px`;
          popup.style.top = `${rect.bottom + 6}px`;
        };

        return {
          onStart: (props: any) => {
            items = props.items; selected = 0; cmd = (it) => props.command(it);
            popup = document.createElement("div");
            popup.className = "db-mention-popup";
            document.body.appendChild(popup);
            paint();
            place(props.clientRect?.());
          },
          onUpdate: (props: any) => {
            items = props.items; selected = 0; cmd = (it) => props.command(it);
            paint();
            place(props.clientRect?.());
          },
          onKeyDown: (props: any) => {
            if (!popup) return false;
            if (props.event.key === "ArrowDown") { selected = (selected + 1) % Math.max(items.length, 1); paint(); return true; }
            if (props.event.key === "ArrowUp") { selected = (selected - 1 + items.length) % Math.max(items.length, 1); paint(); return true; }
            if (props.event.key === "Enter") { if (items[selected]) { cmd?.(items[selected]); return true; } return false; }
            if (props.event.key === "Escape") { return true; }
            return false;
          },
          onExit: () => { popup?.remove(); popup = null; },
        };
      },
    },
  });
}
