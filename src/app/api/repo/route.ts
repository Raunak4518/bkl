import { NextRequest, NextResponse } from "next/server";

import { resolveGitHubConfig } from "@/lib/github-config";

const getRepoHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner")?.trim();
    const repo = searchParams.get("repo")?.trim();
    const branch = searchParams.get("branch")?.trim();
    const path = searchParams.get("path")?.trim() || "";

    const config = resolveGitHubConfig({ owner, repo, branch });
    const { owner: resolvedOwner, repo: resolvedRepo, branch: resolvedBranch } = config;

    if (!resolvedOwner || !resolvedRepo) {
      return NextResponse.json({ error: "owner and repo are required." }, { status: 400 });
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Missing GITHUB_TOKEN environment variable." },
        { status: 500 },
      );
    }

    const contentsUrl = path
      ? `https://api.github.com/repos/${resolvedOwner}/${resolvedRepo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(resolvedBranch)}`
      : `https://api.github.com/repos/${resolvedOwner}/${resolvedRepo}/contents?ref=${encodeURIComponent(resolvedBranch)}`;

    const response = await fetch(contentsUrl, {
      headers: getRepoHeaders(token),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.message || "Unable to load repository contents." },
        { status: response.status },
      );
    }

    const items = Array.isArray(data) ? data : [data];

    return NextResponse.json({
      owner: resolvedOwner,
      repo: resolvedRepo,
      branch: resolvedBranch,
      path,
      items: items.map((item) => ({
        type: item.type,
        name: item.name,
        path: item.path,
        size: item.size,
        download_url: item.download_url,
        html_url: item.html_url,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error while loading repo contents.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const owner = body.owner?.toString().trim();
    const repo = body.repo?.toString().trim();
    const branch = body.branch?.toString().trim();
    const folderPath = body.folderPath?.toString().trim();

    const config = resolveGitHubConfig({ owner, repo, branch });
    const { owner: resolvedOwner, repo: resolvedRepo, branch: resolvedBranch } = config;

    if (!resolvedOwner || !resolvedRepo || !folderPath) {
      return NextResponse.json({ error: "owner, repo, and folderPath are required." }, { status: 400 });
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Missing GITHUB_TOKEN environment variable." },
        { status: 500 },
      );
    }

    const normalizedFolderPath = folderPath.replace(/^\/+|\/+$/g, "");
    const keepPath = normalizedFolderPath ? `${normalizedFolderPath}/.keep` : ".keep";
    const base64Content = Buffer.from("").toString("base64");

    const response = await fetch(
      `https://api.github.com/repos/${resolvedOwner}/${resolvedRepo}/contents/${encodeURIComponent(keepPath)}`,
      {
        method: "PUT",
        headers: {
          ...getRepoHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Create folder ${normalizedFolderPath || "root"}`,
          content: base64Content,
          branch: resolvedBranch,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.message || "Failed to create folder." },
        { status: response.status },
      );
    }

    return NextResponse.json({
      success: true,
      createdPath: normalizedFolderPath,
      keepFile: keepPath,
      sha: data?.content?.sha,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error while creating folder.",
      },
      { status: 500 },
    );
  }
}
