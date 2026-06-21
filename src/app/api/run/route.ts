import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCode } from "@/lib/execution/runner";

const Body = z.object({
  language: z.enum(["CPP", "PYTHON"]),
  source: z.string().min(1).max(200_000),
  stdin: z.string().max(200_000).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    const result = await runCode(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Execution failed" },
      { status: 502 },
    );
  }
}
