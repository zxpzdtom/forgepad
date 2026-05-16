use std::collections::{hash_map::DefaultHasher, HashMap};
use std::hash::{Hash, Hasher};
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use forgepad_core::{app, context, files, git, hooks, lsp, pty, state};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    id: String,
    command: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn main() {
    let output = Arc::new(Mutex::new(io::stdout()));
    let event_output = Arc::clone(&output);
    let exit_output = Arc::clone(&output);
    let ptys = pty::PtyManager::new(
        move |id, data| {
            emit(
                &event_output,
                json!({
                    "type": "pty.data",
                    "payload": { "id": id, "data": data }
                }),
            );
        },
        move |id, exit_code| {
            emit(
                &exit_output,
                json!({
                    "type": "pty.exit",
                    "payload": { "id": id, "exitCode": exit_code }
                }),
            );
        },
    );
    let watchers = FsWatchManager::new(Arc::clone(&output));
    let hook_output = Arc::clone(&output);
    let hooks = match hooks::HookServer::start(move |event| emit(&hook_output, event)) {
        Ok(server) => Some(server),
        Err(error) => {
            emit(
                &output,
                json!({"type": "core.log", "level": "error", "message": format!("hook server failed: {error}")}),
            );
            None
        }
    };

    emit(
        &output,
        json!({
            "type": "core.ready",
            "pid": std::process::id(),
            "hookPort": hooks.as_ref().map(|server| server.port())
        }),
    );

    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                emit(
                    &output,
                    json!({"type": "core.log", "level": "error", "message": error.to_string()}),
                );
                continue;
            }
        };

        if line.trim().is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<Request>(&line) {
            Ok(request) => handle_request(&ptys, &watchers, hooks.as_ref(), request),
            Err(error) => Response {
                id: "unknown".into(),
                value: None,
                error: Some(format!("Invalid request: {error}")),
            },
        };

        emit_response(&output, response);
    }
}

fn handle_request(
    ptys: &pty::PtyManager,
    watchers: &FsWatchManager,
    hooks: Option<&hooks::HookServer>,
    request: Request,
) -> Response {
    match dispatch(ptys, watchers, hooks, &request.command, request.params) {
        Ok(value) => Response {
            id: request.id,
            value: Some(value),
            error: None,
        },
        Err(error) => Response {
            id: request.id,
            value: None,
            error: Some(error),
        },
    }
}

