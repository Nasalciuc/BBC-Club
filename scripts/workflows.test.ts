/** Main deploys itself (ADR-IMPL-079): what .github/workflows/api-deploy.yml and release.yml must keep, read from their
 *  YAML — the chain starts only from a green validate on main, every job deploys the commit the gate names, production
 *  waits for its environment's approval, concurrency is per job, the preview update goes to the preview channel with
 *  the preview environment, and both workflows run one pinned eas-cli. No network: the files alone, and one step run
 *  with eas-cli stood in for. */
import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
/** The eas-cli invocations in a workflow's run scripts: comments and the summary's `echo` lines are words, not calls. */
const easCalls = (wf: Workflow) =>
  Object.values(wf.jobs)
    .flatMap((job) => job.steps)
    .flatMap((step) => (step.run ?? "").split("\n"))
    .filter((line) => !/^\s*(#|echo\b)/.test(line))
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

describe("api-deploy: production by hand only from main (audit, 30 Oct 2026)", () => {
  const step = deploy.jobs.gate!.steps.find((s) => s.run?.includes("DISPATCHED_REF"))!;
  /** The gate's step with `gh` answering main's tip: its exit code and what it printed. */
  function gate(target: string, ref: string) {
    const dir = mkdtempSync(join(tmpdir(), "bbc-gate-"));
    try {
      writeFileSync(join(dir, "gh"), "#!/bin/sh\necho abc1234def\n", { mode: 0o755 });
      spawnSync("chmod", ["+x", join(dir, "gh")]);
      const r = spawnSync("bash", ["-c", step.run!], {
        env: {
          PATH: `${dir}:${process.env.PATH}`,
          EVENT: "workflow_dispatch",
          DISPATCHED_SHA: "abc1234def",
          DISPATCHED_REF: ref,
          TARGET: target,
          GITHUB_REPOSITORY: "o/r",
          GITHUB_OUTPUT: join(dir, "out"),
          GITHUB_STEP_SUMMARY: join(dir, "summary"),
        },
        encoding: "utf8",
      });
      return { code: r.status, out: `${r.stdout}${r.stderr}` };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("refuses production dispatched on a branch, before anything is built", () => {
    const r = gate("production", "refs/heads/some-branch");
    expect(r.code).toBe(1);
    expect(r.out).toContain("production is deployed from main only (dispatched on refs/heads/some-branch)");
  });

  it("lets production from main through, and staging from a branch (RUNBOOK, Staging on the same box)", () => {
    expect(gate("production", "refs/heads/main").code).toBe(0);
    expect(gate("staging", "refs/heads/some-branch").code).toBe(0);
  });
});

describe("api-deploy: production waits for approval, after staging", () => {
  it("runs in the production environment and needs staging", () => {
    const production = deploy.jobs.production!;
    expect(production.environment).toBe("production");
    expect(needsOf(production)).toEqual(expect.arrayContaining(["gate", "build", "staging"]));
    // The preview app calls staging: an EAS failure never holds an API release.
    expect(needsOf(production)).not.toContain("ota-preview");
  });

  it("an older approval stops before its checkout once main has moved past its commit", () => {
    const script = String(deploy.jobs.production!.steps.find((step) => step.with?.script)?.with?.script ?? "");
    const guard = script.indexOf('[ "$main" = "${{ needs.gate.outputs.sha }}" ] ||');
    const checkout = script.indexOf("git checkout -q ${{ needs.gate.outputs.sha }}");
    expect(script).toContain("main=$(git rev-parse origin/main)");
    expect(guard).toBeGreaterThan(script.indexOf("git fetch -q --all"));
    expect(checkout).toBeGreaterThan(guard);
    expect(script.slice(guard, checkout)).toContain("exit 1");
  });

  it("a merge's staging stops before its checkout once main has moved past its commit; a run by hand does not", () => {
    const script = String(deploy.jobs.staging!.steps.find((step) => step.with?.script)?.with?.script ?? "");
    const only = script.indexOf('if [ "${{ github.event_name }}" = "workflow_run" ]; then');
    const guard = script.indexOf('[ "$main" = "${{ needs.gate.outputs.sha }}" ] ||');
    const checkout = script.indexOf("git checkout -q ${{ needs.gate.outputs.sha }}");
    expect(only).toBeGreaterThan(script.indexOf("git fetch -q --all"));
    expect(guard).toBeGreaterThan(only);
    expect(script.slice(only, guard)).toContain("main=$(git rev-parse origin/main)");
    expect(checkout).toBeGreaterThan(guard);
    expect(script.slice(guard, checkout)).toContain("exit 1");
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

  it("hands EXPO_TOKEN only to the steps that call eas-cli, never to the job or `bun install`", () => {
    expect(ota.env ?? {}).not.toHaveProperty("EXPO_TOKEN");
    const callsEas = ota.steps.filter((step) => (step.run ?? "").includes("eas-cli@$EAS_CLI_VERSION"));
    expect(callsEas.length).toBeGreaterThan(0);
    for (const step of ota.steps) {
      const hasToken = Object.hasOwn(step.env ?? {}, "EXPO_TOKEN");
      expect(hasToken, step.name ?? step.run ?? "(action)").toBe(callsEas.includes(step));
    }
  });

  it("a run by hand with `force` publishes though the repository did not change (an EAS variable did)", () => {
    const inputs = (deploy.on.workflow_dispatch as { inputs?: Record<string, { type?: string }> } | null)?.inputs;
    expect(inputs?.force?.type).toBe("boolean");
    // Only by hand: a merge never skips the unchanged-app check.
    expect(ota.env?.FORCE).toBe("${{ github.event_name == 'workflow_dispatch' && inputs.force }}");
    const changes = ota.steps.find((step) => step.name === "Anything to publish")?.run ?? "";
    const forced = changes.indexOf('if [ "$FORCE" = "true" ]; then');
    expect(forced).toBeGreaterThan(-1);
    expect(forced).toBeLessThan(changes.indexOf("git -C"));
    expect(changes.slice(forced, changes.indexOf("fi", forced))).toContain('echo "publish=true"');
  });

  it("a failed update:list is a warning, and the app counts as changed, as when no update is known", () => {
    const changes = ota.steps.find((step) => step.name === "Anything to publish")?.run ?? "";
    // EAS answering with an error, in place of eas-cli.
    const script = changes.replace(/^( *)eas\(\) \{[^\n]*\}$/m, '$1eas() { echo "EAS is unreachable" >&2; return 1; }');
    expect(script).not.toBe(changes);
    const dir = mkdtempSync(join(tmpdir(), "bbc-workflows-"));
    try {
      const output = join(dir, "output");
      const run = spawnSync("bash", ["-c", script], {
        cwd: join(root, "apps/mobile"),
        env: {
          ...process.env,
          FORCE: "false",
          SHA: "HEAD",
          GITHUB_WORKSPACE: root,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: join(dir, "summary"),
        },
      });
      expect(run.status, run.stderr.toString()).toBe(0);
      expect(run.stdout.toString()).toContain("::warning::eas update:list failed");
      expect(readFileSync(output, "utf8")).toContain("publish=true");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /** The publish step, with eas-cli answering `builds` to build:list and noting every other call, and GitHub
   *  answering `main` for main's tip. */
  const publishWith = (builds: string, main: string, event = "workflow_run") => {
    const step = ota.steps.find((s) => s.name === "Publish the update, or start the build a native change needs");
    const run = step?.run ?? "";
    const stub = `$1eas() { if [ "$$1" = build:list ]; then echo '${builds}'; else echo "$*" >> "$CALLS"; echo '[]' > "\${BUILD_JSON:-/dev/null}"; fi; }\n$1gh() { echo ${main}; }`;
    const script = run.replace(/^( *)eas\(\) \{[^\n]*\}$/m, stub);
    expect(script).not.toBe(run);
    const dir = mkdtempSync(join(tmpdir(), "bbc-workflows-"));
    try {
      const calls = join(dir, "calls");
      const summary = join(dir, "summary");
      const res = spawnSync("bash", ["-c", script], {
        cwd: join(root, "apps/mobile"),
        env: {
          ...process.env,
          SHA: "HEAD",
          RUNTIME: "rt",
          LAST: "none",
          FORCE: "false",
          DRY_RUN: "false",
          CALLS: calls,
          RUNNER_TEMP: dir,
          GITHUB_EVENT_NAME: event,
          GITHUB_REPOSITORY: "o/r",
          GITHUB_STEP_SUMMARY: summary,
        },
      });
      const read = (f: string) => {
        try {
          return readFileSync(f, "utf8");
        } catch {
          return "";
        }
      };
      return { status: res.status, stderr: res.stderr.toString(), calls: read(calls), summary: read(summary) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("an older merge's job publishes nothing and starts no build once main has moved past its commit", () => {
    for (const builds of ['[{"status":"FINISHED"}]', "[]"]) {
      const run = publishWith(builds, "newer");
      expect(run.status, run.stderr).toBe(0);
      expect(run.calls, builds).toBe("");
      expect(run.summary).toContain("superseded: main is at");
    }
  });

  it("the commit at main's tip publishes or builds; a run by hand does not ask GitHub", () => {
    expect(publishWith('[{"status":"FINISHED"}]', "HEAD").calls).toContain("env:exec preview");
    expect(publishWith("[]", "HEAD").calls).toContain("env:exec preview");
    expect(publishWith('[{"status":"FINISHED"}]', "newer", "workflow_dispatch").calls).toContain("env:exec preview");
  });

  // eas-cli reads app.config.ts with the shell's env before it loads an EAS environment, and the config refuses a
  // staging one without the preview API's address: both commands run inside the environment (`eas env:exec`).
  it("publishes only to the preview channel, with the preview environment, from inside it", () => {
    // The publishing command alone: `update --channel …`, not update:list or update:view.
    const updates = easCalls(deploy).filter((line) => /\bupdate --channel\b/.test(line));
    expect(updates.length).toBeGreaterThan(0);
    for (const line of updates) {
      expect(line).toContain("--channel preview");
      expect(line).toContain("--environment preview");
      expect(line).toMatch(/\benv:exec preview '/);
    }
  });

  it("a native change starts a preview build, never a production one, from inside the preview environment", () => {
    const builds = easCalls(deploy).filter((line) => /\bbuild --profile\b/.test(line));
    expect(builds.length).toBeGreaterThan(0);
    for (const line of builds) {
      expect(line).toContain("--profile preview");
      expect(line).toMatch(/\benv:exec preview '/);
    }
  });
});

describe("release: the production build", () => {
  it("runs inside the EAS production environment, so the config read sees its values", () => {
    const builds = easCalls(release).filter((line) => /\bbuild --profile\b/.test(line));
    expect(builds.length).toBeGreaterThan(0);
    for (const line of builds) {
      expect(line).toContain("--profile production");
      expect(line).toMatch(/\benv:exec production '/);
    }
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
