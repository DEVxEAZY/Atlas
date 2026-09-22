import { describe, expect, test } from "bun:test";
import { migrationArmKey, migrationInFlight, migrationsSettled, runMigration } from "../src/migrate";

const choice = { dir: "/tmp", runtime: "claude", resume: "x" };

describe("migration registry", () => {
  test("a migration is visible process-wide until it settles", async () => {
    expect(migrationInFlight()).toBe(false);
    const p = runMigration({ pids: [], choice }, () => ({ ok: true, name: "atlas-x" }));
    expect(migrationInFlight()).toBe(true); // registered before any await
    await migrationsSettled();
    expect(await p).toEqual({ ok: true, name: "atlas-x" });
    await Promise.resolve();
    expect(migrationInFlight()).toBe(false);
  });

  test("migrationsSettled resolves at once when nothing runs", async () => {
    expect(await Promise.race([migrationsSettled().then(() => "now"), new Promise((r) => setTimeout(() => r("late"), 50))])).toBe("now");
  });

  test("the T arm key changes when the second T would do something else", () => {
    const open = migrationArmKey("c:claude:x", { pids: [], choice });
    const stop = migrationArmKey("c:claude:x", { pids: [42], choice });
    expect(open).not.toBe(stop);
    expect(migrationArmKey("c:claude:x", { pids: [7, 8], choice })).toBe(stop);
  });
});
