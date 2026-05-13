use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use chrono::Utc;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

#[derive(Default)]
struct AppState {
    ptys: Mutex<HashMap<String, PtyHandle>>,
    next_pty: Mutex<u64>,
}

struct PtyHandle {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    replay: Arc<Mutex<String>>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenProjectResult {
    name: String,
    repo_path: String,
    branch: String,
    is_git_repo: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileNode {
    name: String,
    path: String,
    #[serde(rename = "type")]
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FileNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    git_status: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileStatus {
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    old_path: Option<String>,
    status: String,
    bucket: String,
    staged: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    conflict_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    additions: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    deletions: Option<i64>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BranchStats {
    ahead: i64,
    behind: i64,
    additions: i64,
    deletions: i64,
}

fn err<E: std::fmt::Display>(e: E) -> String { e.to_string() }

fn user_data_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().or_else(dirs::home_dir).ok_or("Unable to resolve user data dir")?;
    Ok(base.join("ForgePad"))
}

fn state_path() -> Result<PathBuf, String> { Ok(user_data_dir()?.join("forgepad-state.json")) }

fn command_output(program: &str, args: &[&str], cwd: Option<&Path>) -> Result<String, String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(cwd) = cwd { cmd.current_dir(cwd); }
    let out = cmd.output().map_err(err)?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

fn command_status(program: &str, args: &[&str], cwd: Option<&Path>) -> Result<(), String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(cwd) = cwd { cmd.current_dir(cwd); }
    let out = cmd.output().map_err(err)?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

fn is_git_repo(path: &Path) -> bool {
    Command::new("git").args(["rev-parse", "--is-inside-work-tree"]).current_dir(path).output().map(|o| o.status.success()).unwrap_or(false)
}

fn current_branch(path: &Path) -> String {
    command_output("git", &["branch", "--show-current"], Some(path)).map(|s| s.trim().to_string()).unwrap_or_else(|_| "main".into())
}

fn resolve_inside_root(root: &str, rel: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).map_err(err)?;
    let rel = rel.replace('\\', "/");
    if rel.starts_with('/') || rel == ".." || rel.starts_with("../") || rel.contains("/../") {
        return Err(format!("Invalid relative path: {rel}"));
    }
    let target = root.join(rel);
    let parent = target.parent().unwrap_or(&root);
    let resolved_parent = fs::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
    let candidate = resolved_parent.join(target.file_name().unwrap_or_default());
    if candidate.starts_with(&root) { Ok(candidate) } else { Err("Path escapes workspace root".into()) }
}


fn split_shell(input: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    for ch in input.chars() {
        match (quote, ch) {
            (Some(q), c) if c == q => quote = None,
            (None, '\'' | '"') => quote = Some(ch),
            (None, c) if c.is_whitespace() => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            (_, c) => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

fn default_shell_command(shell: Option<String>) -> (String, Vec<String>) {
    if let Some(shell) = shell {
        let parts = split_shell(shell.trim());
        if let Some((program, args)) = parts.split_first() {
            return (program.to_string(), args.to_vec());
        }
    }
    let program = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let name = Path::new(&program).file_name().and_then(|s| s.to_str()).unwrap_or("");
    let args = if name.contains("zsh") || name.contains("bash") || name.contains("fish") {
        vec!["-l".to_string()]
    } else {
        Vec::new()
    };
    (program, args)
}

fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase().as_str() {
        "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "gif" => "image/gif", "webp" => "image/webp",
        "svg" => "image/svg+xml", "mp3" => "audio/mpeg", "wav" => "audio/wav", "ogg" => "audio/ogg", "mp4" => "video/mp4",
        _ => "application/octet-stream",
    }
}

fn status_kind(code: &str) -> String {
    if code.contains('U') || code == "AA" || code == "DD" { "conflicted".into() }
    else if code.contains('R') { "renamed".into() }
    else if code.contains('A') { "added".into() }
    else if code.contains('D') { "deleted".into() }
    else if code == "??" { "untracked".into() }
    else { "modified".into() }
}

fn parse_status_line(line: &str) -> Vec<FileStatus> {
    if line.len() < 4 { return vec![]; }
    let x = &line[0..1];
    let y = &line[1..2];
    let code = &line[0..2];
    let rest = line[3..].to_string();
    let (old_path, path) = if rest.contains(" -> ") {
        let parts: Vec<&str> = rest.splitn(2, " -> ").collect();
        (Some(parts[0].to_string()), parts[1].to_string())
    } else { (None, rest) };
    let mut out = Vec::new();
    if code == "??" {
        out.push(FileStatus { path, old_path: None, status: "untracked".into(), bucket: "untracked".into(), staged: false, conflict_kind: None, additions: None, deletions: None });
        return out;
    }
    if x.trim().len() > 0 {
        out.push(FileStatus { path: path.clone(), old_path: old_path.clone(), status: status_kind(&format!("{} ", x)), bucket: "staged".into(), staged: true, conflict_kind: None, additions: None, deletions: None });
    }
    if y.trim().len() > 0 {
        out.push(FileStatus { path, old_path, status: status_kind(&format!(" {}", y)), bucket: "unstaged".into(), staged: false, conflict_kind: None, additions: None, deletions: None });
    }
    out
}

fn collect_status(path: &Path) -> Result<Vec<FileStatus>, String> {
    let out = command_output("git", &["status", "--porcelain=v1"], Some(path))?;
    Ok(out.lines().flat_map(parse_status_line).collect())
}

#[tauri::command]
async fn app_pick_directory(app: AppHandle, title: Option<String>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    let mut dialog = app.dialog().file();
    if let Some(title) = title { dialog = dialog.set_title(title); }
    dialog.pick_folder(move |folder| { let _ = tx.send(folder.map(|p| p.to_string())); });
    Ok(rx.recv().ok().flatten())
}

#[tauri::command]
async fn app_open_project(app: AppHandle) -> Result<Option<OpenProjectResult>, String> {
    let picked = app_pick_directory(app, Some("Open Project".into())).await?;
    Ok(picked.map(|repo_path| {
        let p = PathBuf::from(&repo_path);
        OpenProjectResult { name: p.file_name().and_then(|s| s.to_str()).unwrap_or("Project").to_string(), branch: current_branch(&p), is_git_repo: is_git_repo(&p), repo_path }
    }))
}

#[tauri::command]
async fn app_open_project_from_path(selected_path: String) -> Result<Option<OpenProjectResult>, String> {
    let p = PathBuf::from(&selected_path);
    if !p.exists() { return Ok(None); }
    Ok(Some(OpenProjectResult { name: p.file_name().and_then(|s| s.to_str()).unwrap_or("Project").to_string(), branch: current_branch(&p), is_git_repo: is_git_repo(&p), repo_path: selected_path }))
}

#[tauri::command]
async fn app_show_emoji_panel() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { let _ = Command::new("osascript").args(["-e", "tell application \"System Events\" to key code 49 using {control down, command down}"]).spawn(); }
    Ok(())
}

fn app_icon_variant_path(app: &AppHandle, variant: &str) -> PathBuf {
    let safe_variant = match variant {
        "graphite" | "aurora" | "ember" | "frost" | "violet" => variant,
        _ => "graphite",
    };
    let file_name = format!("{safe_variant}.png");
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("app-icons").join(&file_name);
        if bundled.exists() {
            return bundled;
        }
    }
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("build")
        .join("app-icons")
        .join(file_name)
}

#[cfg(target_os = "macos")]
fn set_macos_application_icon(bytes: &[u8]) -> Result<(), String> {
    use objc2::{AllocAnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let mtm = unsafe { MainThreadMarker::new_unchecked() };
    let app = NSApplication::sharedApplication(mtm);
    let data = NSData::with_bytes(bytes);
    let app_icon = NSImage::initWithData(NSImage::alloc(), &data)
        .ok_or_else(|| "Failed to decode app icon image.".to_string())?;
    unsafe { app.setApplicationIconImage(Some(&app_icon)) };
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn set_macos_application_icon(_bytes: &[u8]) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
async fn app_set_icon(app: AppHandle, variant: String) -> Result<(), String> {
    let path = app_icon_variant_path(&app, &variant);
    let bytes = fs::read(&path).map_err(|error| format!("Failed to read app icon {}: {error}", path.display()))?;
    set_macos_application_icon(&bytes)
}

#[tauri::command]
async fn state_load() -> Result<Option<Value>, String> {
    let path = state_path()?;
    if !path.exists() { return Ok(None); }
    let raw = fs::read_to_string(path).map_err(err)?;
    Ok(serde_json::from_str(&raw).ok())
}

#[tauri::command]
async fn state_save(state: Value) -> Result<(), String> {
    let path = state_path()?;
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(err)?; }
    fs::write(path, serde_json::to_string_pretty(&state).map_err(err)?).map_err(err)
}

#[tauri::command]
async fn git_current_branch(worktree_path: String) -> Result<String, String> { Ok(current_branch(Path::new(&worktree_path))) }

#[tauri::command]
async fn git_status(worktree_path: String) -> Result<Vec<FileStatus>, String> { collect_status(Path::new(&worktree_path)) }

#[tauri::command]
async fn git_branch_stats(worktree_path: String) -> Result<BranchStats, String> {
    let p = Path::new(&worktree_path);
    let rev = command_output("git", &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], Some(p)).unwrap_or_default();
    let nums: Vec<i64> = rev.split_whitespace().filter_map(|s| s.parse().ok()).collect();
    let diff = command_output("git", &["diff", "--shortstat", "HEAD"], Some(p)).unwrap_or_default();
    let additions = diff.split(',').find(|s| s.contains("insertion")).and_then(|s| s.split_whitespace().next()).and_then(|s| s.parse().ok()).unwrap_or(0);
    let deletions = diff.split(',').find(|s| s.contains("deletion")).and_then(|s| s.split_whitespace().next()).and_then(|s| s.parse().ok()).unwrap_or(0);
    Ok(BranchStats { ahead: *nums.get(1).unwrap_or(&0), behind: *nums.get(0).unwrap_or(&0), additions, deletions })
}

#[tauri::command]
async fn git_file_diff(worktree_path: String, rel_path: String, bucket: String, status: String, old_path: Option<String>) -> Result<Value, String> {
    let p = Path::new(&worktree_path);
    let patch = if bucket == "staged" { command_output("git", &["diff", "--cached", "--", &rel_path], Some(p)).unwrap_or_default() }
    else if bucket == "untracked" { String::new() }
    else { command_output("git", &["diff", "--", &rel_path], Some(p)).unwrap_or_default() };
    let new_content = fs::read_to_string(resolve_inside_root(&worktree_path, &rel_path)?).ok();
    Ok(json!({"path": rel_path, "oldPath": old_path, "patch": patch, "newContent": new_content, "status": status, "bucket": bucket, "isBinary": false}))
}

#[tauri::command]
async fn git_stage(worktree_path: String, paths: Vec<String>) -> Result<(), String> {
    let refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    let mut args = vec!["add", "--"];
    args.extend(refs);
    command_status("git", &args, Some(Path::new(&worktree_path)))
}

#[tauri::command]
async fn git_unstage(worktree_path: String, paths: Vec<String>) -> Result<(), String> {
    let refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    let mut args = vec!["restore", "--staged", "--"];
    args.extend(refs);
    command_status("git", &args, Some(Path::new(&worktree_path)))
}

#[derive(Deserialize)] struct DiscardEntry { path: String, bucket: String }
#[tauri::command]
async fn git_discard(worktree_path: String, entries: Vec<DiscardEntry>) -> Result<(), String> {
    for e in entries {
        if e.bucket == "untracked" { let _ = fs::remove_file(resolve_inside_root(&worktree_path, &e.path)?); }
        else { command_status("git", &["restore", "--", &e.path], Some(Path::new(&worktree_path)))?; }
    }
    Ok(())
}

#[tauri::command]
async fn git_commit(worktree_path: String, message: String) -> Result<(), String> { command_status("git", &["commit", "-m", &message], Some(Path::new(&worktree_path))) }
#[tauri::command]
async fn git_push(worktree_path: String) -> Result<(), String> { command_status("git", &["push"], Some(Path::new(&worktree_path))) }
#[tauri::command]
async fn git_pull(worktree_path: String) -> Result<(), String> { command_status("git", &["pull", "--ff-only"], Some(Path::new(&worktree_path))) }
#[tauri::command]
async fn git_fetch(repo_path: String) -> Result<(), String> { command_status("git", &["fetch", "--all", "--prune"], Some(Path::new(&repo_path))) }
#[tauri::command]
async fn git_remote_branches(repo_path: String) -> Result<Vec<String>, String> {
    let out = command_output("git", &["branch", "-r", "--format=%(refname:short)"], Some(Path::new(&repo_path)))?;
    Ok(out.lines().map(|s| s.trim().to_string()).filter(|s| !s.contains("HEAD")).collect())
}
#[tauri::command]
async fn git_pr_number(_worktree_path: String) -> Result<Option<Value>, String> { Ok(None) }
#[tauri::command]
async fn git_generate_commit_msg(worktree_path: String, _prompt_template: String) -> Result<String, String> {
    let out = command_output("git", &["diff", "--cached", "--stat"], Some(Path::new(&worktree_path))).unwrap_or_default();
    Ok(if out.trim().is_empty() { "Update files".into() } else { "Update changed files".into() })
}
#[tauri::command]
async fn git_worktree_add(repo_path: String, branch: String, track_remote: Option<bool>, worktree_base_dir: Option<String>) -> Result<Value, String> {
    let base = worktree_base_dir.unwrap_or_else(|| Path::new(&repo_path).parent().unwrap_or(Path::new(&repo_path)).to_string_lossy().to_string());
    let name = branch.replace('/', "-");
    let worktree_path = Path::new(&base).join(&name).to_string_lossy().to_string();
    if track_remote.unwrap_or(false) { command_status("git", &["worktree", "add", "-b", &branch, &worktree_path, &format!("origin/{branch}")], Some(Path::new(&repo_path)))?; }
    else { command_status("git", &["worktree", "add", &worktree_path, &branch], Some(Path::new(&repo_path)))?; }
    Ok(json!({"worktreePath": worktree_path, "branch": branch}))
}
#[tauri::command]
async fn git_worktree_remove(repo_path: String, worktree_path: String, _branch: String) -> Result<(), String> { command_status("git", &["worktree", "remove", &worktree_path], Some(Path::new(&repo_path))) }
#[tauri::command]
async fn git_scan_worktrees(base_dir: String) -> Result<Vec<Value>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(base_dir).map_err(err)? {
        let p = entry.map_err(err)?.path();
        if p.is_dir() && is_git_repo(&p) {
            let repo_path = command_output("git", &["rev-parse", "--show-toplevel"], Some(&p)).unwrap_or_default().trim().to_string();
            out.push(json!({"repoName": p.file_name().and_then(|s| s.to_str()).unwrap_or("repo"), "repoPath": repo_path, "branch": current_branch(&p), "worktreePath": p.to_string_lossy()}));
        }
    }
    Ok(out)
}

fn build_tree(root: &Path) -> Result<Vec<FileNode>, String> {
    fn rec(dir: &Path, root: &Path, depth: usize) -> Result<Vec<FileNode>, String> {
        if depth > 8 { return Ok(vec![]); }
        let mut nodes = Vec::new();
        for entry in fs::read_dir(dir).map_err(err)? {
            let entry = entry.map_err(err)?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name == ".git" || name == "node_modules" || name == "dist" || name == "target" { continue; }
            let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
            if path.is_dir() { nodes.push(FileNode { name, path: rel, kind: "directory".into(), children: Some(rec(&path, root, depth + 1)?), git_status: None }); }
            else { nodes.push(FileNode { name, path: rel, kind: "file".into(), children: None, git_status: None }); }
        }
        nodes.sort_by(|a,b| (&a.kind, &a.name).cmp(&(&b.kind, &b.name)));
        Ok(nodes)
    }
    rec(root, root, 0)
}

#[tauri::command]
async fn fs_tree_with_status(worktree_path: String) -> Result<Vec<FileNode>, String> { build_tree(Path::new(&worktree_path)) }
#[tauri::command]
async fn fs_list_files(worktree_path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    for result in ignore::WalkBuilder::new(&worktree_path).hidden(false).build() {
        let entry = result.map_err(err)?;
        if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
            files.push(entry.path().strip_prefix(&worktree_path).unwrap_or(entry.path()).to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(files)
}
#[tauri::command]
async fn fs_read_file(worktree_path: String, rel_path: String) -> Result<String, String> { fs::read_to_string(resolve_inside_root(&worktree_path, &rel_path)?).map_err(err) }
#[tauri::command]
async fn fs_read_file_data_url(worktree_path: String, rel_path: String) -> Result<String, String> {
    let path = resolve_inside_root(&worktree_path, &rel_path)?;
    let data = fs::read(&path).map_err(err)?;
    Ok(format!("data:{};base64,{}", mime_for(&path), BASE64.encode(data)))
}
#[tauri::command]
async fn fs_read_abs_file(abs_path: String) -> Result<String, String> { fs::read_to_string(abs_path).map_err(err) }
#[tauri::command]
async fn fs_read_abs_file_data_url(abs_path: String) -> Result<String, String> {
    let path = PathBuf::from(abs_path);
    let data = fs::read(&path).map_err(err)?;
    Ok(format!("data:{};base64,{}", mime_for(&path), BASE64.encode(data)))
}
#[tauri::command]
async fn fs_write_file(worktree_path: String, rel_path: String, content: String) -> Result<(), String> {
    let path = resolve_inside_root(&worktree_path, &rel_path)?;
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(err)?; }
    fs::write(path, content).map_err(err)
}
#[tauri::command]
async fn fs_watch(worktree_path: String) -> Result<String, String> { Ok(format!("watch:{}", worktree_path)) }
#[tauri::command]
async fn fs_unwatch(_watch_id: String) -> Result<(), String> { Ok(()) }

#[tauri::command]
async fn pty_create(app: AppHandle, state: tauri::State<'_, AppState>, worktree_path: String, shell: Option<String>, command: Option<String>, extra_env: Option<HashMap<String, String>>) -> Result<String, String> {
    let mut n = state.next_pty.lock().unwrap(); *n += 1; let id = format!("pty-{}", *n); drop(n);
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize { rows: 30, cols: 100, pixel_width: 0, pixel_height: 0 }).map_err(err)?;
    let (shell_path, shell_args) = default_shell_command(shell);
    let mut cmd = CommandBuilder::new(shell_path);
    for arg in shell_args {
        cmd.arg(arg);
    }
    cmd.cwd(worktree_path);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    if let Some(env) = extra_env { for (k,v) in env { cmd.env(k, v); } }
    let child = pair.slave.spawn_command(cmd).map_err(err)?;
    let writer = pair.master.take_writer().map_err(err)?;
    let mut reader = pair.master.try_clone_reader().map_err(err)?;
    let replay = Arc::new(Mutex::new(String::new()));
    let replay_reader = replay.clone();
    let app_reader = app.clone();
    let id_reader = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    if let Ok(mut r) = replay_reader.lock() { r.push_str(&data); if r.len() > 8_000_000 { let drain = r.len() - 8_000_000; r.drain(..drain); } }
                    let _ = app_reader.emit(&format!("pty:data:{}", id_reader), data);
                }
            }
        }
        let _ = app_reader.emit(&format!("pty:exit:{}", id_reader), json!({"exitCode": 0}));
    });
    let writer_arc = Arc::new(Mutex::new(writer));
    if let Some(command) = command { let _ = writer_arc.lock().unwrap().write_all(format!("{}\n", command).as_bytes()); }
    state.ptys.lock().unwrap().insert(id.clone(), PtyHandle { writer: writer_arc, child: Arc::new(Mutex::new(child)), replay });
    Ok(id)
}
#[tauri::command]
async fn pty_write(state: tauri::State<'_, AppState>, id: String, data: String) -> Result<(), String> { if let Some(p) = state.ptys.lock().unwrap().get(&id) { p.writer.lock().unwrap().write_all(data.as_bytes()).map_err(err)?; } Ok(()) }
#[tauri::command]
async fn pty_resize(_state: tauri::State<'_, AppState>, _id: String, _cols: u16, _rows: u16) -> Result<(), String> { Ok(()) }
#[tauri::command]
async fn pty_destroy(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> { if let Some(p) = state.ptys.lock().unwrap().remove(&id) { let _ = p.child.lock().unwrap().kill(); } Ok(()) }
#[tauri::command]
async fn pty_reattach(state: tauri::State<'_, AppState>, id: String) -> Result<Value, String> { Ok(if let Some(p) = state.ptys.lock().unwrap().get(&id) { json!({"replay": p.replay.lock().unwrap().clone(), "alive": true}) } else { json!({"replay":"", "alive": false}) }) }

#[derive(Deserialize)] struct BundleInput { #[serde(rename="workspacePath")] workspace_path: String, #[serde(rename="workspaceName")] workspace_name: String, branch: String, prompt: String, tasks: Vec<Value>, files: Vec<Value>, diffs: Vec<Value>, comments: Vec<Value> }
#[tauri::command]
async fn context_create_bundle(input: BundleInput) -> Result<Value, String> {
    let id = Uuid::new_v4().to_string();
    let rel_path = format!(".forgepad/context/{}.md", id);
    let path = resolve_inside_root(&input.workspace_path, &rel_path)?;
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(err)?; }
    let mut md = format!("# ForgePad Context\n\nWorkspace: {}\nBranch: {}\n\n## Prompt\n{}\n\n", input.workspace_name, input.branch, input.prompt);
    if !input.tasks.is_empty() { md.push_str("## Tasks\n"); for t in &input.tasks { md.push_str(&format!("- {}\n", t.get("title").and_then(Value::as_str).unwrap_or("Task"))); } }
    for f in &input.files { if let Some(rel) = f.get("relPath").and_then(Value::as_str) { md.push_str(&format!("\n## File `{}`\n", rel)); if f.get("includeContent").and_then(Value::as_bool).unwrap_or(false) { if let Ok(c) = fs::read_to_string(resolve_inside_root(&input.workspace_path, rel)?) { md.push_str("```\n"); md.push_str(&c); md.push_str("\n```\n"); } } } }
    if !input.diffs.is_empty() { md.push_str("\n## Diffs\n"); for d in &input.diffs { md.push_str(&format!("- {}\n", d.get("relPath").and_then(Value::as_str).unwrap_or(""))); } }
    if !input.comments.is_empty() { md.push_str("\n## Comments\n"); for c in &input.comments { md.push_str(&format!("- {}\n", c)); } }
    fs::write(&path, &md).map_err(err)?;
    Ok(json!({"id": id, "path": path.to_string_lossy(), "relPath": rel_path, "markdown": md, "estimatedTokens": md.len()/4, "createdAt": Utc::now().timestamp_millis()}))
}

#[tauri::command]
async fn shell_open_external(url: String) -> Result<(), String> { open_target(&url) }
#[tauri::command]
async fn shell_open_path(full_path: String) -> Result<(), String> { open_target(&full_path) }
#[tauri::command]
async fn shell_show_item_in_folder(full_path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        command_status("open", &["-R", &full_path], None)
    }
    #[cfg(not(target_os = "macos"))]
    {
        open_target(&full_path)
    }
}
#[tauri::command]
async fn shell_open_in_terminal(full_path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        command_status("open", &["-a", "Terminal", &full_path], None)
    }
    #[cfg(not(target_os = "macos"))]
    {
        open_target(&full_path)
    }
}
#[tauri::command]
async fn shell_open_in_ide(full_path: String) -> Result<(), String> { command_status("code", &[&full_path], None).or_else(|_| open_target(&full_path)) }
#[tauri::command]
async fn shell_detect_ides() -> Result<Vec<Value>, String> { Ok(vec![json!({"id":"vscode","label":"VS Code","command":"code","appName":"Visual Studio Code"})]) }
#[tauri::command]
async fn shell_open_with_ide(full_path: String, _ide_id: String) -> Result<(), String> { shell_open_in_ide(full_path).await }
#[tauri::command]
async fn shell_detect_terminals() -> Result<Vec<Value>, String> { Ok(vec![json!({"id":"terminal","label":"Terminal","appName":"Terminal"})]) }
#[tauri::command]
async fn shell_open_with_terminal(full_path: String, _terminal_id: String) -> Result<(), String> { shell_open_in_terminal(full_path).await }
fn open_target(target: &str) -> Result<(), String> { #[cfg(target_os="macos")] { return command_status("open", &[target], None); } #[cfg(target_os="windows")] { return command_status("cmd", &["/C", "start", target], None); } #[cfg(target_os="linux")] { return command_status("xdg-open", &[target], None); } #[allow(unreachable_code)] Ok(()) }

#[tauri::command]
async fn notification_pick_audio(_app: AppHandle) -> Result<Option<Value>, String> { Ok(None) }
#[tauri::command]
async fn notification_delete_audio(_asset_path: String) -> Result<(), String> { Ok(()) }
#[tauri::command]
async fn app_is_focused(app: AppHandle) -> Result<bool, String> { Ok(app.get_webview_window("main").map(|w| w.is_focused().unwrap_or(false)).unwrap_or(false)) }
#[tauri::command]
async fn app_focus_window(app: AppHandle) -> Result<(), String> { if let Some(w) = app.get_webview_window("main") { let _ = w.set_focus(); } Ok(()) }
#[tauri::command]
async fn app_toggle_maximize(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_maximized().map_err(err)? {
            w.unmaximize().map_err(err)?;
        } else {
            w.maximize().map_err(err)?;
        }
    }
    Ok(())
}
#[tauri::command]
async fn browser_open_window(app: AppHandle, url: String, title: Option<String>) -> Result<(), String> {
    let parsed = url.parse().map_err(|e| format!("Invalid URL: {e}"))?;
    let label = format!("browser-{}", Uuid::new_v4());
    tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::External(parsed))
        .title(title.unwrap_or_else(|| "ForgePad Browser".to_string()))
        .inner_size(1280.0, 900.0)
        .min_inner_size(600.0, 400.0)
        .build()
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
async fn browser_noop() -> Result<(), String> { Ok(()) }
#[tauri::command]
async fn browser_capture_screenshot() -> Result<String, String> { Ok(String::new()) }
#[tauri::command]
async fn extension_list() -> Result<Vec<Value>, String> { Ok(vec![]) }
#[tauri::command]
async fn extension_install() -> Result<Option<Value>, String> { Ok(None) }
#[tauri::command]
async fn extension_uninstall(_id: String) -> Result<(), String> { Ok(()) }
#[tauri::command]
async fn extension_open_popup() -> Result<(), String> { Ok(()) }
#[tauri::command]
async fn lsp_get_definition(worktree_path: String, token: String) -> Result<Vec<Value>, String> {
    let pat = token;
    let out = command_output("git", &["grep", "-n", "--", &pat], Some(Path::new(&worktree_path))).unwrap_or_default();
    Ok(out.lines().take(100).filter_map(|line| { let mut parts = line.splitn(3, ':'); Some(json!({"filePath": parts.next()?, "lineNumber": parts.next()?.parse::<u32>().ok()?, "charStart": 0, "lineText": parts.next().unwrap_or("")})) }).collect())
}
fn pet_sprite_size(scale: f64) -> (f64, f64) {
    ((192.0 * scale).round(), (208.0 * scale).round())
}

#[derive(Clone, Copy)]
struct LogicalWorkArea {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn primary_logical_work_area(app: &AppHandle) -> Result<LogicalWorkArea, String> {
    let monitor = app.primary_monitor().map_err(err)?.ok_or("No primary monitor")?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    Ok(LogicalWorkArea {
        x: area.position.x as f64 / scale,
        y: area.position.y as f64 / scale,
        width: area.size.width as f64 / scale,
        height: area.size.height as f64 / scale,
    })
}

fn clamp_to_area(x: f64, y: f64, width: f64, height: f64, area: LogicalWorkArea) -> (f64, f64) {
    let max_x = (area.x + area.width - width).max(area.x);
    let max_y = (area.y + area.height - height).max(area.y);
    (x.clamp(area.x, max_x), y.clamp(area.y, max_y))
}

fn ensure_pet_window(app: &AppHandle, settings: &Value) -> Result<tauri::WebviewWindow, String> {
    if let Some(win) = app.get_webview_window("pet") {
        let _ = win.show();
        return Ok(win);
    }

    let scale = settings.get("petSize").and_then(Value::as_f64).unwrap_or(0.8);
    let (width, height) = pet_sprite_size(scale);
    let area = primary_logical_work_area(app)?;
    let (x, y) = clamp_to_area(area.x + area.width - width - 40.0, area.y + area.height - height - 40.0, width, height, area);

    tauri::WebviewWindowBuilder::new(app, "pet", tauri::WebviewUrl::App("pet.html".into()))
        .title("ForgePad Pet")
        .inner_size(width, height)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .focusable(false)
        .build()
        .map_err(err)
}

#[tauri::command]
async fn pet_send_settings(app: AppHandle, settings: Value) -> Result<(), String> {
    let enabled = settings.get("enabled").and_then(Value::as_bool).unwrap_or(false);
    if !enabled {
        if let Some(win) = app.get_webview_window("pet") {
            let _ = win.hide();
        }
        return Ok(());
    }
    let win = ensure_pet_window(&app, &settings)?;
    let scale = settings.get("petSize").and_then(Value::as_f64).unwrap_or(0.8);
    let (width, height) = pet_sprite_size(scale);
    let old_pos = win.outer_position().ok();
    let _ = win.set_size(tauri::LogicalSize::new(width, height));
    if let Ok(area) = primary_logical_work_area(&app) {
        let scale_factor = win.scale_factor().unwrap_or(1.0);
        let (x, y) = old_pos
            .map(|p| (p.x as f64 / scale_factor, p.y as f64 / scale_factor))
            .map(|(x, y)| clamp_to_area(x, y, width, height, area))
            .unwrap_or_else(|| clamp_to_area(area.x + area.width - width - 40.0, area.y + area.height - height - 40.0, width, height, area));
        let _ = win.set_position(tauri::LogicalPosition::new(x, y));
    }
    let _ = app.emit_to("pet", "pet:settings-changed", settings);
    Ok(())
}

#[tauri::command]
async fn pet_command(app: AppHandle, command: Value) -> Result<(), String> {
    app.emit_to("pet", "pet:command", command).map_err(err)
}

#[tauri::command]
async fn pet_move_window(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("pet") {
        let size = win.outer_size().map_err(err)?;
        let scale = win.scale_factor().unwrap_or(1.0);
        let area = primary_logical_work_area(&app)?;
        let width = size.width as f64 / scale;
        let height = size.height as f64 / scale;
        let (clamped_x, clamped_y) = clamp_to_area(x, y, width, height, area);
        win.set_position(tauri::LogicalPosition::new(clamped_x, clamped_y)).map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
async fn pet_resize_window(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("pet") {
        let old_pos = win.outer_position().ok();
        let scale = win.scale_factor().unwrap_or(1.0);
        win.set_size(tauri::LogicalSize::new(width, height)).map_err(err)?;
        if let (Some(pos), Ok(area)) = (old_pos, primary_logical_work_area(&app)) {
            let (x, y) = clamp_to_area(pos.x as f64 / scale, pos.y as f64 / scale, width, height, area);
            let _ = win.set_position(tauri::LogicalPosition::new(x, y));
        }
    }
    Ok(())
}

#[tauri::command]
async fn pet_get_stage(app: AppHandle) -> Result<Value, String> {
    let area = primary_logical_work_area(&app)?;
    Ok(json!({
        "capturedAt": Utc::now().timestamp_millis(),
        "workArea": {"x": area.x, "y": area.y, "width": area.width, "height": area.height},
        "displays": [{"x": area.x, "y": area.y, "width": area.width, "height": area.height}],
        "windows": []
    }))
}

#[tauri::command]
async fn pet_focus_agent(app: AppHandle, pty_id: Option<String>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit_to("main", "agent:focus-tab", pty_id.unwrap_or_else(|| "__pet_click__".into()));
    }
    Ok(())
}

#[tauri::command]
async fn pet_import() -> Result<Value, String> { Ok(json!({"success": false, "error": "unsupported"})) }
#[tauri::command]
async fn pet_delete(_pet_id: String) -> Result<Value, String> { Ok(json!({"success": true})) }
#[tauri::command]
async fn pet_list() -> Result<Vec<Value>, String> { Ok(vec![]) }

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            app_open_project, app_open_project_from_path, app_pick_directory, app_show_emoji_panel, app_set_icon, state_load, state_save,
            git_current_branch, git_branch_stats, git_status, git_file_diff, git_stage, git_unstage, git_discard, git_commit, git_push, git_pull, git_generate_commit_msg, git_worktree_add, git_worktree_remove, git_scan_worktrees, git_fetch, git_remote_branches, git_pr_number,
            fs_tree_with_status, fs_list_files, fs_read_file, fs_read_file_data_url, fs_read_abs_file, fs_read_abs_file_data_url, fs_write_file, fs_watch, fs_unwatch,
            pty_create, pty_write, pty_resize, pty_destroy, pty_reattach, context_create_bundle,
            shell_open_path, shell_open_external, shell_open_in_ide, shell_open_in_terminal, shell_show_item_in_folder, shell_detect_ides, shell_open_with_ide, shell_detect_terminals, shell_open_with_terminal,
            notification_pick_audio, notification_delete_audio, app_is_focused, app_focus_window, app_toggle_maximize,
            browser_open_window, browser_noop, browser_capture_screenshot, extension_list, extension_install, extension_uninstall, extension_open_popup, lsp_get_definition, pet_send_settings, pet_command, pet_move_window, pet_resize_window, pet_get_stage, pet_focus_agent, pet_import, pet_delete, pet_list
        ])
        .run(tauri::generate_context!())
        .expect("error while running ForgePad Tauri application");
}
