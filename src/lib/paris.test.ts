import { describe, it, expect } from "vitest";
import { parisWallToEpoch, parisDayStart, parisDayEnd } from "./paris";

describe("parisWallToEpoch", () => {
  it("convertit une heure d'été (CEST, UTC+2)", () => {
    // 15 juillet 2024 12:00 à Paris = 10:00 UTC.
    expect(parisWallToEpoch(2024, 7, 15, 12, 0)).toBe(Date.UTC(2024, 6, 15, 10, 0, 0, 0));
  });

  it("convertit une heure d'hiver (CET, UTC+1)", () => {
    // 15 janvier 2024 12:00 à Paris = 11:00 UTC.
    expect(parisWallToEpoch(2024, 1, 15, 12, 0)).toBe(Date.UTC(2024, 0, 15, 11, 0, 0, 0));
  });

  it("est indépendant du fuseau du navigateur (résultat = epoch absolu)", () => {
    const e = parisWallToEpoch(2024, 3, 1, 8, 30);
    expect(typeof e).toBe("number");
    // Round-trip : l'heure murale de Paris lue depuis l'epoch correspond.
    const paris = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(e));
    expect(paris).toBe("08:30");
  });
});

describe("parisDayStart / parisDayEnd", () => {
  it("renvoie null sur un format invalide", () => {
    expect(parisDayStart("2024/07/15")).toBeNull();
    expect(parisDayEnd("bad")).toBeNull();
  });

  it("borne le début et la fin de journée en heure de Paris", () => {
    const start = parisDayStart("2024-07-15");
    const end = parisDayEnd("2024-07-15");
    // Début = 00:00 Paris = 14 juillet 22:00 UTC (CEST).
    expect(start).toBe(Date.UTC(2024, 6, 14, 22, 0, 0, 0));
    // Fin = 23:59 Paris = 15 juillet 21:59 UTC.
    expect(end).toBe(Date.UTC(2024, 6, 15, 21, 59, 0, 0));
    expect(start! < end!).toBe(true);
  });
});
