// Upload d'image avec fournisseur principal Cloudinary + fallback ImgBB (goal.md §1).
// On ne stocke que l'URL retournée. Bascule automatique en cas d'erreur/limite.
//
// Configuration (variables d'environnement Vite, dans .env.local) :
//   VITE_CLOUDINARY_CLOUD_NAME=xxx
//   VITE_CLOUDINARY_UPLOAD_PRESET=xxx   (preset "unsigned")
//   VITE_IMGBB_KEY=xxx
//
// Au moins un fournisseur doit être configuré, sinon uploadImage() rejette.

const CLOUDINARY_CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const CLOUDINARY_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;
const IMGBB_KEY = import.meta.env.VITE_IMGBB_KEY as string | undefined;

async function toCloudinary(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_PRESET!);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Cloudinary ${res.status}`);
  const json = (await res.json()) as { secure_url?: string };
  if (!json.secure_url) throw new Error("Cloudinary : réponse invalide");
  return json.secure_url;
}

async function toImgBB(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`ImgBB ${res.status}`);
  const json = (await res.json()) as { data?: { url?: string } };
  if (!json.data?.url) throw new Error("ImgBB : réponse invalide");
  return json.data.url;
}

export function imageUploadConfigured(): boolean {
  return Boolean((CLOUDINARY_CLOUD && CLOUDINARY_PRESET) || IMGBB_KEY);
}

// ---- Médias enrichis (image + vidéo + audio), pour les énoncés de quiz ----

// Cloudinary héberge vidéo et audio via son endpoint "video" (l'audio y passe
// aussi). ImgBB ne fait que l'image, donc pas de fallback pour ces types.
const MEDIA_MAX_BYTES = 40 * 1024 * 1024; // 40 Mo pour la vidéo/audio

async function toCloudinaryVideo(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_PRESET!);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Cloudinary ${res.status}`);
  const json = (await res.json()) as { secure_url?: string };
  if (!json.secure_url) throw new Error("Cloudinary : réponse invalide");
  return json.secure_url;
}

// Type d'un média, déduit de l'extension (on ne stocke que l'URL).
export type MediaKind = "image" | "video" | "audio";
export function mediaKind(url: string): MediaKind {
  const u = url.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(u)) return "video";
  if (/\.(mp3|wav|m4a|aac|oga|ogg|opus)$/.test(u)) return "audio";
  return "image";
}

// Upload image, vidéo ou audio. Vidéo/audio exigent Cloudinary.
export async function uploadMedia(file: File): Promise<string> {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");
  if (!isImage && !isVideo && !isAudio) throw new Error("Fichier non supporté (image, vidéo ou audio).");
  if (isImage) return uploadImage(file);

  if (file.size > MEDIA_MAX_BYTES) throw new Error("Fichier trop lourd (max 40 Mo).");
  if (!CLOUDINARY_CLOUD || !CLOUDINARY_PRESET) {
    throw new Error("L'hébergement vidéo/audio nécessite Cloudinary (VITE_CLOUDINARY_*).");
  }
  return toCloudinaryVideo(file);
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 Mo

// Tente Cloudinary puis ImgBB. Retourne l'URL hébergée.
export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Le fichier doit être une image.");
  if (file.size > MAX_BYTES) throw new Error("Image trop lourde (max 10 Mo).");

  const providers: { name: string; fn: () => Promise<string> }[] = [];
  if (CLOUDINARY_CLOUD && CLOUDINARY_PRESET)
    providers.push({ name: "Cloudinary", fn: () => toCloudinary(file) });
  if (IMGBB_KEY) providers.push({ name: "ImgBB", fn: () => toImgBB(file) });

  if (providers.length === 0) {
    throw new Error(
      "Aucun hébergeur d'images configuré (VITE_CLOUDINARY_* ou VITE_IMGBB_KEY).",
    );
  }

  let lastErr: unknown = null;
  for (const p of providers) {
    try {
      return await p.fn();
    } catch (e) {
      lastErr = e;
      // on tente le fournisseur suivant (fallback)
    }
  }
  throw new Error(
    `Échec de l'upload (tous les hébergeurs) : ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}
