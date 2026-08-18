"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import dynamic from "next/dynamic";
import Papa from "papaparse";

import Prism from "prismjs";
import Editor from "@monaco-editor/react";
import { Command } from "cmdk";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import type { Terminal as XTermType } from "xterm";
import "xterm/css/xterm.css";
import { 
  FileText, Folder, Image as ImageIcon, FileCode2, FileJson,
  FileIcon, FileType2, Terminal, Play, Save, Settings, LogOut,
  ChevronRight, ArrowLeft, Plus, X, UploadCloud, ChevronDown,
  Film, Music
} from "lucide-react";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-java";
import "prismjs/components/prism-python";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-markup";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type RepoItem = {
  type: "dir" | "file";
  name: string;
  path: string;
  size?: number;
  download_url?: string | null;
  html_url?: string | null;
};

type StatusState = {
  type: "idle" | "loading" | "success" | "error";
  message: string;
};

type QueuedFile = {
  id: string;
  file: File;
  displayName: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

type ViewMode = "browse" | "viewer" | "editor";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".c": "c", ".h": "c",
  ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp",
  ".java": "java",
  ".py": "python",
  ".js": "javascript", ".mjs": "javascript",
  ".ts": "typescript",
  ".jsx": "javascript", ".tsx": "typescript",
  ".html": "markup", ".htm": "markup", ".xml": "markup", ".svg": "markup",
  ".css": "css",
  ".json": "json",
  ".sql": "sql",
  ".sh": "bash", ".bash": "bash",
  ".md": "markdown",
};

const TEXT_EXTENSIONS = Object.keys(EXTENSION_TO_LANGUAGE).concat([
  ".txt", ".log", ".csv", ".ini", ".cfg", ".conf", ".toml",
  ".yaml", ".yml", ".r", ".m", ".pl", ".lua", ".asm", ".s",
  ".v", ".vhd", ".rs", ".go", ".rb", ".php", ".cs", ".swift",
  ".kt", ".scala", ".bat",
]);

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".mkv"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".aac"];
const PDF_EXTENSIONS = [".pdf"];

const TEMPLATES: Record<string, { label: string; extension: string; content: string }> = {
  cpp: {
    label: "C++",
    extension: ".cpp",
    content: `#include <iostream>
using namespace std;

int main() {
    
    return 0;
}
`,
  },
  python: {
    label: "Python",
    extension: ".py",
    content: `def main():
    pass

if __name__ == "__main__":
    main()
`,
  },
  markdown: {
    label: "Markdown",
    extension: ".md",
    content: `# Title
    
Write your markdown here...
`,
  },
  jupyter: {
    label: "Jupyter",
    extension: ".ipynb",
    content: `{
  "cells": [
    {
      "cell_type": "markdown",
      "metadata": {},
      "source": [
        "# New Notebook\\n",
        "Write your description here."
      ]
    },
    {
      "cell_type": "code",
      "execution_count": null,
      "metadata": {},
      "outputs": [],
      "source": [
        "print('Hello from Jupyter!')"
      ]
    }
  ],
  "metadata": {},
  "nbformat": 4,
  "nbformat_minor": 5
}`,
  },
  empty: {
    label: "Empty",
    extension: "",
    content: "",
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const formatBytes = (bytes = 0) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / k ** i;
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
};

const makeFileId = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;

const getExtension = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
};

const getLanguage = (name: string): string | null => {
  const ext = getExtension(name);
  return EXTENSION_TO_LANGUAGE[ext] || null;
};

const getMonacoLanguage = (name: string): string => {
  const ext = getExtension(name);
  if ([".cpp", ".cxx", ".cc", ".c", ".h", ".hpp"].includes(ext)) return "cpp";
  if (ext === ".py") return "python";
  if ([".js", ".jsx", ".mjs"].includes(ext)) return "javascript";
  if ([".ts", ".tsx"].includes(ext)) return "typescript";
  if ([".html", ".htm"].includes(ext)) return "html";
  if (ext === ".css") return "css";
  if ([".json", ".ipynb"].includes(ext)) return "json";
  if (ext === ".md") return "markdown";
  if (ext === ".xml" || ext === ".svg") return "xml";
  if (ext === ".sql") return "sql";
  if (ext === ".sh" || ext === ".bash") return "shell";
  return "plaintext";
};

const isTextFile = (name: string) => {
  const ext = getExtension(name);
  return TEXT_EXTENSIONS.includes(ext);
};

const isImageFile = (name: string) => {
  const ext = getExtension(name);
  return IMAGE_EXTENSIONS.includes(ext);
};

const isVideoFile = (name: string) => VIDEO_EXTENSIONS.includes(getExtension(name));
const isAudioFile = (name: string) => AUDIO_EXTENSIONS.includes(getExtension(name));
const isPdfFile = (name: string) => PDF_EXTENSIONS.includes(getExtension(name));
const isSupportedMediaFile = (name: string) => isImageFile(name) || isVideoFile(name) || isAudioFile(name) || isPdfFile(name);

const getFileIcon = (name: string, type: "file" | "dir", className = "h-4 w-4") => {
  if (type === "dir") return <Folder className={`${className} text-violet-400`} fill="currentColor" />;
  const ext = getExtension(name);
  if ([".cpp", ".cxx", ".cc", ".c", ".h", ".hpp"].includes(ext)) return <FileCode2 className={`${className} text-blue-400`} />;
  if (ext === ".py") return <FileType2 className={`${className} text-yellow-400`} />;
  if ([".js", ".jsx", ".ts", ".tsx"].includes(ext)) return <FileType2 className={`${className} text-yellow-400`} />;
  if (ext === ".md") return <FileText className={`${className} text-emerald-400`} />;
  if ([".json", ".ipynb"].includes(ext)) return <FileJson className={`${className} text-orange-400`} />;
  if (isImageFile(name)) return <ImageIcon className={`${className} text-purple-400`} />;
  if (isVideoFile(name)) return <Film className={`${className} text-pink-400`} />;
  if (isAudioFile(name)) return <Music className={`${className} text-blue-300`} />;
  if (isPdfFile(name)) return <FileText className={`${className} text-red-400`} />;
  return <FileIcon className={`${className} text-slate-400`} />;
};

