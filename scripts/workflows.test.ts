/** Main deploys itself (ADR-IMPL-079): what .github/workflows/api-deploy.yml and release.yml must keep, read from their
 *  YAML — the chain starts only from a green validate on main, every job deploys the commit the gate names, production
 *  waits for its environment's approval, concurrency is per job, the preview update goes to the preview channel with
 *  the preview environment, and both workflows run one pinned eas-cli. No network: the files alone. */
import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

type Step = { name?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Job = {
  needs?: string | string[];
  if?: string;
  environment?: string | { name: string };
  concurrency?: { group: string; "cancel-in-progress": boolean };
  env?: Record<string, string>;
  steps: Step[];
};
type Workflow = {
  on: Record<string, { workflows?: string[]; types?: string[]; branches?: string[] } | null>;
  concurrency?: unknown;
  env?: Record<string, string>;
  jobs: Record<string, Job>;
};

const read = async (name: string) =>
  Bun.YAML.parse(await Bun.file(join(root, ".github/workflows", name)).text()) as Workflow;
const deploy = await read("api-deploy.yml");
const release = await read("release.yml");
const needsOf = (job: Job) => (typeof job.needs === "string" ? [job.needs] : (job.needs ?? []));
/** Every run script of a job, and the `with` inputs of its actions (the SSH script lives there). */
const textOf = (job: Job) => JSON.stringify([job.if ?? "", job.env ?? {}, job.steps]);
/** The eas-cli invocations in a workflow's run scripts. */
const easCalls = (wf: Workflow) =>
  Object.values(wf.jobs)
    .flatMap((job) => job.steps)
    .flatMap((step) => (step.run ?? "").split("\n"))
    .filter((line) => /\beas-cli\b|\beas (update|build)\b/.test(line));

describe("api-deploy: the chain starts from a green validate on main", () => {
  it("runs on validate's completed runs on main, and by hand", () => {
    expect(deploy.on.workflow_run).toEqual({ workflows: ["validate"], types: ["completed"], branches: ["main"] });
    expect(Object.keys(deploy.on).sort()).toEqual(["workflow_dispatch", "workflow_run"]);
  });

  it("the gate lets through only a successful validate of a push to main", () => {
    const gate = deploy.jobs.gate!;
    expect(gate.if).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(gate.if).toContain("github.event.workflow_run.event == 'push'");
    expect(gate.if).toContain("github.event.workflow_run.head_branch == 'main'");
  });

  it("no job but the gate reads github.sha: every commit is the gate's", () => {
    for (const [name, job] of Object.entries(deploy.jobs)) {
      if (name === "gate") continue;
      expect(textOf(job), name).not.toContain("github.sha");
      expect(textOf(job), name).not.toContain("GITHUB_SHA");
      expect(needsOf(job), name).toContain("gate");
    }
  });
});

describe("api-deploy: production waits for approval, after staging", () => {
  it("runs in the production environment and needs staging", () => {
    const production = deploy.jobs.production!;
    expect(production.environment).toBe("production");
    expect(needsOf(production)).toEqual(expect.arrayContaining(["gate", "build", "staging"]));
  });

  it("has no workflow-level concurrency; each deploy holds its own group, never cancelling one in progress", () => {
    expect(deploy.concurrency).toBeUndefined();
    expect(deploy.jobs.staging!.concurrency).toEqual({ group: "deploy-staging", "cancel-in-progress": false });
    expect(deploy.jobs.production!.concurrency).toEqual({ group: "deploy-production", "cancel-in-progress": false });
    expect(deploy.jobs["ota-preview"]!.concurrency).toEqual({ group: "ota-preview", "cancel-in-progress": false });
  });
});

describe("api-deploy: the preview update", () => {
  const ota = deploy.jobs["ota-preview"]!;

  it("comes after staging", () => {
    expect(needsOf(ota)).toEqual(expect.arrayContaining(["gate", "staging"]));
  });

  it("publishes only to the preview channel, with the preview environment", () => {
    // The publishing command alone: `eas update --…`, not update:list or update:view.
    const updates = easCalls(deploy).filter((line) => /\beas update\s+--/.test(line));
    expect(updates.length).toBeGreaterThan(0);
    for (const line of updates) {
      expect(line).toContain("--channel preview");
      expect(line).toContain("--environment preview");
    }
  });

  it("a native change starts a preview build, never a production one", () => {
    const builds = easCalls(deploy).filter((line) => /\beas build\s+--profile\b/.test(line));
    expect(builds.length).toBeGreaterThan(0);
    for (const line of builds) expect(line).toContain("--profile preview");
  });
});

describe("one eas-cli, pinned", () => {
  it("api-deploy and release run the same exact eas-cli version, never an unpinned one", () => {
    const pinned = deploy.jobs["ota-preview"]!.env!.EAS_CLI_VERSION;
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    expect(release.jobs.release!.env!.EAS_CLI_VERSION).toBe(pinned);
    for (const line of [...easCalls(deploy), ...easCalls(release)]) {
      if (!line.includes("eas-cli")) continue;
      expect(line).toContain("eas-cli@$EAS_CLI_VERSION");
    }
  });
});
