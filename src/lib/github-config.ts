export type GitHubConfig = {
  owner: string;
  repo: string;
  branch: string;
  folder: string;
};

export const normalizeGitHubFolder = (value?: string | null) => {
  if (typeof value !== "string") return "";

  return value.trim().replace(/^\/+|\/+$/g, "");
};

const firstDefinedValue = (...values: Array<string | undefined | null>) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

export const resolveGitHubConfig = ({
  owner,
  repo,
  branch,
  folder,
  env,
}: {
  owner?: string;
  repo?: string;
  branch?: string;
  folder?: string;
  env?: Record<string, string | undefined>;
}): GitHubConfig => {
  const fallbackEnv = env ?? process.env;
  const resolvedOwner = firstDefinedValue(owner, fallbackEnv.GITHUB_OWNER);
  const resolvedRepo = firstDefinedValue(repo, fallbackEnv.GITHUB_REPO);
  const resolvedBranch = firstDefinedValue(branch, fallbackEnv.GITHUB_BRANCH, "main") || "main";
  const resolvedFolder = normalizeGitHubFolder(firstDefinedValue(folder, fallbackEnv.GITHUB_FOLDER));

  return {
    owner: resolvedOwner,
    repo: resolvedRepo,
    branch: resolvedBranch,
    folder: resolvedFolder,
  };
};
