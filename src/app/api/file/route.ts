import { NextRequest, NextResponse } from "next/server";

import { resolveGitHubConfig } from "@/lib/github-config";

const getHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

/**
 * GET — Fetch a single file's content from GitHub.
 * Query: owner, repo, branch, path
 * Returns: { content (utf-8 text), sha, name, size }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner")?.trim();
    const repo = searchParams.get("repo")?.trim();
    const branch = searchParams.get("branch")?.trim();
    const path = searchParams.get("path")?.trim();

    const config = resolveGitHubConfig({ owner, repo, branch });
    const {
      owner: resolvedOwner,
      repo: resolvedRepo,
      branch: resolvedBranch,
    } = config;

    if (!resolvedOwner || !resolvedRepo || !path) {
      return NextResponse.json(
        { error: "owner, repo, and path are required." },
        { status: 400 },
      );
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Missing GITHUB_TOKEN." },
        { status: 500 },
      );
    }

    const url = `https://api.github.com/repos/${resolvedOwner}/${resolvedRepo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(resolvedBranch)}`;
    const response = await fetch(url, { headers: getHeaders(token) });
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.message || "Failed to fetch file." },
        { status: response.status },
      );
    }

    if (data.type !== "file") {
      return NextResponse.json(
        { error: "Path is not a file." },
        { status: 400 },
      );
    }

    // GitHub returns base64-encoded content
    const content = Buffer.from(data.content, "base64").toString("utf-8");

    return NextResponse.json({
      content,
      sha: data.sha,
      name: data.name,
      size: data.size,
      path: data.path,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch file content.",
      },
      { status: 500 },
    );
  }
}

/**
 * PUT — Create or update a file on GitHub with text content.
 * Body JSON: { owner, repo, branch, path, content, message, sha? }
 * If sha is provided, it's an update; otherwise it's a create.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const owner = body.owner?.toString().trim();
    const repo = body.repo?.toString().trim();
    const branch = body.branch?.toString().trim();
    const path = body.path?.toString().trim();
    const content = body.content?.toString() ?? "";
    const message = body.message?.toString().trim() || `Update ${path}`;
    const sha = body.sha?.toString().trim() || undefined;

    const config = resolveGitHubConfig({ owner, repo, branch });
    const {
      owner: resolvedOwner,
      repo: resolvedRepo,
      branch: resolvedBranch,
    } = config;

    if (!resolvedOwner || !resolvedRepo || !path) {
      return NextResponse.json(
        { error: "owner, repo, and path are required." },
        { status: 400 },
      );
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Missing GITHUB_TOKEN." },
        { status: 500 },
      );
    }

    const base64Content = Buffer.from(content, "utf-8").toString("base64");

    const requestBody: Record<string, string> = {
      message,
      content: base64Content,
      branch: resolvedBranch,
    };

    // sha is needed to update an existing file
    if (sha) {
      requestBody.sha = sha;
    } else {
      // Check if file already exists (might be overwriting without known sha)
      const existingResponse = await fetch(
        `https://api.github.com/repos/${resolvedOwner}/${resolvedRepo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(resolvedBranch)}`,
        { headers: getHeaders(token) },
      );
      if (existingResponse.ok) {
        const existing = await existingResponse.json();
        requestBody.sha = existing.sha;
      }
    }

    const response = await fetch(
      `https://api.github.com/repos/${resolvedOwner}/${resolvedRepo}/contents/${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: {
          ...getHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.message || "Failed to save file." },
        { status: response.status },
      );
    }

    return NextResponse.json({
      success: true,
      sha: data?.content?.sha,
      path: data?.content?.path,
      downloadUrl: data?.content?.download_url,
    });
  } catch (error) {
    console.error("File save error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save file.",
      },
      { status: 500 },
    );
  }
}
