import { NextResponse } from "next/server";

import { resolveGitHubConfig } from "@/lib/github-config";

export async function GET() {
  try {
    const config = resolveGitHubConfig({});

    return NextResponse.json({
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      folder: config.folder,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load config.",
      },
      { status: 500 },
    );
  }
}
