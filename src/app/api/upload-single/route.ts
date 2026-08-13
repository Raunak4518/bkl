import { NextRequest, NextResponse } from "next/server";

import { normalizeGitHubFolder, resolveGitHubConfig } from "@/lib/github-config";

/**
 * Upload a single file to GitHub. Used by the frontend to upload files
 * one-by-one so it can show per-file progress.
 *
 * FormData fields:
 *  - owner, repo, branch, folder: repo targeting
 *  - file: the single file to upload
 *  - fileName: optional override name (for rename-before-upload)
 *  - commitMessage: optional custom commit message
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const owner = formData.get("owner")?.toString()?.trim();
    const repo = formData.get("repo")?.toString()?.trim();
    const branch = formData.get("branch")?.toString()?.trim();
    const folder = formData.get("folder")?.toString()?.trim();
    const overrideName = formData.get("fileName")?.toString()?.trim();
    const commitMessage = formData.get("commitMessage")?.toString()?.trim();
    const fileEntry = formData.get("file");

    const config = resolveGitHubConfig({ owner, repo, branch, folder });
    const {
      owner: resolvedOwner,
      repo: resolvedRepo,
      branch: resolvedBranch,
      folder: resolvedFolder,
    } = config;

    if (!resolvedOwner || !resolvedRepo) {
      return NextResponse.json(
        { error: "Set GITHUB_OWNER and GITHUB_REPO in .env.local." },
        { status: 400 },
      );
    }

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: "A single file is required." },
        { status: 400 },
      );
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Missing GITHUB_TOKEN environment variable." },
        { status: 500 },
      );
    }

    const fileName = overrideName || fileEntry.name;
    const normalizedFolder = normalizeGitHubFolder(resolvedFolder);
    const githubPath = normalizedFolder
      ? `${normalizedFolder}/${fileName}`
      : fileName;

    const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());
    const base64Content = fileBuffer.toString("base64");
    const message =
      commitMessage || `Upload ${fileName}`;

    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };

    // Check if file already exists (need sha to update)
    const existingFile = await fetch(
      `https://api.github.com/repos/${resolvedOwner}/${resolvedRepo}/contents/${encodeURIComponent(githubPath)}?ref=${encodeURIComponent(resolvedBranch)}`,
      { headers },
    );

    const requestBody: Record<string, string> = {
      message,
      content: base64Content,
      branch: resolvedBranch,
    };

    if (existingFile.ok) {
      const existing = await existingFile.json();
      requestBody.sha = existing.sha;
    }

    const uploadResponse = await fetch(
      `https://api.github.com/repos/${resolvedOwner}/${resolvedRepo}/contents/${encodeURIComponent(githubPath)}`,
      {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    );

    const uploadData = await uploadResponse.json();

    if (!uploadResponse.ok) {
      return NextResponse.json(
        { error: uploadData?.message || `Failed to upload ${fileName}` },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      fileName,
      downloadUrl: uploadData?.content?.download_url,
      sha: uploadData?.content?.sha,
    });
  } catch (error) {
    console.error("Single upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected upload error" },
      { status: 500 },
    );
  }
}