const highlightCode = (code: string, fileName: string): string => {
  const lang = getLanguage(fileName);
  if (lang && Prism.languages[lang]) {
    return Prism.highlight(code, Prism.languages[lang], lang);
  }
  // Fallback: escape HTML
  return code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

/* ------------------------------------------------------------------ */
/*  Data Viewers                                                       */
/* ------------------------------------------------------------------ */

const ReactJson = dynamic(() => import("react-json-view"), { ssr: false });

const CsvViewer = ({ content }: { content: string }) => {
  const [isDark, setIsDark] = useState(true);
  const parsed = useMemo(() => {
    try {
      return Papa.parse(content, { header: true, skipEmptyLines: true });
    } catch { return null; }
  }, [content]);

  if (!parsed || !parsed.meta.fields) return <div className="text-red-500 p-4">Failed to parse CSV</div>;

  return (
    <div className={`w-full h-full p-4 overflow-auto shadow-inner relative ${isDark ? 'bg-[#0d1117]' : 'bg-slate-100'}`}>
      <button onClick={() => setIsDark(!isDark)} className={`absolute top-6 right-6 z-20 px-3 py-1 text-xs rounded border transition shadow-lg ${isDark ? 'bg-[#21262d] border-[#30363d] text-slate-300 hover:bg-[#30363d]' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
        {isDark ? "☀ Light Mode" : "🌙 Dark Mode"}
      </button>
      <div className={`rounded shadow border overflow-x-auto ${isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-300'}`}>
        <table className={`w-full text-sm text-left whitespace-nowrap ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
          <thead className={`text-xs uppercase sticky top-0 shadow-sm z-10 ${isDark ? 'text-slate-400 bg-[#21262d]' : 'text-slate-600 bg-slate-200'}`}>
            <tr>
              <th className={`px-4 py-3 font-semibold border-b border-r w-12 text-center ${isDark ? 'bg-[#21262d] border-[#30363d] text-slate-500' : 'bg-slate-200 border-slate-300 text-slate-400'}`}>#</th>
              {parsed.meta.fields.map((field, idx) => (
                <th key={idx} className={`px-6 py-3 font-semibold border-b ${isDark ? 'border-[#30363d] bg-[#21262d]' : 'border-slate-300 bg-slate-200'}`}>{field}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.data.slice(0, 100).map((row: any, idx) => (
              <tr key={idx} className={`border-b transition-colors ${isDark ? 'border-[#30363d] hover:bg-[#21262d]' : 'border-slate-200 hover:bg-violet-50'}`}>
                <td className={`px-4 py-3 border-r text-center ${isDark ? 'text-slate-500 border-[#30363d] bg-[#161b22]' : 'text-slate-400 border-slate-200 bg-slate-50'}`}>{idx + 1}</td>
                {parsed.meta.fields?.map((field, vIdx) => (
                  <td key={vIdx} className="px-6 py-3">{row[field]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {parsed.data.length > 100 && (
          <div className={`p-4 text-center italic text-xs border-t ${isDark ? 'text-slate-500 bg-[#161b22] border-[#30363d]' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
            Showing first 100 rows of {parsed.data.length} total rows.
          </div>
        )}
      </div>
    </div>
  );
};

const JsonViewer = ({ content }: { content: string }) => {
  const [isDark, setIsDark] = useState(true);
  const parsed = useMemo(() => {
    try { return JSON.parse(content); } catch { return null; }
  }, [content]);

  if (!parsed) return <div className="text-red-500 p-4">Failed to parse JSON</div>;

  return (
    <div className={`w-full h-full p-6 overflow-auto relative text-left ${isDark ? 'bg-[#0d1117]' : 'bg-slate-100'}`}>
      <button onClick={() => setIsDark(!isDark)} className={`absolute top-6 right-6 z-20 px-3 py-1 text-xs rounded border transition shadow-lg ${isDark ? 'bg-[#21262d] border-[#30363d] text-slate-300 hover:bg-[#30363d]' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
        {isDark ? "☀ Light Mode" : "🌙 Dark Mode"}
      </button>
      <div className={`p-4 rounded shadow border overflow-x-auto ${isDark ? 'bg-[#1e1e1e] border-[#30363d]' : 'bg-white border-slate-300'}`}>
        <ReactJson src={parsed} theme={isDark ? "monokai" : "rjv-default"} displayDataTypes={false} enableClipboard={false} style={{ backgroundColor: "transparent", fontSize: "14px" }} />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Home() {
  // Repo config
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");

  // Browser state
  const [currentPath, setCurrentPath] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [items, setItems] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Execution state
  const [executing, setExecuting] = useState(false);
  const [execOutput, setExecOutput] = useState<{ stdout: string; stderr: string; code: number } | null>(null);
  const [execStdin, setExecStdin] = useState("");
  const [execArgs, setExecArgs] = useState("");
  const [execPlots, setExecPlots] = useState<string[]>([]);
  const [replInput, setReplInput] = useState("");

  // Advanced IDE features state
  const [openCmdk, setOpenCmdk] = useState(false);
  const xtermRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XTermType | null>(null);

  useEffect(() => {
    setMounted(true);
    
    // Background Pre-Warming for Data Science Kernel
    setTimeout(async () => {
      try {
        if (!(window as any).pyodide) {
          if (!document.getElementById("pyodide-script")) {
            const script = document.createElement("script");
            script.id = "pyodide-script";
            script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js";
            document.head.appendChild(script);
            await new Promise((resolve) => script.onload = resolve);
          }
          (window as any).pyodideStdout = "";
          (window as any).pyodideStderr = "";
          (window as any).pyodide = await (window as any).loadPyodide({
            stdout: (msg: string) => { (window as any).pyodideStdout += msg + "\n"; },
            stderr: (msg: string) => { (window as any).pyodideStderr += msg + "\n"; },
          });
          await (window as any).pyodide.loadPackage(["micropip"]);
          const micropip = (window as any).pyodide.pyimport("micropip");
          await micropip.install(["pandas", "numpy", "matplotlib", "scikit-learn", "scipy"]);
          
          await (window as any).pyodide.runPythonAsync(`
import matplotlib
matplotlib.use("module://matplotlib_pyodide.html5_canvas_backend")
import matplotlib.pyplot as plt
plt.show = lambda *args, **kwargs: None
          `);
          console.log("Pyodide Pre-warmed & Ready!");
        }
      } catch (e) {
        console.error("Pyodide Pre-warm failed", e);
      }
    }, 1000);

    const down = (e: globalThis.KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpenCmdk((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    if ((executing || execOutput) && xtermRef.current && !xtermInstance.current) {
      import("xterm").then(({ Terminal }) => {
        import("xterm-addon-fit").then(({ FitAddon }) => {
          if (isCancelled || xtermInstance.current || !xtermRef.current) return;
          
          const term = new Terminal({
            theme: { background: 'transparent', foreground: '#c9d1d9', cursor: '#8b5cf6' },
            fontFamily: 'monospace',
            fontSize: 13,
          });
          const fitAddon = new FitAddon();
          term.loadAddon(fitAddon);
          term.open(xtermRef.current);
          fitAddon.fit();
          
          resizeObserver = new ResizeObserver(() => fitAddon.fit());
          resizeObserver.observe(xtermRef.current);
          
          xtermInstance.current = term;

          if (execOutput) {
            term.write(execOutput.stdout.replace(/\n/g, '\r\n') + '\r\n');
            term.write('\x1b[31m' + execOutput.stderr.replace(/\n/g, '\r\n') + '\x1b[0m\r\n');
            term.write(`\x1b[90mExited with code ${execOutput.code}\x1b[0m\r\n`);
          } else if (executing) {
            term.write('\x1b[36mRunning code...\x1b[0m\r\n');
          }
        });
      });
    }

    return () => {
      isCancelled = true;
      if (resizeObserver) resizeObserver.disconnect();
      if (xtermInstance.current) {
        xtermInstance.current.dispose();
        xtermInstance.current = null;
      }
    };
  }, [executing, execOutput]);

  useEffect(() => {
    if (!executing && execOutput && xtermInstance.current) {
      const term = xtermInstance.current;
      term.clear();
      if (execOutput.stdout) {
        term.write(execOutput.stdout.replace(/\n/g, '\r\n') + '\r\n');
      }
      if (execOutput.stderr) {
        term.write('\x1b[31m' + execOutput.stderr.replace(/\n/g, '\r\n') + '\x1b[0m\r\n');
      }
      term.write(`\x1b[90mExited with code ${execOutput.code}\x1b[0m\r\n`);
    } else if (executing && xtermInstance.current) {
      xtermInstance.current.clear();
      xtermInstance.current.write('\x1b[36mRunning code...\x1b[0m\r\n');
    }
  }, [executing, execOutput]);

  // Upload state
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Upload preview state
  const [previewFile, setPreviewFile] = useState<QueuedFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // View mode: browse (default), viewer (read-only), editor (create/edit)
  const [viewMode, setViewMode] = useState<ViewMode>("browse");
  const [editorTab, setEditorTab] = useState<"code" | "preview">("code");

  // Editor/viewer state
  const [editorContent, setEditorContent] = useState("");
  const [editorFileName, setEditorFileName] = useState("");
  const [editorFilePath, setEditorFilePath] = useState<string | null>(null);
  const [editorFileSha, setEditorFileSha] = useState<string | null>(null);
  const [editorFileUrl, setEditorFileUrl] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  // Execution state moved up

  // Status toast
  const [status, setStatus] = useState<StatusState>({ type: "idle", message: "" });

  /* ---------------------------------------------------------------- */
  /*  Inactivity Auto-Logout                                            */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      // Auto-logout after 15 minutes of inactivity
      timeoutId = setTimeout(async () => {
        await fetch("/api/auth", { method: "DELETE" });
        window.location.reload();
      }, 15 * 60 * 1000);
    };

    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("click", resetTimer);
    window.addEventListener("scroll", resetTimer);

    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("click", resetTimer);
      window.removeEventListener("scroll", resetTimer);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Repo browsing                                                    */
  /* ---------------------------------------------------------------- */

  const fetchRepoContents = useCallback(
    async (path: string, repoOwner: string, repoName: string, repoBranch: string) => {
      if (!repoOwner || !repoName) {
        setItems([]);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({ owner: repoOwner, repo: repoName, branch: repoBranch, path });
        const response = await fetch(`/api/repo?${params.toString()}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load repository.");
        setItems(payload.items || []);
        setStatus({ type: "idle", message: "" });
      } catch (error) {
        setStatus({ type: "error", message: error instanceof Error ? error.message : "Something went wrong." });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch("/api/config");
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load config.");

        const nextOwner = payload.owner || "";
        const nextRepo = payload.repo || "";
        const nextBranch = payload.branch || "main";
        setOwner(nextOwner);
        setRepo(nextRepo);
        setBranch(nextBranch);

        if (nextOwner && nextRepo) {
          await fetchRepoContents("", nextOwner, nextRepo, nextBranch);
        } else {
          setLoading(false);
          setStatus({ type: "error", message: "Set GITHUB_OWNER and GITHUB_REPO in .env.local." });
        }
      } catch (error) {
        setLoading(false);
        setStatus({ type: "error", message: error instanceof Error ? error.message : "Something went wrong." });
      }
    };
    loadConfig();
  }, [fetchRepoContents]);

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    setViewMode("browse");
    fetchRepoContents(path, owner, repo, branch);
  };

  const breadcrumb = currentPath ? currentPath.split("/").filter(Boolean) : [];

  const handleCreateFolder = async () => {
    const cleanName = newFolderName.trim();
    if (!cleanName) return;
    const targetPath = currentPath ? `${currentPath}/${cleanName}` : cleanName;
    setStatus({ type: "loading", message: "Creating folder..." });
    try {
      const response = await fetch("/api/repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, branch, folderPath: targetPath }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create folder.");
      setNewFolderName("");
      setStatus({ type: "success", message: `Folder "${cleanName}" created.` });
      await fetchRepoContents(currentPath, owner, repo, branch);
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Something went wrong." });
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Upload queue                                                     */
  /* ---------------------------------------------------------------- */

  const addFiles = (incoming: FileList | File[] | null | undefined) => {
    if (!incoming) return;
    const nextFiles = Array.from(incoming);
    setQueue((current) => {
      const existingIds = new Set(current.map((q) => q.id));
      const newEntries: QueuedFile[] = nextFiles
        .filter((f) => !existingIds.has(makeFileId(f)))
        .map((f) => ({ id: makeFileId(f), file: f, displayName: f.name, status: "pending" as const }));
      return [...current, ...newEntries];
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const removeFromQueue = (id: string) => {
    setQueue((current) => current.filter((q) => q.id !== id));
    if (previewFile?.id === id) {
      setPreviewFile(null);
      setPreviewContent(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    }
  };

  const renameInQueue = (id: string, newName: string) => {
    setQueue((current) => current.map((q) => (q.id === id ? { ...q, displayName: newName } : q)));
  };

  /* ---------------------------------------------------------------- */
  /*  Upload preview                                                   */
  /* ---------------------------------------------------------------- */

  const openPreview = async (queued: QueuedFile) => {
    if (previewFile?.id === queued.id) {
      setPreviewFile(null);
      setPreviewContent(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
      return;
    }
    setPreviewFile(queued);
    setPreviewContent(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);

    if (isTextFile(queued.file.name)) {
      try {
        const text = await queued.file.text();
        setPreviewContent(text.length > 5000 ? text.slice(0, 5000) + "\n\n… (truncated)" : text);
      } catch {
        setPreviewContent("Could not read file.");
      }
    } else if (isImageFile(queued.file.name)) {
      setPreviewUrl(URL.createObjectURL(queued.file));
    }
  };

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  /* ---------------------------------------------------------------- */
  /*  Upload with per-file progress                                    */
  /* ---------------------------------------------------------------- */

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const pendingFiles = queue.filter((q) => q.status === "pending");
    if (pendingFiles.length === 0) { setStatus({ type: "error", message: "No files to upload." }); return; }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;
    const userMessage = commitMessage.trim();

    for (const queued of pendingFiles) {
      setQueue((c) => c.map((q) => (q.id === queued.id ? { ...q, status: "uploading" as const } : q)));
      try {
        const formData = new FormData();
        formData.append("owner", owner);
        formData.append("repo", repo);
        formData.append("branch", branch);
        formData.append("folder", currentPath);
        formData.append("file", queued.file);
        if (queued.displayName !== queued.file.name) formData.append("fileName", queued.displayName);
        const message = userMessage || (pendingFiles.length === 1
          ? `Upload ${queued.displayName}`
          : `Upload ${queued.displayName} (${successCount + failCount + 1}/${pendingFiles.length})`);
        formData.append("commitMessage", message);

        const response = await fetch("/api/upload-single", { method: "POST", body: formData });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Upload failed.");

        setQueue((c) => c.map((q) => (q.id === queued.id ? { ...q, status: "done" as const } : q)));
        successCount++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Upload failed.";
        setQueue((c) => c.map((q) => (q.id === queued.id ? { ...q, status: "error" as const, error: errorMsg } : q)));
        failCount++;
      }
    }

    setUploading(false);
    setCommitMessage("");

    if (failCount === 0) {
      setStatus({ type: "success", message: `${successCount} file(s) uploaded.` });
      setQueue((c) => c.filter((q) => q.status !== "done"));
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      setStatus({ type: "error", message: `${successCount} uploaded, ${failCount} failed.` });
    }
    await fetchRepoContents(currentPath, owner, repo, branch);
  };

  /* ---------------------------------------------------------------- */
  /*  Code editor / viewer                                             */
  /* ---------------------------------------------------------------- */

  const openNewFile = (templateKey: string) => {
    const template = TEMPLATES[templateKey] || TEMPLATES.empty;
    setEditorContent(template.content);
    setEditorFileName(`untitled${template.extension}`);
    setEditorFilePath(null);
    setEditorFileSha(null);
    setViewMode("editor");
  };

  const openFileForViewing = async (item: RepoItem) => {
    const isText = isTextFile(item.name);
    const isMedia = isSupportedMediaFile(item.name);

    if (!isText && !isMedia) {
      // Completely unsupported binary files: open in new tab
      const url = item.download_url || item.html_url || "";
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    setEditorLoading(true);
    setViewMode("viewer");
    setEditorFileName(item.name);
    setEditorFilePath(item.path);
    setEditorContent("");
    setEditorFileSha(null);
    setEditorFileUrl(null);

    if (isMedia) {
      if (isPdfFile(item.name) && item.download_url) {
        try {
          const res = await fetch(item.download_url);
          const blob = await res.blob();
          const pdfBlob = new Blob([blob], { type: "application/pdf" });
          setEditorFileUrl(URL.createObjectURL(pdfBlob));
        } catch (e) {
          console.error("Failed to load PDF blob", e);
          setEditorFileUrl(item.download_url);
        }
      } else {
        setEditorFileUrl(item.download_url || null);
      }
      setEditorLoading(false);
      return;
    }

    setEditorFileUrl(item.download_url || null);

    try {
      const params = new URLSearchParams({ owner, repo, branch, path: item.path });
      const response = await fetch(`/api/file?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to fetch file.");

      setEditorContent(payload.content);
      setEditorFileSha(payload.sha);
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Failed to load file." });
      setViewMode("browse");
    } finally {
      setEditorLoading(false);
    }
  };

  const switchToEditor = () => {
    setViewMode("editor");
    // Focus textarea after React renders
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  const closeEditor = () => {
    setViewMode("browse");
    setEditorContent("");
    setEditorFileName("");
    setEditorFilePath(null);
    setEditorFileSha(null);
    if (editorFileUrl && editorFileUrl.startsWith("blob:")) {
      URL.revokeObjectURL(editorFileUrl);
    }
    setEditorFileUrl(null);
  };

  const saveFile = async () => {
    const name = editorFileName.trim();
    if (!name) { setStatus({ type: "error", message: "Enter a file name." }); return; }

    setEditorSaving(true);
    const filePath = editorFilePath || (currentPath ? `${currentPath}/${name}` : name);

    try {
      const response = await fetch("/api/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner, repo, branch,
          path: filePath,
          content: editorContent,
          message: commitMessage.trim() || (editorFileSha ? `Update ${name}` : `Create ${name}`),
          sha: editorFileSha || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to save.");

      setEditorFileSha(payload.sha);
      setEditorFilePath(payload.path || filePath);
      setCommitMessage("");
      setStatus({ type: "success", message: `${editorFileSha ? "Updated" : "Created"} ${name}.` });
      setViewMode("viewer");
      await fetchRepoContents(currentPath, owner, repo, branch);
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Save failed." });
    } finally {
      setEditorSaving(false);
    }
  };

  // Tab key support in editor
  const handleEditorKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newContent = editorContent.slice(0, start) + "    " + editorContent.slice(end);
      setEditorContent(newContent);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      });
    }
    // Ctrl+S to save
    if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveFile();
    }
  };
  // Syntax-highlighted HTML for viewer
  const highlightedHtml = useMemo(() => {
    if (viewMode !== "viewer" || !editorContent) return "";
    return highlightCode(editorContent, editorFileName);
  }, [viewMode, editorContent, editorFileName]);

  /* ---------------------------------------------------------------- */
  /*  Run Code (Piston API & Pyodide)                                  */
  /* ---------------------------------------------------------------- */
  const handleRunCode = async () => {
    const ext = getExtension(editorFileName);
    let language = "";
    if (ext === ".py") language = "python";
    else if (ext === ".cpp" || ext === ".cxx" || ext === ".cc") language = "c++";
    else if (ext === ".c") language = "c";

    if (!language) {
      setStatus({ type: "error", message: "Only Python, C++, and C can be executed." });
      return;
    }

    setExecuting(true);
    setExecOutput(null);
    setStatus({ type: "loading", message: "Executing code..." });

    try {
      if (language === "python") {
        setStatus({ type: "loading", message: "Starting Data Science Kernel..." });
        
        (window as any).pyodideStdout = "";
        (window as any).pyodideStderr = "";
        
        if (!(window as any).pyodide) {
          if (!document.getElementById("pyodide-script")) {
            const script = document.createElement("script");
            script.id = "pyodide-script";
            script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js";
            document.head.appendChild(script);
            await new Promise((resolve) => script.onload = resolve);
          }
          (window as any).pyodide = await (window as any).loadPyodide({
            stdout: (msg: string) => { (window as any).pyodideStdout += msg + "\n"; },
            stderr: (msg: string) => { (window as any).pyodideStderr += msg + "\n"; },
          });
          await (window as any).pyodide.loadPackage(["micropip"]);
          const micropip = (window as any).pyodide.pyimport("micropip");
          setStatus({ type: "loading", message: "Installing pandas, numpy & matplotlib..." });
          await micropip.install(["pandas", "numpy", "matplotlib"]);
          
          await (window as any).pyodide.runPythonAsync(`
import matplotlib.pyplot as plt
# Disable plt.show() so it doesn't block execution or try to render natively
plt.show = lambda *args, **kwargs: None
`);
        }
        
        const pyodide = (window as any).pyodide;
        
        setStatus({ type: "loading", message: "Mounting workspace data..." });
        const itemsResponse = await fetch(`/api/repo?owner=${owner}&repo=${repo}&branch=${branch}&path=${currentPath}`);
        if (itemsResponse.ok) {
          const items: RepoItem[] = await itemsResponse.json();
          for (const item of items) {
            if (item.type === "file" && item.download_url) {
              try {
                const res = await fetch(item.download_url);
                const buffer = await res.arrayBuffer();
                pyodide.FS.writeFile(item.name, new Uint8Array(buffer));
              } catch (e) {
                console.warn("Failed to mount file", item.name);
              }
            }
          }
        }

        setStatus({ type: "loading", message: "Running script..." });
        
        try {
          await pyodide.runPythonAsync(editorContent);
          
          // Capture plots
          const plotData = await pyodide.runPythonAsync(`
import sys
if 'matplotlib.pyplot' in sys.modules:
    import matplotlib.pyplot as plt
    import io, base64
    _plots = []
    for fig_num in plt.get_fignums():
        fig = plt.figure(fig_num)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        buf.seek(0)
        img_str = base64.b64encode(buf.read()).decode('utf-8')
        _plots.append("data:image/png;base64," + img_str)
    plt.close('all')
    _plots
else:
    []
`);
          const plots = plotData.toJs();
          setExecPlots(plots || []);

          setExecOutput({ stdout: (window as any).pyodideStdout, stderr: (window as any).pyodideStderr, code: 0 });
          setStatus({ type: "success", message: "Execution complete." });
        } catch (e: any) {
          setExecPlots([]);
          setExecOutput({ stdout: (window as any).pyodideStdout, stderr: (window as any).pyodideStderr + "\n" + e.toString(), code: 1 });
          setStatus({ type: "error", message: "Execution failed." });
        }
        return;
      }

      // Standard API for C/C++
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          code: editorContent,
          stdin: execStdin,
          args: execArgs,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Execution failed.");

      setExecOutput(data);
      setStatus({ type: "success", message: "Execution complete." });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Execution failed." });
    } finally {
      setExecuting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Python REPL & Notebook Execution                                 */
  /* ---------------------------------------------------------------- */
  const handleReplSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!replInput.trim() || !(window as any).pyodide) return;
    
    setExecuting(true);
    const cmd = replInput;
    setReplInput("");
    
    if (xtermInstance.current) {
      xtermInstance.current.write(`\x1b[33m>>> ${cmd}\x1b[0m\r\n`);
    }
    
    (window as any).pyodideStdout = "";
    (window as any).pyodideStderr = "";
    
    try {
      const pyodide = (window as any).pyodide;
      await pyodide.runPythonAsync(cmd);
      if (xtermInstance.current) {
        if ((window as any).pyodideStdout) xtermInstance.current.write((window as any).pyodideStdout.replace(/\n/g, '\r\n') + '\r\n');
        if ((window as any).pyodideStderr) xtermInstance.current.write('\x1b[31m' + (window as any).pyodideStderr.replace(/\n/g, '\r\n') + '\x1b[0m\r\n');
      }
    } catch (err: any) {
      if (xtermInstance.current) {
        xtermInstance.current.write('\x1b[31m' + err.toString().replace(/\n/g, '\r\n') + '\x1b[0m\r\n');
      }
    } finally {
      setExecuting(false);
    }
  };

  const handleRunNotebook = async () => {
    if (!(window as any).pyodide) {
      setStatus({ type: "error", message: "Data Science Kernel is still initializing. Please wait." });
      return;
    }
    
    setExecuting(true);
    setStatus({ type: "loading", message: "Running notebook cells..." });
    
    try {
      const notebook = JSON.parse(editorContent);
      const pyodide = (window as any).pyodide;
      
      for (let i = 0; i < notebook.cells.length; i++) {
        const cell = notebook.cells[i];
        if (cell.cell_type === "code") {
          const code = Array.isArray(cell.source) ? cell.source.join("") : cell.source;
          (window as any).pyodideStdout = "";
          (window as any).pyodideStderr = "";
          
          try {
            const result = await pyodide.runPythonAsync(code);
            cell.outputs = [];
            if ((window as any).pyodideStdout) {
              cell.outputs.push({
                output_type: "stream",
                name: "stdout",
                text: (window as any).pyodideStdout.split('\n').map((l: string, idx: number, arr: string[]) => l + (idx === arr.length - 1 ? '' : '\n')).filter((s: string) => s)
              });
            }
            if (result !== undefined) {
              let resStr = String(result);
              if (result && result.toString && typeof result.toString === 'function') {
                resStr = result.toString();
              }
              cell.outputs.push({
                output_type: "execute_result",
                data: {
                  "text/plain": [resStr]
                },
                execution_count: i + 1
              });
            }
            
            const plotData = await pyodide.runPythonAsync(`
import sys
if 'matplotlib.pyplot' in sys.modules:
    import matplotlib.pyplot as plt
    import io, base64
    _plots = []
    for fig_num in plt.get_fignums():
        fig = plt.figure(fig_num)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        buf.seek(0)
        img_str = base64.b64encode(buf.read()).decode('utf-8')
        _plots.append(img_str)
    plt.close('all')
    _plots
else:
    []
`);
            const plots = plotData.toJs();
            if (plots && plots.length > 0) {
               for (const p of plots) {
                  cell.outputs.push({
                     output_type: "display_data",
                     data: {
                        "image/png": p
                     }
                  });
               }
            }
          } catch (err: any) {
            cell.outputs = [{
              output_type: "error",
              ename: "Error",
              evalue: err.toString(),
              traceback: err.toString().split('\n')
            }];
          }
        }
      }
      
      setEditorContent(JSON.stringify(notebook, null, 2));
      setStatus({ type: "success", message: "Notebook executed successfully. (Press Ctrl+S to save outputs)" });
    } catch (e: any) {
      setStatus({ type: "error", message: "Notebook execution failed: " + e.message });
    } finally {
      setExecuting(false);
    }
  };

  // Upload state---------------------------------------------------------------- */
  /*  Computed values & Render Helpers                                  */
  /* ---------------------------------------------------------------- */

  const renderNotebook = (content: string) => {
    try {
      const nb = JSON.parse(content);
      return (
        <div className="flex flex-col gap-6">
          {nb.cells.map((cell: any, i: number) => {
            const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source;
            if (cell.cell_type === "markdown") {
              return (
                <div key={i} className="prose prose-invert max-w-none text-slate-300">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{source}</ReactMarkdown>
                </div>
              );
            } else if (cell.cell_type === "code") {
              const html = Prism.languages.python ? Prism.highlight(source, Prism.languages.python, "python") : source;
              return (
                <div key={i} className="rounded-xl border border-slate-800 bg-[#111] p-4">
                  <pre className="font-mono text-sm leading-relaxed text-[#c5c8c6]">
                    <code className="language-python" dangerouslySetInnerHTML={{ __html: html }} />
                  </pre>
                  {cell.outputs && cell.outputs.length > 0 && (
                    <div className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-400 flex flex-col gap-2">
                      {cell.outputs.map((out: any, j: number) => {
                        if (out.output_type === "stream") {
                          const outText = Array.isArray(out.text) ? out.text.join("") : out.text;
                          return outText ? <pre key={j} className="whitespace-pre-wrap">{outText}</pre> : null;
                        } else if (out.output_type === "execute_result" || out.output_type === "display_data") {
                          const data = out.data || {};
                          if (data["image/png"]) {
                            const src = data["image/png"].startsWith("data:") ? data["image/png"] : `data:image/png;base64,${data["image/png"]}`;
                            return <img key={j} src={src} className="max-w-full bg-white p-2 rounded" alt="output" />;
                          } else if (data["text/html"]) {
                            const html = Array.isArray(data["text/html"]) ? data["text/html"].join("") : data["text/html"];
                            return <div key={j} dangerouslySetInnerHTML={{ __html: html }} className="bg-white p-2 text-black" />;
                          } else if (data["text/plain"]) {
                            const text = Array.isArray(data["text/plain"]) ? data["text/plain"].join("") : data["text/plain"];
                            return <pre key={j} className="whitespace-pre-wrap text-emerald-400">{text}</pre>;
                          }
                        } else if (out.output_type === "error") {
                          const errText = Array.isArray(out.traceback) ? out.traceback.join("\n") : (out.evalue || "");
                          return <pre key={j} className="whitespace-pre-wrap text-red-400">{errText}</pre>;
                        }
                        return null;
                      })}
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })}
        </div>
      );
    } catch {
      return <div className="text-red-400">Failed to parse Jupyter notebook JSON. Check for syntax errors.</div>;
    }
  };

  const sortedItems = [...items].sort(
    (a, b) => Number(b.type === "dir") - Number(a.type === "dir") || a.name.localeCompare(b.name),
  );
  const pendingCount = queue.filter((q) => q.status === "pending").length;
  const totalSize = queue.reduce((sum, q) => sum + q.file.size, 0);

  const showTerminal = Boolean(
    (execOutput || [".py", ".cpp", ".cxx", ".cc", ".c"].includes(getExtension(editorFileName))) 
    && editorFileName
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  
  if (!mounted) {
    return (
      <main className="flex h-screen w-full bg-[#0d1117] text-[#c9d1d9] overflow-hidden selection:bg-[rgba(56,139,253,0.3)]">
        <div className="flex h-full w-full items-center justify-center">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen w-full bg-[#0d1117] text-[#c9d1d9] overflow-hidden selection:bg-[rgba(56,139,253,0.3)]">
      {/* Command Palette */}
      {openCmdk && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[10vh] backdrop-blur-sm" onClick={() => setOpenCmdk(false)}>
          <div className="w-full max-w-xl overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22] shadow-2xl" onClick={e => e.stopPropagation()}>
            <Command className="w-full" onKeyDown={(e) => { if (e.key === "Escape") setOpenCmdk(false) }}>
              <Command.Input autoFocus placeholder="Type a command or search... (e.g. Create Folder)" className="w-full border-b border-[#30363d] bg-transparent px-4 py-4 text-sm text-white outline-none placeholder:text-slate-500" />
              <Command.List className="max-h-[300px] overflow-auto p-2">
                <Command.Empty className="p-4 text-center text-sm text-slate-500">No results found.</Command.Empty>
                <Command.Group heading="Actions" className="text-xs font-semibold text-slate-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2">
                  <Command.Item onSelect={() => { setOpenCmdk(false); handleCreateFolder(); }} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-sm text-slate-200 hover:bg-violet-600 hover:text-white aria-selected:bg-violet-600 aria-selected:text-white transition-colors">
                    <Folder className="h-4 w-4" /> Create Folder...
                  </Command.Item>
                  <Command.Item onSelect={() => { setOpenCmdk(false); openNewFile("C++"); }} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-sm text-slate-200 hover:bg-violet-600 hover:text-white aria-selected:bg-violet-600 aria-selected:text-white transition-colors">
                    <FileCode2 className="h-4 w-4" /> Create C++ File
                  </Command.Item>
                  <Command.Item onSelect={() => { setOpenCmdk(false); openNewFile("Python"); }} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-sm text-slate-200 hover:bg-violet-600 hover:text-white aria-selected:bg-violet-600 aria-selected:text-white transition-colors">
                    <FileType2 className="h-4 w-4" /> Create Python File
                  </Command.Item>
                  <Command.Item onSelect={() => { setOpenCmdk(false); saveFile(); }} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-sm text-slate-200 hover:bg-violet-600 hover:text-white aria-selected:bg-violet-600 aria-selected:text-white transition-colors">
                    <Save className="h-4 w-4" /> Save Current File
                  </Command.Item>
                  <Command.Item onSelect={() => { setOpenCmdk(false); handleRunCode(); }} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-sm text-slate-200 hover:bg-violet-600 hover:text-white aria-selected:bg-violet-600 aria-selected:text-white transition-colors">
                    <Play className="h-4 w-4" /> Run Current File
                  </Command.Item>
                  <Command.Item onSelect={() => { setOpenCmdk(false); window.location.href = "/"; }} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-sm text-red-400 hover:bg-red-600 hover:text-white aria-selected:bg-red-600 aria-selected:text-white transition-colors">
                    <LogOut className="h-4 w-4" /> Logout
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </div>
        </div>
      )}

      <PanelGroup orientation="horizontal" id="main-layout-v4" className="h-full w-full">
        {/* ---- Sidebar (File Explorer) ---- */}
        <Panel defaultSize="20%" minSize="15%" maxSize="40%">
          <div className="flex flex-col h-full w-full bg-[#161b22] min-w-0 overflow-hidden">
        {/* Workspace Header */}
        <div className="flex items-center justify-between border-b border-[#30363d] p-4 bg-[#161b22]">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span className="font-semibold text-white truncate bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-indigo-400">{repo || "Workspace"}</span>
          </div>
          <button type="button" onClick={() => window.location.href = "/"} className="text-slate-400 hover:text-red-400 transition hover:scale-110" title="Logout">
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Explorer Toolbar */}
        <div className="flex items-center justify-between p-3 border-b border-[#30363d] bg-[#0d1117]/50">
          <div className="flex gap-1 flex-1">
            <input type="text" value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); }}
              placeholder="Folder..."
              className="w-full min-w-0 rounded border border-[#30363d] bg-[#0d1117] px-2 py-1 text-xs outline-none transition focus:border-violet-500" />
            <button type="button" onClick={handleCreateFolder} disabled={!newFolderName.trim()}
              className="shrink-0 rounded bg-[#21262d] px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-[#30363d] hover:text-white hover:shadow-[0_0_10px_rgba(139,92,246,0.3)] disabled:opacity-40">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="relative group ml-2">
            <button type="button" className="shrink-0 rounded bg-[#21262d] px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-[#30363d] hover:text-white flex items-center gap-1 hover:shadow-[0_0_10px_rgba(139,92,246,0.3)]">
              <Plus className="h-3 w-3" /> File
            </button>
            <div className="absolute left-0 top-full z-10 mt-1 hidden min-w-[120px] rounded border border-[#30363d] bg-[#161b22] py-1 shadow-xl group-hover:block">
              {Object.entries(TEMPLATES).map(([key, t]) => (
                <button key={key} type="button" onClick={() => openNewFile(key)}
                  className="block w-full px-3 py-1.5 text-left text-xs text-slate-300 transition hover:bg-[#30363d] hover:text-white">
                  {t.label}{t.extension && ` (${t.extension})`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* File Browser List */}
        <div className="flex-1 overflow-auto py-2">
          {/* Breadcrumb back button */}
          {breadcrumb.length > 0 && (
            <button type="button" onClick={() => navigateTo(breadcrumb.slice(0, -1).join("/"))}
              className="flex w-full items-center gap-2 px-4 py-1.5 text-sm text-slate-400 hover:bg-[#21262d] hover:text-slate-200">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
              ..
            </button>
          )}

          {loading ? (
            <div className="px-4 py-2 text-xs text-slate-500">Loading...</div>
          ) : sortedItems.length === 0 ? (
            <div className="px-4 py-2 text-xs text-slate-500 italic">Empty folder</div>
          ) : (
            sortedItems.map((item) => (
              <div key={item.path} className={`group flex items-center justify-between px-3 py-1.5 text-sm transition-all duration-200 cursor-pointer ${item.path === editorFilePath ? 'bg-[#21262d] text-white border-l-2 border-violet-500 shadow-[inset_20px_0_20px_-20px_rgba(139,92,246,0.3)]' : 'text-[#c9d1d9] border-l-2 border-transparent hover:bg-[#21262d] hover:text-white'}`}
                   onClick={() => item.type === "dir" ? navigateTo(item.path) : openFileForViewing(item)}>
                <div className="flex flex-1 items-center gap-2 truncate text-left transition-transform duration-200 group-hover:translate-x-1">
                  <span className="shrink-0">{getFileIcon(item.name, item.type as "file" | "dir")}</span>
                  <span className="truncate">{item.name}</span>
                </div>
                {item.type === "file" && item.download_url && (
                  <a href={item.download_url} download={item.name} onClick={(e) => e.stopPropagation()} className="shrink-0 text-slate-500 hover:text-violet-400 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </a>
                )}
              </div>
            ))
          )}
        </div>

        {/* Upload Zone */}
        <div className="border-t border-[#30363d] p-3 text-xs bg-[#161b22]">
          <form onSubmit={handleUpload}>
            <div onClick={() => fileInputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} className={`flex cursor-pointer flex-col items-center justify-center rounded border border-dashed p-3 text-center transition ${dragging ? 'border-violet-500 bg-[#21262d]' : 'border-[#484f58] hover:border-violet-400 hover:bg-[#21262d]'}`}>
              <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
              <span className="mb-1 text-slate-400 whitespace-nowrap">Drop files or click</span>
            </div>
            {queue.length > 0 && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span>{queue.length} file(s) ({formatBytes(totalSize)})</span>
                  <button type="button" onClick={() => setQueue([])} className="hover:text-white">✕</button>
                </div>
                <input type="text" value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="Commit msg..." className="w-full rounded border border-[#30363d] bg-[#0d1117] px-2 py-1 outline-none focus:border-violet-500 text-white" />
                <button type="submit" disabled={uploading || pendingCount === 0} className="w-full rounded bg-gradient-to-r from-violet-600 to-indigo-600 py-1.5 font-medium text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(139,92,246,0.4)] disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none">
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            )}
          </form>
        </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-[#30363d] hover:bg-violet-500 transition-colors cursor-col-resize outline-none focus-visible:ring-1 focus-visible:ring-violet-500" />

        {/* ---- Main Editor Area ---- */}
        <Panel defaultSize="80%">
          <div className="flex flex-col h-full w-full relative overflow-hidden bg-[#0d1117] min-w-0">
        {/* Top Breadcrumb & Actions Bar */}
        <div className="flex items-center justify-between border-b border-[#30363d] bg-[#0d1117]/80 backdrop-blur-md px-4 py-2 shrink-0 h-[53px] z-10">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>{repo}</span>
            {breadcrumb.map((seg) => (
              <span key={seg} className="flex items-center gap-2">
                <span>/</span><span>{seg}</span>
              </span>
            ))}
            {editorFileName && (
              <span className="flex items-center gap-2">
                <span>/</span>
                <span className="text-white font-medium">
                  {viewMode === "editor" && !editorFilePath ? (
                    <input type="text" value={editorFileName} onChange={(e) => setEditorFileName(e.target.value)} className="bg-transparent border-b border-violet-500 outline-none w-32" />
                  ) : (
                    editorFileName
                  )}
                </span>
                {editorFileSha === null && <span className="text-emerald-400 text-xs px-1 border border-emerald-400/30 rounded">New</span>}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {status.message && (
              <span className={`text-xs px-2 py-1 rounded ${status.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                {status.message}
              </span>
            )}
            {editorFileName && (
              <>
                <button type="button" onClick={closeEditor} className="rounded bg-[#21262d] px-3 py-1.5 text-xs font-medium transition hover:bg-[#30363d]">
                  Close
                </button>
                {viewMode === "viewer" ? (
                  <button type="button" onClick={switchToEditor} className="rounded bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                    Edit File
                  </button>
                ) : (
                  <button type="button" onClick={saveFile} disabled={editorSaving || !editorFileName.trim()} className="rounded flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-1.5 text-xs font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none">
                    <Save className="h-3.5 w-3.5" />
                    {editorSaving ? "Saving..." : "Save File"}
                  </button>
                )}
                {getExtension(editorFileName) === ".ipynb" && viewMode === "viewer" && (
                  <button type="button" onClick={handleRunNotebook} disabled={executing} className="rounded flex items-center gap-1.5 bg-gradient-to-r from-orange-600 to-red-600 px-4 py-1.5 text-xs font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(234,88,12,0.4)] disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none">
                    <Play className="h-3.5 w-3.5 fill-current" />
                    {executing ? "Running..." : "Run Notebook"}
                  </button>
                )}
                {[".py", ".cpp", ".cxx", ".cc", ".c"].includes(getExtension(editorFileName)) && (
                  <button type="button" onClick={handleRunCode} disabled={executing} className="rounded flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(37,99,235,0.4)] disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none">
                    <Play className="h-3.5 w-3.5 fill-current" />
                    {executing ? "Running..." : "Run"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <PanelGroup orientation="vertical" id="editor-layout-v5" className="flex-1 min-h-0 w-full">
          {/* Content Area */}
          <Panel>
            <div className="h-full w-full">
              <div className="flex flex-col h-full w-full min-h-0 relative bg-[#0d1117]">
                {!editorFileName ? (
                  <div className="flex h-full flex-col items-center justify-center text-slate-500">
                    <svg className="h-16 w-16 mb-4 text-[#30363d]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                      <polyline points="13 2 13 9 20 9"></polyline>
                    </svg>
                    <h2 className="text-xl font-medium text-slate-300">No file selected</h2>
                    <p className="mt-2 text-sm text-slate-400">Select a file from the explorer or create a new one.</p>
                  </div>
                ) : viewMode === "editor" ? (
                  <div className="flex flex-1 flex-col overflow-hidden">
                    {([".md", ".ipynb"].includes(getExtension(editorFileName))) && (
                      <div className="flex border-b border-[#30363d] px-4 pt-2 bg-[#0d1117] shrink-0">
                        <button type="button" onClick={() => setEditorTab("code")} className={`border-b-2 px-4 py-2 text-sm font-medium transition ${editorTab === "code" ? "border-violet-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}>Code</button>
                        <button type="button" onClick={() => setEditorTab("preview")} className={`border-b-2 px-4 py-2 text-sm font-medium transition ${editorTab === "preview" ? "border-violet-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}>Preview</button>
                      </div>
                    )}
                    
                    <div className="flex-1 overflow-auto bg-[#1e1e1e]">
                      {editorTab === "code" || ![".md", ".ipynb"].includes(getExtension(editorFileName)) ? (
                        <Editor
                          height="100%"
                          language={getMonacoLanguage(editorFileName)}
                          theme="vs-dark"
                          value={editorContent}
                          onChange={(value) => setEditorContent(value || "")}
                          options={{ minimap: { enabled: false }, fontSize: 14, wordWrap: "on", padding: { top: 16 } }}
                        />
                      ) : getExtension(editorFileName) === ".md" ? (
                        <div className="prose prose-invert max-w-4xl mx-auto p-8 text-slate-300">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{editorContent}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="p-8 max-w-5xl mx-auto">
                          {renderNotebook(editorContent)}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-auto bg-[#0d1117] flex items-center justify-center">
                    {isImageFile(editorFileName) ? (
                      <div className="flex h-full items-center justify-center p-6"><img src={editorFileUrl || undefined} alt={editorFileName} className="max-w-full max-h-full object-contain shadow-xl rounded" /></div>
                    ) : isVideoFile(editorFileName) ? (
                      <div className="flex h-full items-center justify-center p-6"><video src={editorFileUrl || undefined} controls className="max-w-full max-h-full shadow-xl rounded" /></div>
                    ) : isAudioFile(editorFileName) ? (
                      <div className="flex h-full items-center justify-center p-6"><audio src={editorFileUrl || undefined} controls className="w-96 shadow-xl" /></div>
                    ) : isPdfFile(editorFileName) ? (
                      <iframe src={editorFileUrl || undefined} className="w-full h-full border-none rounded bg-white" />
                    ) : getExtension(editorFileName) === ".csv" ? (
                      <div className="w-full h-full self-start"><CsvViewer content={editorContent} /></div>
                    ) : getExtension(editorFileName) === ".json" ? (
                      <div className="w-full h-full self-start"><JsonViewer content={editorContent} /></div>
                    ) : getExtension(editorFileName) === ".md" ? (
                      <div className="prose prose-invert max-w-4xl mx-auto text-slate-300 w-full self-start p-6">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{editorContent}</ReactMarkdown>
                      </div>
                    ) : getExtension(editorFileName) === ".ipynb" ? (
                      <div className="max-w-5xl mx-auto w-full self-start p-6">
                        {renderNotebook(editorContent)}
                      </div>
                    ) : (
                      <pre className="font-mono text-sm leading-relaxed max-w-5xl mx-auto w-full self-start p-6">
                        <code className={`language-${getLanguage(editorFileName) || "none"}`} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Panel>

          {/* ---- Terminal / Output Panel ---- */}
          {showTerminal ? (
            <PanelResizeHandle className="h-1 bg-[#30363d] hover:bg-violet-500 transition-colors cursor-row-resize z-30 outline-none focus-visible:ring-1 focus-visible:ring-violet-500" />
          ) : null}
          
          {showTerminal ? (
            <Panel defaultSize="30%" minSize="15%" maxSize="70%">
              <div className="flex flex-col h-full w-full bg-[#0d1117]/80 backdrop-blur-xl shrink-0 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] z-20">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-1.5 bg-[#161b22]/90">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Terminal className="h-4 w-4" />
                  <span className={!execOutput ? 'text-violet-400' : ''}>Terminal</span>
                </div>
                <button type="button" onClick={() => setExecOutput(null)} className="text-slate-500 hover:text-white transition">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 flex overflow-hidden">
                <div className="w-1/3 flex flex-col border-r border-[#30363d] p-3 gap-3">
                  <div className="flex flex-col flex-1">
                    <span className="text-xs text-slate-500 mb-1 uppercase font-semibold">Standard Input</span>
                    <textarea value={execStdin} onChange={(e) => setExecStdin(e.target.value)} placeholder="Enter input here..." className="flex-1 resize-none rounded bg-[#161b22]/50 border border-[#30363d] p-2 text-sm font-mono text-slate-300 outline-none focus:border-violet-500 transition-colors" />
                  </div>
                  {([".cpp", ".cxx", ".cc", ".c"].includes(getExtension(editorFileName))) && (
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500 mb-1 uppercase font-semibold">Command Line Args</span>
                      <input type="text" value={execArgs} onChange={(e) => setExecArgs(e.target.value)} placeholder="e.g. arg1 arg2" className="rounded bg-[#161b22]/50 border border-[#30363d] p-2 text-sm font-mono text-slate-300 outline-none focus:border-violet-500 transition-colors" />
                    </div>
                  )}
                </div>
                  <div className="flex-1 overflow-auto p-3 font-mono text-sm bg-black/40 relative flex flex-col">
                    {executing ? (
                      <div className="flex items-center gap-2 text-blue-400 animate-pulse absolute top-3 left-3 z-10">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Running code...
                      </div>
                    ) : !execOutput && (
                      <span className="text-slate-600 italic absolute top-3 left-3 z-10">Click Run to execute. Output will appear here.</span>
                    )}
                    <div ref={xtermRef} className={`w-full ${execPlots.length > 0 ? 'h-1/2' : 'h-full shrink-0'}`} style={{ minHeight: '150px' }} />
                    {execPlots.length > 0 && (
                      <div className="h-1/2 mt-4 pt-4 border-t border-[#30363d] overflow-auto flex flex-col gap-4">
                        {execPlots.map((plotSrc, idx) => (
                          <div key={idx} className="group relative bg-white p-2 rounded w-max mx-auto shadow-xl">
                            <a href={plotSrc} download={`plot-${idx + 1}.png`} className="absolute top-2 right-2 bg-black/60 p-1.5 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-violet-600" title="Download Plot">
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            </a>
                            <img src={plotSrc} alt={`Plot ${idx + 1}`} className="max-w-full" />
                          </div>
                        ))}
                      </div>
                    )}
                    {getExtension(editorFileName) === ".py" && (
                      <form onSubmit={handleReplSubmit} className="mt-2 shrink-0 relative">
                        <span className="absolute left-2 top-1.5 text-yellow-500 font-bold">{'>>>'}</span>
                        <input type="text" value={replInput} onChange={(e) => setReplInput(e.target.value)} placeholder="Type Python command and press Enter (Interactive REPL)" className="w-full bg-[#161b22] border border-[#30363d] rounded py-1.5 pl-10 pr-2 text-sm text-slate-300 font-mono focus:border-violet-500 outline-none" />
                      </form>
                    )}
                  </div>
                </div>
              </div>
              </div>
            </Panel>
          ) : null}
        </PanelGroup>
          </div>
      </Panel>
    </PanelGroup>
  </main>
  );
}
