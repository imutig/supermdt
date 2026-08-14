import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import { readableError } from "./errors";

describe("readableError", () => {
  it("lit le message d'un ConvexError à data string", () => {
    expect(readableError(new ConvexError("Code d'accès incorrect."))).toBe("Code d'accès incorrect.");
  });

  it("lit le champ message d'un ConvexError à data objet", () => {
    expect(readableError(new ConvexError({ message: "Grade insuffisant." }))).toBe("Grade insuffisant.");
  });

  it("dé-enrobe un « Uncaught Error » de message classique", () => {
    const e = new Error("[Request ID: 73f9] Server Error\nUncaught Error: Dossier introuvable.");
    expect(readableError(e)).toBe("Dossier introuvable.");
  });

  it("retombe sur le fallback pour un « Server Error » nu", () => {
    expect(readableError(new Error("Server Error"), "Défaut.")).toBe("Défaut.");
  });

  it("retombe sur le fallback pour une entrée vide", () => {
    expect(readableError(undefined, "Défaut.")).toBe("Défaut.");
    expect(readableError(null, "Défaut.")).toBe("Défaut.");
  });

  it("garde la première ligne d'un message classique sans préfixe", () => {
    expect(readableError(new Error("Échec réseau.\nstack…"))).toBe("Échec réseau.");
  });

  it("accepte une chaîne brute", () => {
    expect(readableError("Message direct.")).toBe("Message direct.");
  });

  it("préfère data même quand un message est présent (comportement prod)", () => {
    const e = new ConvexError("Métier.");
    expect(readableError(e)).toBe("Métier.");
  });
});
