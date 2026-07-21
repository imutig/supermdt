import { ConvexReactClient } from "convex/react";

const url = import.meta.env.VITE_CONVEX_URL as string;
if (!url) {
  throw new Error("VITE_CONVEX_URL manquant - lance `npx convex dev` pour générer .env.local.");
}

export const convex = new ConvexReactClient(url);
