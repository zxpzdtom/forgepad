use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::command::{command_output, command_status};
use crate::files::resolve_inside_root;
use crate::CoreResult;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    pub status: String,
    pub bucket: String,
    pub staged: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflict_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additions: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deletions: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchStats {
    pub ahead: i64,
    pub behind: i64,
    pub additions: i64,
    pub deletions: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestInfo {
    pub number: i64,
    pub url: String,
    pub merged: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct DiscardEntry {
    pub path: String,
    pub bucket: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeAddResult {
    pub worktree_path: String,
    pub branch: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeSummary {
    pub repo_name: String,
    pub repo_path: String,
    pub branch: String,
    pub worktree_path: String,
}

pub fn is_git_repo(path: &Path) -> bool {
    std::process::Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(path)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

pub fn current_branch(path: &Path) -> String {
    command_output("git", &["branch", "--show-current"], Some(path))
        .map(|branch| branch.trim().to_string())
        .unwrap_or_else(|_| "main".into())
}

fn status_kind(code: &str) -> String {
    if code.contains('U') || code == "AA" || code == "DD" {
        "conflicted".into()
    } else if code.contains('R') {
        "renamed".into()
    } else if code.contains('A') {
        "added".into()
    } else if code.contains('D') {
        "deleted".into()
    } else if code == "??" {
        "untracked".into()
    } else {
        "modified".into()
    }
}

pub fn parse_status_line(line: &str) -> Vec<FileStatus> {
    if line.len() < 4 {
        return vec![];
    }

    let x = &line[0..1];
    let y = &line[1..2];
    let code = &line[0..2];
    let rest = line[3..].to_string();
    let (old_path, path) = if rest.contains(" -> ") {
        let parts: Vec<&str> = rest.splitn(2, " -> ").collect();
        (Some(parts[0].to_string()), parts[1].to_string())
    } else {
        (None, rest)
    };

    let mut out = Vec::new();
    if code == "??" {
        out.push(FileStatus {
            path,
            old_path: None,
            status: "untracked".into(),
            bucket: "untracked".into(),
            staged: false,
            conflict_kind: None,
            additions: None,
            deletions: None,
        });
        return out;
    }

    if !x.trim().is_empty() {
        out.push(FileStatus {
            path: path.clone(),
            old_path: old_path.clone(),
            status: status_kind(&format!("{} ", x)),
            bucket: "staged".into(),
            staged: true,
            conflict_kind: None,
            additions: None,
            deletions: None,
        });
    }
    if !y.trim().is_empty() {
        out.push(FileStatus {
            path,
            old_path,
            status: status_kind(&format!(" {}", y)),
            bucket: "unstaged".into(),
            staged: false,
            conflict_kind: None,
            additions: None,
            deletions: None,
        });
    }

    out
}

pub fn collect_status(path: &Path) -> CoreResult<Vec<FileStatus>> {
    let out = command_output("git", &["status", "--porcelain=v1"], Some(path))?;
    Ok(out.lines().flat_map(parse_status_line).collect())
}

pub fn branch_stats(path: &Path) -> BranchStats {
    let rev = command_output(
        "git",
        &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
        Some(path),
    )
    .unwrap_or_default();
    let nums: Vec<i64> = rev
        .split_whitespace()
        .filter_map(|s| s.parse().ok())
        .collect();
    let diff =
        command_output("git", &["diff", "--shortstat", "HEAD"], Some(path)).unwrap_or_default();
    let additions = diff
        .split(',')
        .find(|s| s.contains("insertion"))
        .and_then(|s| s.split_whitespace().next())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let deletions = diff
        .split(',')
        .find(|s| s.contains("deletion"))
        .and_then(|s| s.split_whitespace().next())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    BranchStats {
        ahead: *nums.get(1).unwrap_or(&0),
        behind: *nums.first().unwrap_or(&0),
        additions,
        deletions,
    }
}

pub fn stage(worktree_path: &Path, paths: &[String]) -> CoreResult<()> {
    let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
    let mut args = vec!["add", "--"];
    args.extend(refs);
    command_status("git", &args, Some(worktree_path))
}

pub fn unstage(worktree_path: &Path, paths: &[String]) -> CoreResult<()> {
    let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
    let mut args = vec!["restore", "--staged", "--"];
    args.extend(refs);
    command_status("git", &args, Some(worktree_path))
}

pub fn discard(worktree_path: &Path, entries: &[DiscardEntry]) -> CoreResult<()> {
    for entry in entries {
        if entry.bucket == "untracked" {
            let _ = fs::remove_file(resolve_inside_root(worktree_path, &entry.path)?);
        } else {
            command_status("git", &["restore", "--", &entry.path], Some(worktree_path))?;
        }
    }
    Ok(())
}

pub fn commit(worktree_path: &Path, message: &str) -> CoreResult<()> {
    command_status("git", &["commit", "-m", message], Some(worktree_path))
}

pub fn push(worktree_path: &Path) -> CoreResult<()> {
    command_status("git", &["push"], Some(worktree_path))
}

pub fn pull(worktree_path: &Path) -> CoreResult<()> {
    command_status("git", &["pull", "--ff-only"], Some(worktree_path))
}

pub fn fetch(repo_path: &Path) -> CoreResult<()> {
    command_status("git", &["fetch", "--all", "--prune"], Some(repo_path))
}

pub fn remote_branches(repo_path: &Path) -> CoreResult<Vec<String>> {
    let out = command_output(
        "git",
        &["branch", "-r", "--format=%(refname:short)"],
        Some(repo_path),
    )?;
    Ok(out
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.contains("HEAD"))
        .collect())
}

pub fn pr_info(worktree_path: &Path) -> CoreResult<Option<PullRequestInfo>> {
    let out = match command_output(
        "gh",
        &["pr", "view", "--json", "number,url,mergedAt,state"],
        Some(worktree_path),
    ) {
        Ok(out) => out,
        Err(_) => return Ok(None),
    };

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct GhPrInfo {
        number: i64,
        url: String,
        merged_at: Option<String>,
        state: Option<String>,
    }

    let parsed: GhPrInfo = serde_json::from_str(&out).map_err(crate::err)?;
    Ok(Some(PullRequestInfo {
        number: parsed.number,
        url: parsed.url,
        merged: parsed.merged_at.is_some() || parsed.state.as_deref() == Some("MERGED"),
    }))
}

pub fn generate_commit_message(worktree_path: &Path) -> String {
    let out = command_output("git", &["diff", "--cached", "--stat"], Some(worktree_path))
        .unwrap_or_default();
    if out.trim().is_empty() {
        "Update files".into()
    } else {
        "Update changed files".into()
    }
}

pub fn add_worktree(
    repo_path: &Path,
    branch: &str,
    track_remote: bool,
    worktree_base_dir: Option<&str>,
) -> CoreResult<WorktreeAddResult> {
    let base = worktree_base_dir
        .map(PathBuf::from)
        .unwrap_or_else(|| repo_path.parent().unwrap_or(repo_path).to_path_buf());
    let name = branch.replace('/', "-");
    let worktree_path = base.join(&name).to_string_lossy().to_string();

    if track_remote {
        command_status(
            "git",
            &[
                "worktree",
                "add",
                "-b",
                branch,
                &worktree_path,
                &format!("origin/{branch}"),
            ],
            Some(repo_path),
        )?;
    } else {
        command_status(
            "git",
            &["worktree", "add", &worktree_path, branch],
            Some(repo_path),
        )?;
    }

    Ok(WorktreeAddResult {
        worktree_path,
        branch: branch.to_string(),
    })
}

pub fn remove_worktree(repo_path: &Path, worktree_path: &str) -> CoreResult<()> {
    command_status(
        "git",
        &["worktree", "remove", worktree_path],
        Some(repo_path),
    )
}

pub fn scan_worktrees(base_dir: impl AsRef<Path>) -> CoreResult<Vec<WorktreeSummary>> {
    let mut out = Vec::new();
    for entry in fs::read_dir(base_dir).map_err(crate::err)? {
        let path = entry.map_err(crate::err)?.path();
        if path.is_dir() && is_git_repo(&path) {
            let repo_path = command_output("git", &["rev-parse", "--show-toplevel"], Some(&path))
                .unwrap_or_default()
                .trim()
                .to_string();
            out.push(WorktreeSummary {
                repo_name: path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("repo")
                    .to_string(),
                repo_path,
                branch: current_branch(&path),
                worktree_path: path.to_string_lossy().to_string(),
            });
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_untracked_status() {
        assert_eq!(
            parse_status_line("?? src/new-file.ts"),
            vec![FileStatus {
                path: "src/new-file.ts".into(),
                old_path: None,
                status: "untracked".into(),
                bucket: "untracked".into(),
                staged: false,
                conflict_kind: None,
                additions: None,
                deletions: None,
            }]
        );
    }

    #[test]
    fn parse_split_staged_and_unstaged_status() {
        let statuses = parse_status_line("MM src/app.ts");
        assert_eq!(statuses.len(), 2);
        assert_eq!(statuses[0].bucket, "staged");
        assert_eq!(statuses[1].bucket, "unstaged");
    }
}
