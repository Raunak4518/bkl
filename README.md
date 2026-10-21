# RepoLab Studio

> Suggested repository rename: **`repolab-studio`**

RepoLab Studio is a browser-based GitHub repository workspace built with Next.js.  
It combines a file explorer, uploader, editor, preview tools, and lightweight code execution in one interface.

## Features

- Browse repository files and folders from GitHub
- Upload one or multiple files to a selected branch/path
- Create folders and create/update files directly from the UI
- Monaco-based code editor with syntax highlighting
- Preview support for:
  - Markdown
  - JSON
  - CSV
  - Images, audio, video, PDF
  - Jupyter notebooks (`.ipynb`)
- In-browser execution support for Python/C/C++
- Optional PIN-based access protection

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Monaco Editor, Prism, xterm.js

## Environment Variables

Create a `.env.local` file in the repository root:

```bash
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_OWNER=your-github-username-or-org
GITHUB_REPO=target-repository-name
GITHUB_BRANCH=main
GITHUB_FOLDER=

# Optional access control
ACCESS_PIN=1234
SESSION_SECRET=replace-with-a-long-random-secret
```

### Notes

- `GITHUB_TOKEN` should have repository content write access for the target repo.
- `GITHUB_FOLDER` is optional and can be used as a default subfolder.
- If `SESSION_SECRET` is not set, auth is bypassed (development convenience).

## Getting Started

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` — start development server
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — run ESLint

## Project Structure

- `/src/app` — UI pages, components, and API routes
- `/src/lib/github-config.ts` — GitHub config resolution helpers
- `/src/proxy.ts` — request guard/auth proxy logic

## Security

- Keep `GITHUB_TOKEN`, `ACCESS_PIN`, and `SESSION_SECRET` private.
- Never commit `.env.local`.
