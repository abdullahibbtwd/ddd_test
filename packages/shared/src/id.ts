import { v7 as uuidv7 } from "uuid";

/** UUID v7 primary key helper (see docs/DATABASE.md). */
export function createId(): string {
  return uuidv7();
}
