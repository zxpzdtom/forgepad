use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::command::{command_output, command_status};
use crate::files::resolve_inside_root;
use crate::pty::split_shell;
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

    let staged_status = status_kind(&format!("{} ", x));
    let unstaged_status = status_kind(&format!(" {}", y));

    if !x.trim().is_empty() {
        out.push(FileStatus {
            path: path.clone(),
            old_path: old_path.clone(),
            status: staged_status,
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
            old_path: None,
            status: unstaged_status,
            bucket: "unstaged".into(),
            staged: false,
            conflict_kind: None,
            additions: None,
            deletions: None,
        });
    }

    out
}

fn parse_numstat_line(line: &str) -> Option<(String, i64, i64)> {
    let mut parts = line.split('\t');
    let additions = parts.next()?.parse::<i64>().ok()?;
    let deletions = parts.next()?.parse::<i64>().ok()?;
    let file_path = normalize_numstat_path(parts.last()?);
    Some((file_path, additions, deletions))
}

fn normalize_numstat_path(path: &str) -> String {
    let Some((before_arrow, after_arrow)) = path.split_once(" => ") else {
        return path.to_string();
    };

    if let Some(open_brace) = before_arrow.rfind('{') {
        let prefix = &before_arrow[..open_brace];
        let suffix = after_arrow.strip_suffix('}').unwrap_or(after_arrow);
        return format!("{prefix}{suffix}");
    }

    after_arrow.to_string()
}

fn collect_numstats(path: &Path, cached: bool) -> HashMap<String, (i64, i64)> {
    let mut args = vec!["diff"];
    if cached {
        args.push("--cached");
    }
    args.extend(["--numstat", "--find-renames"]);
    let out = command_output("git", &args, Some(path)).unwrap_or_default();
    out.lines()
        .filter_map(parse_numstat_line)
        .map(|(file_path, additions, deletions)| (file_path, (additions, deletions)))
        .collect()
}

fn count_untracked_additions(root: &Path, rel_path: &str) -> Option<i64> {
    let path = resolve_inside_root(root, rel_path).ok()?;
    let metadata = fs::metadata(&path).ok()?;
    if !metadata.is_file() || metadata.len() > 1_048_576 {
        return None;
    }
    let content = fs::read_to_string(path).ok()?;
    Some(content.lines().count() as i64)
}

pub fn collect_status(path: &Path) -> CoreResult<Vec<FileStatus>> {
    let out = command_output(
        "git",
        &["status", "--porcelain=v1", "--untracked-files=all"],
        Some(path),
    )?;
    let staged_stats = collect_numstats(path, true);
    let unstaged_stats = collect_numstats(path, false);
    let statuses = out
        .lines()
        .flat_map(parse_status_line)
        .map(|mut status| {
            let stats = if status.bucket == "staged" {
                staged_stats.get(&status.path)
            } else if status.bucket == "unstaged" {
                unstaged_stats.get(&status.path)
            } else {
                None
            };
            if let Some((additions, deletions)) = stats {
                status.additions = Some(*additions);
                status.deletions = Some(*deletions);
            } else if status.status == "deleted" {
                status.additions = Some(0);
                status.deletions = None;
            } else if status.bucket == "untracked" {
                status.additions = count_untracked_additions(path, &status.path);
                status.deletions = Some(0);
            }
            status
        })
        .collect();
    Ok(statuses)
}