fn dispatch(
    ptys: &pty::PtyManager,
    watchers: &FsWatchManager,
    hooks: Option<&hooks::HookServer>,
    command: &str,
    params: Value,
) -> Result<Value, String> {
    match command {
        "app.projectFromPath" => {
            let selected_path = string_param(&params, "selectedPath")?;
            serde_json::to_value(app::project_from_path(Path::new(&selected_path))?)
                .map_err(|e| e.to_string())
        }
        "state.load" => serde_json::to_value(state::load_state()?).map_err(|e| e.to_string()),
        "state.save" => {
            state::save_state(params.get("state").unwrap_or(&Value::Null))?;
            Ok(Value::Null)
        }
        "git.currentBranch" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            Ok(json!(git::current_branch(Path::new(&worktree_path))))
        }
        "git.status" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            serde_json::to_value(git::collect_status(Path::new(&worktree_path))?)
                .map_err(|e| e.to_string())
        }
        "git.branchStats" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            serde_json::to_value(git::branch_stats(Path::new(&worktree_path)))
                .map_err(|e| e.to_string())
        }
        "git.prInfo" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            serde_json::to_value(git::pr_info(Path::new(&worktree_path))?)
                .map_err(|e| e.to_string())
        }
        "git.fileDiff" => git_file_diff(params),
        "git.stage" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            git::stage(
                Path::new(&worktree_path),
                &string_array_param(&params, "paths")?,
            )?;
            Ok(Value::Null)
        }
        "git.unstage" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            git::unstage(
                Path::new(&worktree_path),
                &string_array_param(&params, "paths")?,
            )?;
            Ok(Value::Null)
        }
        "git.discard" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            let entries = serde_json::from_value::<Vec<git::DiscardEntry>>(
                params
                    .get("entries")
                    .cloned()
                    .unwrap_or(Value::Array(vec![])),
            )
            .map_err(|e| e.to_string())?;
            git::discard(Path::new(&worktree_path), &entries)?;
            Ok(Value::Null)
        }
        "git.commit" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            git::commit(
                Path::new(&worktree_path),
                &string_param(&params, "message")?,
            )?;
            Ok(Value::Null)
        }
        "git.push" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            git::push(Path::new(&worktree_path))?;
            Ok(Value::Null)
        }
        "git.pull" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            git::pull(Path::new(&worktree_path))?;
            Ok(Value::Null)
        }
        "git.fetch" => {
            let repo_path = string_param(&params, "repoPath")?;
            git::fetch(Path::new(&repo_path))?;
            Ok(Value::Null)
        }
        "git.remoteBranches" | "git.listRemoteBranches" => {
            let repo_path = string_param(&params, "repoPath")?;
            serde_json::to_value(git::remote_branches(Path::new(&repo_path))?)
                .map_err(|e| e.to_string())
        }
        "git.worktreeAdd" => {
            let repo_path = string_param(&params, "repoPath")?;
            let branch = string_param(&params, "branch")?;
            let track_remote = params
                .get("trackRemote")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let worktree_base_dir = params.get("worktreeBaseDir").and_then(Value::as_str);
            serde_json::to_value(git::add_worktree(
                Path::new(&repo_path),
                &branch,
                track_remote,
                worktree_base_dir,
            )?)
            .map_err(|e| e.to_string())
        }
        "git.worktreeRemove" => {
            let repo_path = string_param(&params, "repoPath")?;
            let worktree_path = string_param(&params, "worktreePath")?;
            git::remove_worktree(Path::new(&repo_path), &worktree_path)?;
            Ok(Value::Null)
        }
        "git.scanWorktrees" => {
            let base_dir = string_param(&params, "baseDir")?;
            serde_json::to_value(git::scan_worktrees(base_dir)?).map_err(|e| e.to_string())
        }
        "git.generateCommitMessage" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            Ok(json!(git::generate_commit_message(Path::new(
                &worktree_path
            ))))
        }
        "fs.treeWithStatus" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            serde_json::to_value(files::build_tree(worktree_path)?).map_err(|e| e.to_string())
        }
        "fs.listFiles" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            serde_json::to_value(files::list_files(worktree_path)?).map_err(|e| e.to_string())
        }
        "fs.readFile" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            let rel_path = string_param(&params, "relPath")?;
            Ok(json!(files::read_file(worktree_path, &rel_path)?))
        }
        "fs.readFilePreview" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            let rel_path = string_param(&params, "relPath")?;
            let max_bytes = number_param(&params, "maxBytes")? as usize;
            serde_json::to_value(files::read_file_preview(
                worktree_path,
                &rel_path,
                max_bytes,
            )?)
            .map_err(|e| e.to_string())
        }
        "fs.readFileDataUrl" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            let rel_path = string_param(&params, "relPath")?;
            Ok(json!(files::read_file_data_url(worktree_path, &rel_path)?))
        }
        "fs.readAbsFile" => {
            let abs_path = string_param(&params, "absPath")?;
            Ok(json!(files::read_abs_file(abs_path)?))
        }
        "fs.readAbsFilePreview" => {
            let abs_path = string_param(&params, "absPath")?;
            let max_bytes = number_param(&params, "maxBytes")? as usize;
            serde_json::to_value(files::read_abs_file_preview(abs_path, max_bytes)?)
                .map_err(|e| e.to_string())
        }
        "fs.readAbsFileDataUrl" => {
            let abs_path = string_param(&params, "absPath")?;
            Ok(json!(files::read_abs_file_data_url(abs_path)?))
        }
        "fs.writeFile" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            let rel_path = string_param(&params, "relPath")?;
            let content = string_param(&params, "content")?;
            files::write_file(worktree_path, &rel_path, &content)?;
            Ok(Value::Null)
        }
        "fs.watchWorkspace" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            Ok(json!(watchers.watch(PathBuf::from(worktree_path))))
        }
        "fs.unwatchWorkspace" => {
            let watch_id = string_param(&params, "watchId")?;
            watchers.unwatch(&watch_id);
            Ok(Value::Null)
        }
        "context.createBundle" => {
            let input = serde_json::from_value::<context::BundleInput>(
                params.get("input").cloned().unwrap_or(params),
            )
            .map_err(|e| e.to_string())?;
            serde_json::to_value(context::create_bundle(input)?).map_err(|e| e.to_string())
        }
        "lsp.getDefinition" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            let token = string_param(&params, "token")?;
            serde_json::to_value(lsp::get_definition(Path::new(&worktree_path), &token)?)
                .map_err(|e| e.to_string())
        }
        "pty.create" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            let shell = params
                .get("shell")
                .and_then(Value::as_str)
                .map(str::to_string);
            let command = params
                .get("command")
                .and_then(Value::as_str)
                .map(str::to_string);
            let mut extra_env = params
                .get("extraEnv")
                .and_then(Value::as_object)
                .map(|env| {
                    env.iter()
                        .filter_map(|(key, value)| Some((key.clone(), value.as_str()?.to_string())))
                        .collect::<HashMap<String, String>>()
                })
                .unwrap_or_default();
            if extra_env.get("FORGEPAD_AGENT").map(String::as_str) == Some("1") {
                if let Some(hooks) = hooks {
                    extra_env.insert("FORGEPAD_PORT".to_string(), hooks.port().to_string());
                }
            }
            Ok(json!(ptys.create(
                worktree_path,
                shell,
                command,
                Some(extra_env)
            )?))
        }
        "pty.write" => {
            ptys.write(
                &string_param(&params, "id")?,
                &string_param(&params, "data")?,
            )?;
            Ok(Value::Null)
        }
        "pty.resize" => {
            let id = string_param(&params, "id")?;
            let cols = number_param(&params, "cols")? as u16;
            let rows = number_param(&params, "rows")? as u16;
            ptys.resize(&id, cols, rows)?;
            Ok(Value::Null)
        }
        "pty.destroy" => {
            ptys.destroy(&string_param(&params, "id")?)?;
            Ok(Value::Null)
        }
        "pty.reattach" => serde_json::to_value(ptys.reattach(&string_param(&params, "id")?))
            .map_err(|e| e.to_string()),
        "agent.permissionDecision" => {
            let pty_id = string_param(&params, "ptyId")?;
            let hooks = hooks.ok_or_else(|| "Hook server is not running.".to_string())?;
            hooks.resolve_permission(&pty_id, hooks::decision_from_params(&params)?);
            Ok(Value::Null)
        }
        "agent.settingsUpdate" => {
            let hooks = hooks.ok_or_else(|| "Hook server is not running.".to_string())?;
            hooks.update_settings(params.get("settings").unwrap_or(&params));
            Ok(Value::Null)
        }
        _ => Err(format!("Unknown core command: {command}")),
    }
}

