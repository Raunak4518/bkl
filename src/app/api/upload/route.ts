import { NextRequest, NextResponse } from "next/server";

import { normalizeGitHubFolder, resolveGitHubConfig } from "@/lib/github-config";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const owner = formData.get("owner")?.toString()?.trim();
    const repo = formData.get("repo")?.toString()?.trim();
    const branch = formData.get("branch")?.toString()?.trim();
    const folder = formData.get("folder")?.toString()?.trim();
    const commitMessage = formData.get("commitMessage")?.toString()?.trim() || "Add uploaded files";
    const files = formData.getAll("files");

    const config = resolveGitHubConfig({ owner, repo, branch, folder });
    const { owner: resolvedOwner, repo: resolvedRepo, branch: resolvedBranch, folder: resolvedFolder } = config;

    if (!resolvedOwner || !resolvedRepo) {
      return NextResponse.json({ error: "Set GITHUB_OWNER and GITHUB_REPO in .env.local or enter them in the form." }, { status: 400 });
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "At least one file is required." }, { status: 400 });
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Missing GITHUB_TOKEN environment variable. Add it to your .env.local file." },
        { status: 500 },
      );
    }

    const repoInfo = await fetch(`https://api.github.com/repos/${resolvedOwner}/${resolvedRepo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!repoInfo.ok) {
      const repoError = await repoInfo.text();
      return NextResponse.json(
        {
          error: `GitHub repository not found or inaccessible: ${repoError}`,
        },
        { status: 400 },
      );
    }

    const uploads = [] as Array<{ fileName: string; downloadUrl?: string; sha?: string }>;

    for (const fileEntry of files) {
      if (!(fileEntry instanceof File)) {
        continue;
      }

      const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());
      const fileName = fileEntry.name;
      const normalizedFolder = normalizeGitHubFolder(resolvedFolder);
      const githubPath = normalizedFolder ? `${normalizedFolder}/${fileName}` : fileName;
      const base64Content = fileBuffer.toString("base64");

      const existingFile = await fetch(
        `https://api.github.com/repos/${resolvedOwner}/${resolvedRepo}/contents/${encodeURIComponent(githubPath)}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );

      const requestBody: Record<string, string> = {
        message: commitMessage,
        content: base64Content,
        branch: resolvedBranch,
      };

      if (existingFile.ok) {
        const existing = await existingFile.json();
        requestBody.sha = existing.sha;
      }

      const uploadResponse = await fetch(`https://api.github.com/repos/${resolvedOwner}/${resolvedRepo}/contents/${encodeURIComponent(githubPath)}`, {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok) {
        console.error("GitHub upload failed", uploadData);
        return NextResponse.json(
          {
            error: uploadData?.message || `Failed to upload ${fileName} to GitHub`,
          },
          { status: 400 },
        );
      }

      uploads.push({
        fileName,
        downloadUrl: uploadData?.content?.download_url,
        sha: uploadData?.content?.sha,
      });
    }

    return NextResponse.json({
      success: true,
      owner: resolvedOwner,
      repo: resolvedRepo,
      branch: resolvedBranch,
      folder: resolvedFolder,
      uploads,
    });
  } catch (error) {
    console.error("Upload handler error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected upload error",
      },
      { status: 500 },
    );
  }
}
