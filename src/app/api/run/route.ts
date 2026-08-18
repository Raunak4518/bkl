import { NextRequest, NextResponse } from "next/server";

const COMPILERS: Record<string, string> = {
  "c++": "gcc-head",
  "cpp": "gcc-head",
  "python": "cpython-head",
  "c": "gcc-head-c",
};

export async function POST(request: NextRequest) {
  try {
    const sessionSecret = process.env.SESSION_SECRET;
    const sessionCookie = request.cookies.get("session")?.value;

    if (sessionSecret && sessionCookie !== sessionSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { language, code, stdin, args } = await request.json();

    if (!language || !code) {
      return NextResponse.json({ error: "Language and code are required." }, { status: 400 });
    }

    const compiler = COMPILERS[language.toLowerCase()];
    if (!compiler) {
      return NextResponse.json({ error: "Unsupported language." }, { status: 400 });
    }

    // Submit code to Wandbox (No API key required!)
    const submitResponse = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        compiler: compiler,
        code: code,
        stdin: stdin || "",
        "runtime-option-raw": args ? args.split(" ").join("\n") : "",
        save: false,
      }),
    });

    if (!submitResponse.ok) {
      const err = await submitResponse.text();
      throw new Error(`Execution API error: ${submitResponse.status}`);
    }

    const result = await submitResponse.json();

    const stdout = result.program_message || "";
    const stderr = result.compiler_error || result.program_error || "";
    const exitCode = result.status === "0" ? 0 : 1;

    return NextResponse.json({
      stdout,
      stderr,
      code: exitCode,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Execution error." },
      { status: 500 }
    );
  }
}