struct FsWatchManager {
    output: Arc<Mutex<io::Stdout>>,
    next_id: AtomicUsize,
    stops: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl FsWatchManager {
    fn new(output: Arc<Mutex<io::Stdout>>) -> Self {
        Self {
            output,
            next_id: AtomicUsize::new(1),
            stops: Mutex::new(HashMap::new()),
        }
    }

    fn watch(&self, root: PathBuf) -> String {
        let id = format!("fs-watch-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let stop = Arc::new(AtomicBool::new(false));
        if let Ok(mut stops) = self.stops.lock() {
            stops.insert(id.clone(), Arc::clone(&stop));
        }

        let output = Arc::clone(&self.output);
        let watch_id = id.clone();
        thread::spawn(move || {
            let mut last = workspace_fingerprint(&root);
            while !stop.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(900));
                let next = workspace_fingerprint(&root);
                if next != last {
                    last = next;
                    emit(
                        &output,
                        json!({
                            "type": "fs.changed",
                            "payload": {
                                "id": watch_id,
                                "paths": [root.to_string_lossy().to_string()],
                                "changedAt": unix_millis()
                            }
                        }),
                    );
                }
            }
        });

        id
    }

    fn unwatch(&self, id: &str) {
        if let Ok(mut stops) = self.stops.lock() {
            if let Some(stop) = stops.remove(id) {
                stop.store(true, Ordering::Relaxed);
            }
        }
    }
}

fn workspace_fingerprint(root: &Path) -> u64 {
    let mut hasher = DefaultHasher::new();
    fingerprint_path(root, 0, &mut hasher);
    hasher.finish()
}

