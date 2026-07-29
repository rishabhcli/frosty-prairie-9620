import { describe, expect, it } from "vitest";
import { parseDatabaseSecret } from "./databaseSecret.js";

describe("parseDatabaseSecret", () => {
  it("accepts a raw PostgreSQL URL", () => {
    expect(parseDatabaseSecret("postgresql://app:secret@example.com:26257/contactsafe")).toBe(
      "postgresql://app:secret@example.com:26257/contactsafe"
    );
  });

  it("accepts a JSON-wrapped DATABASE_URL", () => {
    expect(parseDatabaseSecret('{"DATABASE_URL":"postgresql://app:secret@example.com/contactsafe"}')).toBe(
      "postgresql://app:secret@example.com/contactsafe"
    );
  });

  it("rejects other secret formats", () => {
    expect(() => parseDatabaseSecret('{"password":"secret"}')).toThrow(/DATABASE_URL/);
  });
});
