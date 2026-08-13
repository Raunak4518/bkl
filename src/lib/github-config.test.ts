import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeGitHubFolder, resolveGitHubConfig } from "./github-config.ts";

describe("github config resolution", () => {
  it("uses env values when form values are empty", () => {
    const config = resolveGitHubConfig({
      owner: "",
      repo: "",
      branch: "",
      folder: "",
      env: {
        GITHUB_OWNER: "octocat",
        GITHUB_REPO: "hello-world",
        GITHUB_BRANCH: "develop",
        GITHUB_FOLDER: "assignments",
      },
    });

    assert.equal(config.owner, "octocat");
    assert.equal(config.repo, "hello-world");
    assert.equal(config.branch, "develop");
    assert.equal(config.folder, "assignments");
  });

  it("treats blank folder values as root and does not hardcode uploads", () => {
    assert.equal(normalizeGitHubFolder("   "), "");
    assert.equal(normalizeGitHubFolder("/assignments/"), "assignments");
    assert.equal(normalizeGitHubFolder("uploads"), "uploads");
  });
});
