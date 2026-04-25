import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ContextBundleResult, CreateBundleInput } from "@shared/types";
import { GitService } from "./git-service";
import { normalizeRelPath, resolveInsideRoot } from "./path-guard";

const MAX_CONTEXT_FILE_CHARS = 40_000;

function fenceForPath(relPath: string): string {
  const ext = relPath.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "ts",
    tsx: "tsx",
    js: "js",
    jsx: "jsx",
    json: "json",
    md: "md",
    css: "css",
    html: "html",
    py: "py",
    rs: "rust",
    go: "go",
    sh: "sh",
    yaml: "yaml",
    yml: "yaml",
  };
  return map[ext ?? ""] ?? "";
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function safeReadText(
  rootPath: string,
  relPathInput: string,
): Promise<{ text: string; truncated: boolean } | null> {
  const relPath = normalizeRelPath(relPathInput);
  const abs = await resolveInsideRoot(rootPath, relPath);
  const stats = await stat(abs);
  if (stats.size > 2 * 1024 * 1024) {
    return {
      text: `[File omitted: ${(stats.size / 1024 / 1024).toFixed(1)} MB exceeds context limit]`,
      truncated: false,
    };
  }
  const buffer = await readFile(abs);
  if (buffer.includes(0)) return null;
  const raw = buffer.toString("utf8");
  if (raw.length > MAX_CONTEXT_FILE_CHARS) {
    return {
      text:
        raw.slice(0, MAX_CONTEXT_FILE_CHARS) +
        "\n\n[Truncated for context budget]",
      truncated: true,
    };
  }
  return { text: raw, truncated: false };
}

export class ContextService {
  static async createBundle(
    input: CreateBundleInput,
  ): Promise<ContextBundleResult> {
    const id = new Date().toISOString().replace(/[:.]/g, "-");
    const lines: string[] = [
      "# ForgePad Context",
      "",
      "## User Prompt",
      "",
      input.prompt.trim() || "(No prompt provided.)",
      "",
      "## Workspace",
      "",
      `- Workspace: ${input.workspaceName}`,
      `- Branch: ${input.branch || "(unknown)"}`,
      `- Root: ${input.workspacePath}`,
      "",
    ];

    if (input.tasks.length > 0) {
      lines.push("## Task Context", "");
      for (const task of input.tasks) {
        lines.push(`### ${task.title}`, "");
        lines.push(`- Status: ${task.status}`, "");
        if (task.description.trim()) {
          lines.push(task.description.trim(), "");
        } else {
          lines.push("(No task description provided.)", "");
        }
        if (task.note?.trim()) lines.push(`User note: ${task.note.trim()}`, "");
      }
    }

    if (input.files.length > 0) {
      lines.push("## Selected Files", "");
      for (const item of input.files) {
        const relPath = normalizeRelPath(item.relPath);
        lines.push(`### ${relPath}`, "");
        if (item.note?.trim()) lines.push(`User note: ${item.note.trim()}`, "");
        if (!item.includeContent) {
          lines.push("[Referenced by path only.]", "");
          continue;
        }

        const read = await safeReadText(input.workspacePath, relPath).catch(
          (error) => ({
            text: `[Could not read file: ${error instanceof Error ? error.message : String(error)}]`,
            truncated: false,
          }),
        );
        if (read === null) {
          lines.push("[Binary file referenced by path only.]", "");
          continue;
        }
        lines.push("```" + fenceForPath(relPath), read.text, "```", "");
      }
    }

    if (input.diffs.length > 0) {
      lines.push("## Selected Diffs", "");
      for (const item of input.diffs) {
        const relPath = normalizeRelPath(item.relPath);
        lines.push(`### ${relPath} (${item.bucket}, ${item.status})`, "");
        if (item.note?.trim()) lines.push(`User note: ${item.note.trim()}`, "");
        const diff = await GitService.getFileDiff(
          input.workspacePath,
          relPath,
          item.bucket,
          item.status,
        );
        if (diff.isBinary) {
          lines.push("[Binary diff omitted.]", "");
        } else if (diff.patch.trim()) {
          lines.push("```diff", diff.patch.slice(0, 80_000), "```", "");
        } else {
          lines.push("[No textual diff available.]", "");
        }
      }
    }

    if (input.comments.length > 0) {
      lines.push("## Diff Comments", "");
      for (const comment of input.comments) {
        const range =
          comment.startLine === comment.endLine
            ? `L${comment.startLine}`
            : `L${comment.startLine}-L${comment.endLine}`;
        lines.push(
          `- ${comment.relPath} ${range} ${comment.side}: ${comment.text.trim()}`,
        );
      }
      lines.push("");
    }

    const markdown = lines.join("\n");
    const contextDir = path.join(input.workspacePath, ".forgepad", "context");
    await mkdir(contextDir, { recursive: true });
    const abs = path.join(contextDir, `${id}.md`);
    await writeFile(abs, markdown, "utf8");

    return {
      id,
      path: abs,
      relPath: path.relative(input.workspacePath, abs).replaceAll("\\", "/"),
      markdown,
      estimatedTokens: estimateTokens(markdown),
      createdAt: Date.now(),
    };
  }
}
