import { sql, type SQL } from "drizzle-orm";

export type PlanNode = {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Total Cost": number;
  Plans?: PlanNode[];
};
type Exec = { execute(statement: SQL): Promise<unknown> };

/** The planner's plan as data — assert properties (index used, no seq scan on a big table), never the text. */
export async function planOf(exec: Exec, statement: SQL): Promise<PlanNode> {
  const rows = (await exec.execute(sql`EXPLAIN (FORMAT JSON) ${statement}`)) as {
    "QUERY PLAN": { Plan: PlanNode }[];
  }[];
  return rows[0]!["QUERY PLAN"][0]!.Plan;
}
export function nodes(p: PlanNode): PlanNode[] {
  return [p, ...(p.Plans ?? []).flatMap(nodes)];
}
export function sqlOf(q: { getSQL(): SQL }): SQL {
  return q.getSQL();
}
export const usesIndex = (p: PlanNode, name: string) => nodes(p).some((n) => n["Index Name"] === name);
export const seqScans = (p: PlanNode) =>
  nodes(p)
    .filter((n) => n["Node Type"] === "Seq Scan")
    .map((n) => n["Relation Name"]);
