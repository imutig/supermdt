import { Node, mergeAttributes } from "@tiptap/core";

// Nœuds média inline pour l'éditeur du Detective Bureau : vidéo et audio.
// Le contenu est stocké en HTML (<video>/<audio> avec controls). La lecture
// passe par le même jeu d'extensions, donc ProseMirror reparse proprement.

export const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [{ tag: "video[src]" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ["video", mergeAttributes(HTMLAttributes, { controls: "true", preload: "metadata", class: "db-media" })];
  },
});

export const Audio = Node.create({
  name: "audio",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [{ tag: "audio[src]" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ["audio", mergeAttributes(HTMLAttributes, { controls: "true", preload: "metadata", class: "db-media" })];
  },
});
