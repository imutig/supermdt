import { useState, type ReactNode } from "react";
import { useEditor, EditorContent, type Editor, type Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link2, Link2Off, Palette, Highlighter, RemoveFormatting, Undo, Redo,
} from "lucide-react";

// Traitement de texte partagé (rapports, notes, casier, protocoles...).
// Stocke du HTML. La lecture passe TOUJOURS par l'éditeur en mode non éditable :
// ProseMirror reparse le contenu selon son schéma, ce qui écarte au passage
// tout balisage non prévu - on n'injecte jamais de HTML brut dans le DOM.

// Palette restreinte : des teintes lisibles sur fond clair comme sombre.
const COLORS = [
  { name: "Défaut", value: "" },
  { name: "Rouge", value: "#d94040" },
  { name: "Orange", value: "#e0a030" },
  { name: "Vert", value: "#49a24a" },
  { name: "Bleu", value: "#3b82f6" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Gris", value: "#8a929c" },
];

const HIGHLIGHTS = [
  { name: "Aucun", value: "" },
  { name: "Jaune", value: "#fde68a" },
  { name: "Vert", value: "#bbf7d0" },
  { name: "Bleu", value: "#bfdbfe" },
  { name: "Rose", value: "#fbcfe8" },
];

export function richTextExtensions(placeholder?: string): Extensions {
  return [
    StarterKit,
    Underline,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noreferrer", target: "_blank" } }),
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ];
}

// Les anciens contenus sont du texte brut : on préserve leurs sauts de ligne,
// sinon tout l'existant s'écraserait en un seul paragraphe.
export function normalizeRichText(value: string) {
  if (!value) return "";
  if (value.includes("<")) return value;
  return value
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// HTML -> texte, pour les supports qui ne savent pas rendre de balises
// (documents officiels capturés en image, embeds Discord).
export function richTextToPlain(html: string) {
  if (!html) return "";
  if (!html.includes("<")) return html;
  // DOMParser produit un document inerte : ni script exécuté, ni ressource
  // chargée. `innerHTML` sur un élément détaché peut, lui, déclencher le
  // chargement d'images et donc des gestionnaires onerror.
  return (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").trim();
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  editable = true,
  placeholder,
  minHeight = 140,
}: {
  value: string;
  onChange?: (html: string) => void;
  onBlur?: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
  minHeight?: number;
}) {
  const editor = useEditor({
    extensions: richTextExtensions(placeholder),
    content: normalizeRichText(value),
    editable,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    onBlur: ({ editor }) => onBlur?.(editor.getHTML()),
    editorProps: {
      attributes: {
        class: `prose-mdt px-3 py-3 text-[13.5px] leading-[1.55] outline-none`,
        style: `min-height:${minHeight}px`,
      },
    },
  });

  if (!editor) return null;

  if (!editable) {
    return <div className="prose-mdt px-1 text-[13.5px] leading-[1.55]"><EditorContent editor={editor} /></div>;
  }

  return (
    <div className="rounded-sm border border-border bg-surface-2">
      <RichTextToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Btn({ on, onClick, children, title, disabled }: { on?: boolean; onClick: () => void; children: ReactNode; title: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-transparent hover:border-border hover:bg-surface disabled:opacity-40"
      style={on ? { background: "var(--accent-soft)", color: "var(--accent)" } : { color: "var(--muted)" }}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-[3px] h-[18px] w-px bg-border" />;
const ICON = "h-[15px] w-[15px]";

// Barre d'outils, isolée pour être réutilisée par l'éditeur collaboratif des
// rapports, qui construit son instance Tiptap lui-même.
export function RichTextToolbar({ editor }: { editor: Editor }) {
  const [menu, setMenu] = useState<"color" | "highlight" | null>(null);

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Adresse du lien", previous ?? "https://");
    if (url === null) return;
    if (!url.trim()) { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="relative flex flex-wrap items-center gap-[2px] border-b border-border px-[6px] py-[5px]">
      <Btn title="Gras (Ctrl+B)" on={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className={ICON} /></Btn>
      <Btn title="Italique (Ctrl+I)" on={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className={ICON} /></Btn>
      <Btn title="Souligné (Ctrl+U)" on={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className={ICON} /></Btn>
      <Btn title="Barré" on={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className={ICON} /></Btn>
      <Btn title="Code" on={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}><Code className={ICON} /></Btn>

      <Sep />
      <Btn title="Titre" on={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className={ICON} /></Btn>
      <Btn title="Sous-titre" on={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className={ICON} /></Btn>
      <Btn title="Sous-sous-titre" on={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className={ICON} /></Btn>

      <Sep />
      <Btn title="Liste à puces" on={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className={ICON} /></Btn>
      <Btn title="Liste numérotée" on={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className={ICON} /></Btn>
      <Btn title="Citation" on={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className={ICON} /></Btn>
      <Btn title="Séparateur" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className={ICON} /></Btn>

      <Sep />
      <Btn title="Aligner à gauche" on={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className={ICON} /></Btn>
      <Btn title="Centrer" on={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className={ICON} /></Btn>
      <Btn title="Aligner à droite" on={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className={ICON} /></Btn>
      <Btn title="Justifier" on={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}><AlignJustify className={ICON} /></Btn>

      <Sep />
      <Btn title="Couleur du texte" on={menu === "color"} onClick={() => setMenu(menu === "color" ? null : "color")}><Palette className={ICON} /></Btn>
      <Btn title="Surlignage" on={menu === "highlight"} onClick={() => setMenu(menu === "highlight" ? null : "highlight")}><Highlighter className={ICON} /></Btn>

      <Sep />
      <Btn title="Insérer un lien" on={editor.isActive("link")} onClick={setLink}><Link2 className={ICON} /></Btn>
      <Btn title="Retirer le lien" disabled={!editor.isActive("link")} onClick={() => editor.chain().focus().unsetLink().run()}><Link2Off className={ICON} /></Btn>
      <Btn title="Effacer la mise en forme" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting className={ICON} /></Btn>

      <Sep />
      <Btn title="Annuler (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo className={ICON} /></Btn>
      <Btn title="Rétablir (Ctrl+Y)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo className={ICON} /></Btn>

      {menu && (
        <div className="absolute left-0 top-full z-30 mt-1 flex flex-wrap gap-[6px] rounded-sm border border-border-strong bg-elev p-[9px] shadow-[0_12px_30px_rgba(0,0,0,.3)]">
          {(menu === "color" ? COLORS : HIGHLIGHTS).map((c) => (
            <button
              key={c.name}
              type="button"
              title={c.name}
              onClick={() => {
                if (menu === "color") {
                  if (c.value) editor.chain().focus().setColor(c.value).run();
                  else editor.chain().focus().unsetColor().run();
                } else {
                  if (c.value) editor.chain().focus().setHighlight({ color: c.value }).run();
                  else editor.chain().focus().unsetHighlight().run();
                }
                setMenu(null);
              }}
              className="h-[22px] w-[22px] rounded-[5px] border border-border hover:border-accent"
              style={{
                background: c.value || "transparent",
                backgroundImage: c.value ? undefined : "linear-gradient(45deg,transparent 45%,var(--danger) 45%,var(--danger) 55%,transparent 55%)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
