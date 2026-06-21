// Code execution via Wandbox (https://wandbox.org/api/) — free, keyless.
// One swappable seam: callers depend on runCode(), not on the backend. A
// self-hosted Piston / Judge0 adapter can drop in here unchanged.
//
// (We moved off emkc.org Piston, which became whitelist-only in Feb 2026.)

const WANDBOX = process.env.WANDBOX_URL ?? "https://wandbox.org/api";

export type RunLang = "CPP" | "PYTHON";

export type RunResult = {
  ok: boolean; // compiled and exited 0
  stage: "compile" | "run";
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
};

const COMPILER: Record<RunLang, string> = {
  CPP: process.env.WANDBOX_CPP ?? "gcc-13.2.0",
  PYTHON: process.env.WANDBOX_PY ?? "cpython-3.12.7",
};

type WandboxResp = {
  status?: string; // program (or compiler) exit code as string
  signal?: string;
  compiler_output?: string;
  compiler_error?: string;
  program_output?: string;
  program_error?: string;
};

export async function runCode(opts: {
  language: RunLang;
  source: string;
  stdin?: string;
}): Promise<RunResult> {
  const body: Record<string, unknown> = {
    code: opts.source,
    compiler: COMPILER[opts.language],
    stdin: opts.stdin ?? "",
    save: false,
  };
  if (opts.language === "CPP") body["compiler-option-raw"] = "-O2\n-std=gnu++17";

  const res = await fetch(`${WANDBOX}/compile.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return {
      ok: false,
      stage: "run",
      stdout: "",
      stderr: `Execution service error (HTTP ${res.status}).`,
      code: null,
      signal: null,
    };
  }

  const d = (await res.json()) as WandboxResp;
  const compileErr = (d.compiler_error ?? "").trim();
  const stdout = d.program_output ?? "";
  const stderr = d.program_error ?? "";
  const status = d.status ?? null;
  const exit = status !== null ? parseInt(status, 10) : null;

  // Compile failure: program never ran (no output) and there's a compiler error.
  if (compileErr && !stdout && !stderr && status !== "0") {
    return {
      ok: false,
      stage: "compile",
      stdout: "",
      stderr: compileErr,
      code: exit,
      signal: d.signal ?? null,
    };
  }

  return {
    ok: status === "0",
    stage: "run",
    stdout,
    // surface compiler warnings only if the program also errored
    stderr: stderr || (status !== "0" && compileErr ? compileErr : ""),
    code: exit,
    signal: d.signal ?? null,
  };
}
