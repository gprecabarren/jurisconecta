import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database, D1Statement } from "../functions/_lib/user-auth";
export class TestDb implements D1Database {
  native = new DatabaseSync(":memory:");
  constructor() {
    for (const file of readdirSync("migrations").filter((file) => file.endsWith(".sql")).sort()) this.native.exec(readFileSync(`migrations/${file}`, "utf8"));
  }
  prepare(query: string): TestStatement { return new TestStatement(this, query); }
  async batch(statements: D1Statement[]) {
    this.native.exec("BEGIN");
    // D1 batches are atomic. Do not yield between statements on this single SQLite connection.
    try { const results = statements.map((statement) => { if (!(statement instanceof TestStatement)) throw new Error("Unsupported test statement"); return statement.execute(); }); this.native.exec("COMMIT"); return results; }
    catch (error) { this.native.exec("ROLLBACK"); throw error; }
  }
}
class TestStatement implements D1Statement {
  values: SQLInputValue[] = [];
  constructor(private db: TestDb, private query: string) {}
  bind(...values: unknown[]) { this.values = values as SQLInputValue[]; return this; }
  execute() { const result = this.db.native.prepare(this.query).run(...this.values); return { meta: { changes: Number(result.changes) } }; }
  async run() { return this.execute(); }
  async first<T>() { return this.db.native.prepare(this.query).get(...this.values) as T | undefined ?? null; }
  async all<T>() { return { results: this.db.native.prepare(this.query).all(...this.values) as T[] }; }
}
