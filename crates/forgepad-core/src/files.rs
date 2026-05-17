use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{err, CoreResult};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_status: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreview {
    pub content: String,
    pub line_count: usize,
    pub total_bytes: u64,
    pub preview_bytes: usize,
    pub truncated: bool,
}

pub fn resolve_inside_root(root: impl AsRef<Path>, rel: &str) -> CoreResult<PathBuf> {
    let root = fs::canonicalize(root).map_err(err)?;
    let rel = rel.replace('\\', "/");
    if rel.starts_with('/') || rel == ".." || rel.starts_with("../") || rel.contains("/../") {
        return Err(format!("Invalid relative path: {rel}"));
    }

    let target = root.join(rel);
    let parent = target.parent().unwrap_or(&root);
    let resolved_parent = fs::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
    let candidate = resolved_parent.join(target.file_name().unwrap_or_default());
    if candidate.starts_with(&root) {
        Ok(candidate)
    } else {
        Err("Path escapes workspace root".into())
    }
}

pub fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "mp4" => "video/mp4",
        _ => "application/octet-stream",
    }
}

pub fn read_file(worktree_path: impl AsRef<Path>, rel_path: &str) -> CoreResult<String> {
    fs::read_to_string(resolve_inside_root(worktree_path, rel_path)?).map_err(err)
}

pub fn read_file_preview(
    worktree_path: impl AsRef<Path>,
    rel_path: &str,
    max_bytes: usize,
) -> CoreResult<FilePreview> {
    let path = resolve_inside_root(worktree_path, rel_path)?;
    read_preview_path(&path, max_bytes)
}

pub fn read_abs_file(abs_path: impl AsRef<Path>) -> CoreResult<String> {
    fs::read_to_string(abs_path).map_err(err)
}

pub fn read_abs_file_preview(
    abs_path: impl AsRef<Path>,
    max_bytes: usize,
) -> CoreResult<FilePreview> {
    read_preview_path(abs_path.as_ref(), max_bytes)
}

fn read_preview_path(path: &Path, max_bytes: usize) -> CoreResult<FilePreview> {
    let total_bytes = fs::metadata(path).map_err(err)?.len();
    let mut file = fs::File::open(path).map_err(err)?;
    let mut bytes = Vec::with_capacity(max_bytes.saturating_add(1));
    file.by_ref()
        .take(max_bytes.saturating_add(1) as u64)
        .read_to_end(&mut bytes)
        .map_err(err)?;

    let truncated = bytes.len() > max_bytes || total_bytes > max_bytes as u64;
    if bytes.len() > max_bytes {
        bytes.truncate(max_bytes);
    }
    if let Err(error) = std::str::from_utf8(&bytes) {
        bytes.truncate(error.valid_up_to());
    }

    let content = String::from_utf8(bytes).map_err(err)?;
    let line_count = content
        .as_bytes()
        .iter()
        .filter(|&&byte| byte == b'\n')
        .count()
        + 1;
    Ok(FilePreview {
        line_count,
        preview_bytes: content.len(),
        content,
        total_bytes,
        truncated,
    })
}

pub fn write_file(
    worktree_path: impl AsRef<Path>,
    rel_path: &str,
    content: &str,
) -> CoreResult<()> {
    let path = resolve_inside_root(worktree_path, rel_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::write(path, content).map_err(err)
}

pub fn list_files(worktree_path: impl AsRef<Path>) -> CoreResult<Vec<String>> {
    let root = worktree_path.as_ref();
    let mut files = Vec::new();
    for result in ignore::WalkBuilder::new(root)
        .hidden(false)
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            !matches!(
                name.as_ref(),
                ".git" | "node_modules" | "dist" | "out" | "target"
            )
        })
        .build()
    {
        let entry = result.map_err(err)?;
        if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
            files.push(
                entry
                    .path()
                    .strip_prefix(root)
                    .unwrap_or(entry.path())
                    .to_string_lossy()
                    .replace('\\', "/"),
            );
        }
    }
    Ok(files)
}

pub fn build_tree(root: impl AsRef<Path>) -> CoreResult<Vec<FileNode>> {
    fn rec(dir: &Path, root: &Path, depth: usize) -> CoreResult<Vec<FileNode>> {
        if depth > 8 {
            return Ok(vec![]);
        }

        let mut nodes = Vec::new();
        for entry in fs::read_dir(dir).map_err(err)? {
            let entry = entry.map_err(err)?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if matches!(name.as_str(), ".git" | "node_modules" | "dist" | "target") {
                continue;
            }

            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");

            if path.is_dir() {
                nodes.push(FileNode {
                    name,
                    path: rel,
                    kind: "directory".into(),
                    children: Some(rec(&path, root, depth + 1)?),
                    git_status: None,
                });
            } else {
                nodes.push(FileNode {
                    name,
                    path: rel,
                    kind: "file".into(),
                    children: None,
                    git_status: None,
                });
            }
        }
        nodes.sort_by(|a, b| (&a.kind, &a.name).cmp(&(&b.kind, &b.name)));
        Ok(nodes)
    }

    rec(root.as_ref(), root.as_ref(), 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_inside_root_rejects_parent_escape() {
        let dir = tempfile::tempdir().unwrap();
        assert!(resolve_inside_root(dir.path(), "../secret.txt").is_err());
        assert!(resolve_inside_root(dir.path(), "a/../../secret.txt").is_err());
    }

    #[test]
    fn read_and_write_stays_inside_root() {
        let dir = tempfile::tempdir().unwrap();
        write_file(dir.path(), "nested/file.txt", "hello").unwrap();
        assert_eq!(read_file(dir.path(), "nested/file.txt").unwrap(), "hello");
    }

    #[test]
    fn read_file_preview_truncates_in_rust() {
        let dir = tempfile::tempdir().unwrap();
        write_file(dir.path(), "big.txt", "abcdef").unwrap();

        let preview = read_file_preview(dir.path(), "big.txt", 3).unwrap();

        assert_eq!(preview.content, "abc");
        assert_eq!(preview.line_count, 1);
        assert_eq!(preview.total_bytes, 6);
        assert_eq!(preview.preview_bytes, 3);
        assert!(preview.truncated);
    }

    #[test]
    fn list_files_skips_heavy_generated_dirs() {
        let dir = tempfile::tempdir().unwrap();
        write_file(dir.path(), "src/app.ts", "ok").unwrap();
        write_file(dir.path(), ".git/config", "secret").unwrap();
        write_file(dir.path(), "node_modules/pkg/index.js", "heavy").unwrap();
        write_file(dir.path(), "out/app.js", "built").unwrap();

        assert_eq!(list_files(dir.path()).unwrap(), vec!["src/app.ts"]);
    }
}