fn fingerprint_path(path: &Path, depth: usize, hasher: &mut DefaultHasher) {
    if depth > 10 || should_skip(path) {
        return;
    }
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return,
    };
    path.to_string_lossy().hash(hasher);
    metadata.len().hash(hasher);
    if let Ok(modified) = metadata.modified() {
        if let Ok(elapsed) = modified.duration_since(UNIX_EPOCH) {
            elapsed.as_millis().hash(hasher);
        }
    }
    if !metadata.is_dir() {
        return;
    }
    let mut entries = match std::fs::read_dir(path) {
        Ok(entries) => entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .collect::<Vec<_>>(),
        Err(_) => return,
    };
    entries.sort();
    for entry in entries {
        fingerprint_path(&entry, depth + 1, hasher);
    }
}

fn should_skip(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    matches!(
        name,
        ".git" | "node_modules" | "target" | "dist" | ".next" | ".turbo" | ".cache" | "build"
    )
}

fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn git_file_diff(params: Value) -> Result<Value, String> {
    let worktree_path = string_param(&params, "worktreePath")?;
    let rel_path = string_param(&params, "relPath")?;
    let bucket = string_param(&params, "bucket")?;
    let status = string_param(&params, "status")?;
    let old_path = params
        .get("oldPath")
        .and_then(Value::as_str)
        .map(str::to_string);
    let path = Path::new(&worktree_path);
    let patch = if bucket == "staged" {
        forgepad_core::command::command_output(
            "git",
            &["diff", "--cached", "--", &rel_path],
            Some(path),
        )
        .unwrap_or_default()
    } else if bucket == "untracked" {
        String::new()
    } else {
        forgepad_core::command::command_output("git", &["diff", "--", &rel_path], Some(path))
            .unwrap_or_default()
    };
    let file_path = files::resolve_inside_root(&worktree_path, &rel_path)?;
    let mime = files::mime_for(&file_path);
    let is_image = mime.starts_with("image/");
    let numstat_args = if bucket == "staged" {
        vec!["diff", "--cached", "--numstat", "--", &rel_path]
    } else {
        vec!["diff", "--numstat", "--", &rel_path]
    };
    let is_binary = is_image
        || forgepad_core::command::command_output("git", &numstat_args, Some(path))
            .map(|out| out.split_whitespace().take(2).any(|part| part == "-"))
            .unwrap_or(false);
    let new_content = if is_binary {
        None
    } else {
        std::fs::read_to_string(&file_path).ok()
    };
    let old_content = if is_binary {
        None
    } else {
        let spec = if bucket == "staged" {
            format!("HEAD:{rel_path}")
        } else {
            format!(":{rel_path}")
        };
        forgepad_core::command::command_output("git", &["show", &spec], Some(path)).ok()
    };
    let new_image_data_url = if is_image && status != "deleted" {
        files::read_file_data_url(&worktree_path, &rel_path).ok()
    } else {
        None
    };
    let old_image_data_url = if is_image && bucket != "untracked" {
        let spec = if bucket == "staged" {
            format!("HEAD:{rel_path}")
        } else {
            format!(":{rel_path}")
        };
        forgepad_core::command::command_output_bytes("git", &["show", &spec], Some(path))
            .ok()
            .map(|data| format!("data:{};base64,{}", mime, BASE64.encode(data)))
    } else {
        None
    };
    Ok(json!({
        "path": rel_path,
        "oldPath": old_path,
        "patch": patch,
        "oldContent": old_content,
        "newContent": new_content,
        "oldImageDataUrl": old_image_data_url,
        "newImageDataUrl": new_image_data_url,
        "status": status,
        "bucket": bucket,
        "isBinary": is_binary
    }))
}

fn string_param(params: &Value, key: &str) -> Result<String, String> {
    params
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| format!("Missing string param: {key}"))
}

fn string_array_param(params: &Value, key: &str) -> Result<Vec<String>, String> {
    params
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .ok_or_else(|| format!("Missing string array param: {key}"))
}

fn number_param(params: &Value, key: &str) -> Result<u64, String> {
    params
        .get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("Missing number param: {key}"))
}

fn emit(output: &Arc<Mutex<io::Stdout>>, value: Value) {
    if let Ok(mut output) = output.lock() {
        let _ = writeln!(output, "{value}");
        let _ = output.flush();
    }
}

fn emit_response(output: &Arc<Mutex<io::Stdout>>, response: Response) {
    if let Ok(mut output) = output.lock() {
        let _ = serde_json::to_writer(&mut *output, &response);
        let _ = writeln!(output);
        let _ = output.flush();
    }
}