fn sum_status_change_stats(statuses: &[FileStatus]) -> (i64, i64) {
    statuses.iter().fold((0, 0), |(additions, deletions), status| {
        (
            additions + status.additions.unwrap_or(0),
            deletions + status.deletions.unwrap_or(0),
        )
    })
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
    let statuses = collect_status(path).unwrap_or_default();
    let (additions, deletions) = sum_status_change_stats(&statuses);

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
    let args = vec![
        "pr".to_string(),
        "view".to_string(),
        "--json".to_string(),
        "number,url,mergedAt,state".to_string(),
    ];
    let out = match run_agent_command(worktree_path, "gh", &args, Duration::from_secs(5)) {
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

pub fn generate_commit_message(
    worktree_path: &Path,
    prompt_template: Option<&str>,
    agent_command: Option<&str>,
) -> CoreResult<String> {
    generate_commit_message_with_agent(worktree_path, prompt_template, agent_command)
}

fn generate_commit_message_with_agent(
    worktree_path: &Path,
    prompt_template: Option<&str>,
    agent_command: Option<&str>,
) -> CoreResult<String> {
    let diff = commit_message_diff(worktree_path)?;
    if diff.trim().is_empty() {
        return Err("No changes to analyze.".into());
    }

    let prompt_template = prompt_template
        .filter(|template| !template.trim().is_empty())
        .unwrap_or(
            "Analyze this git diff and return one Conventional Commit message only.\n\n{diff}",
        );
    let diff = truncate_chars(&diff, 30_000);
    let prompt = if prompt_template.contains("{diff}") {
        prompt_template.replace("{diff}", &diff)
    } else {
        format!("{prompt_template}\n\n{diff}")
    };

    let command = agent_command
        .filter(|command| !command.trim().is_empty())
        .unwrap_or("claude");
    let (program, args) = commit_agent_command(command, &prompt)
        .ok_or_else(|| "Missing agent command for commit message generation.".to_string())?;
    let output = run_agent_command(worktree_path, &program, &args, Duration::from_secs(60))?;
    sanitize_commit_message(&output)
        .ok_or_else(|| "AI returned an empty commit message.".to_string())
}

fn commit_message_diff(worktree_path: &Path) -> CoreResult<String> {
    let staged =
        command_output("git", &["diff", "--cached", "--"], Some(worktree_path)).unwrap_or_default();
    if !staged.trim().is_empty() {
        return Ok(staged);
    }

    let mut diff = command_output("git", &["diff", "--"], Some(worktree_path)).unwrap_or_default();
    let untracked = command_output(
        "git",
        &["ls-files", "--others", "--exclude-standard"],
        Some(worktree_path),
    )
    .unwrap_or_default();

    let untracked = untracked
        .lines()
        .filter(|line| !line.trim().is_empty())
        .take(80)
        .collect::<Vec<_>>();
    if !untracked.is_empty() {
        if !diff.trim().is_empty() {
            diff.push_str("\n\n");
        }
        diff.push_str("Untracked files:\n");
        for path in untracked {
            diff.push_str("?? ");
            diff.push_str(path);
            diff.push('\n');
        }
    }

    Ok(diff)
}

fn commit_agent_command(agent_command: &str, prompt: &str) -> Option<(String, Vec<String>)> {
    let parts = split_shell(agent_command.trim());
    let (program, configured_args) = parts.split_first()?;
    let binary_name = Path::new(program)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(program)
        .to_ascii_lowercase();

    let program = resolve_agent_program(program).unwrap_or_else(|| program.to_string());
    let mut args = strip_interactive_agent_args(configured_args);
    if binary_name.contains("claude") {
        args.retain(|arg| arg != "-p" && arg != "--print" && arg != "--no-session-persistence");
        args.push("-p".into());
        args.push("--no-session-persistence".into());
        args.push(prompt.to_string());
    } else if binary_name.contains("codex") {
        args.push("exec".into());
        args.push(prompt.to_string());
    } else if binary_name.contains("gemini") {
        args.push("-p".into());
        args.push(prompt.to_string());
    } else {
        args.push(prompt.to_string());
    }

    Some((program, args))
}

fn strip_interactive_agent_args(args: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    let mut skip_next = false;
    for arg in args {
        if skip_next {
            skip_next = false;
            continue;
        }
        match arg.as_str() {
            "--permission-mode" | "--approval-mode" => {
                skip_next = true;
            }
            value
                if value.starts_with("--permission-mode=")
                    || value.starts_with("--approval-mode=") => {}
            _ => out.push(arg.clone()),
        }
    }
    out
}

fn resolve_agent_program(program: &str) -> Option<String> {
    if program.contains('/') {
        return Some(program.to_string());
    }

    let escaped = shell_escape(program);
    let output = Command::new("/bin/zsh")
        .args(["-lc", &format!("command -v {escaped}")])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

fn shell_escape(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn run_agent_command(
    worktree_path: &Path,
    program: &str,
    args: &[String],
    timeout: Duration,
) -> CoreResult<String> {
    let mut child = Command::new(program)
        .args(args)
        .current_dir(worktree_path)
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(crate::err)?;

    let start = Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(crate::err)? {
            let mut stdout = String::new();
            let mut stderr = String::new();
            if let Some(mut pipe) = child.stdout.take() {
                let _ = pipe.read_to_string(&mut stdout);
            }
            if let Some(mut pipe) = child.stderr.take() {
                let _ = pipe.read_to_string(&mut stderr);
            }
            if status.success() {
                return Ok(stdout);
            }
            return Err(stderr.trim().to_string());
        }
        if start.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err("AI commit message generation timed out".into());
        }
        std::thread::sleep(Duration::from_millis(80));
    }
}

fn sanitize_commit_message(output: &str) -> Option<String> {
    let mut lines = output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("```"));
    let first = lines.next()?;
    let message = first
        .trim_matches('"')
        .trim_matches('`')
        .trim_matches('\'')
        .trim()
        .chars()
        .take(180)
        .collect::<String>();
    if message.is_empty() {
        None
    } else {
        Some(message)
    }
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut out = String::with_capacity(value.len().min(max_chars));
    for (index, ch) in value.chars().enumerate() {
        if index >= max_chars {
            out.push_str("\n\n... diff truncated ...");
            break;
        }
        out.push(ch);
    }
    out
}

pub fn add_worktree(
    repo_path: &Path,
    branch: &str,
    track_remote: bool,
    worktree_base_dir: Option<&str>,
) -> CoreResult<WorktreeAddResult> {
    let base = worktree_base_dir
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| repo_path.parent().unwrap_or(repo_path).to_path_buf());
    let name = branch.replace('/', "-");
    let worktree_path = base.join(&name).to_string_lossy().to_string();
    let remote_ref = format!("refs/remotes/origin/{branch}");
    let remote_exists = track_remote
        && command_status(
            "git",
            &["show-ref", "--verify", "--quiet", &remote_ref],
            Some(repo_path),
        )
        .is_ok();

    if remote_exists {
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
            &["worktree", "add", "-b", branch, &worktree_path],
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

    #[test]
    fn parse_rename_with_worktree_modification_splits_rename_and_modified_status() {
        let statuses = parse_status_line("RM src/old.ts -> src/new.ts");
        assert_eq!(statuses.len(), 2);
        assert_eq!(statuses[0].status, "renamed");
        assert_eq!(statuses[0].old_path, Some("src/old.ts".into()));
        assert_eq!(statuses[1].status, "modified");
        assert_eq!(statuses[1].old_path, None);
    }

    #[test]
    fn parse_numstat_line_keeps_line_counts() {
        assert_eq!(
            parse_numstat_line("12\t3\tsrc/app.ts"),
            Some(("src/app.ts".into(), 12, 3))
        );
        assert_eq!(parse_numstat_line("-\t-\tassets/icon.png"), None);
    }

    #[test]
    fn parse_numstat_line_expands_renamed_paths() {
        assert_eq!(
            parse_numstat_line("4\t2\tsrc/{old.ts => new.ts}"),
            Some(("src/new.ts".into(), 4, 2))
        );
        assert_eq!(
            parse_numstat_line("4\t2\told.ts => new.ts"),
            Some(("new.ts".into(), 4, 2))
        );
    }

    #[test]
    fn sum_status_change_stats_matches_changes_panel_aggregation() {
        let statuses = vec![
            FileStatus {
                path: "src/app.ts".into(),
                old_path: None,
                status: "modified".into(),
                bucket: "unstaged".into(),
                staged: false,
                conflict_kind: None,
                additions: Some(12),
                deletions: Some(3),
            },
            FileStatus {
                path: "src/new.ts".into(),
                old_path: None,
                status: "untracked".into(),
                bucket: "untracked".into(),
                staged: false,
                conflict_kind: None,
                additions: Some(8),
                deletions: Some(0),
            },
        ];

        assert_eq!(sum_status_change_stats(&statuses), (20, 3));
    }
}
