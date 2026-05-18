use std::collections::{hash_map::DefaultHasher, HashMap};
use std::hash::{Hash, Hasher};
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use forgepad_core::{app, context, files, git, hooks, lsp, pets, pty, state};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const FILE_PREVIEW_CACHE_CAP: usize = 96;
const DIFF_PREVIEW_CACHE_CAP: usize = 64;
const WORKSPACE_SNAPSHOT_CACHE_CAP: usize = 12;
const FS_WATCH_DEBOUNCE_MS: u64 = 120;

static PREVIEW_CACHE: OnceLock<Mutex<PreviewCache>> = OnceLock::new();
static WORKSPACE_SNAPSHOT_CACHE: OnceLock<Mutex<WorkspaceSnapshotCache>> = OnceLock::new();

#[derive(Default)]
struct PreviewCache {
    file_previews: HashMap<FilePreviewCacheKey, CacheEntry<files::FilePreview>>,
    diff_previews: HashMap<DiffPreviewCacheKey, CacheEntry<Value>>,
    tick: u64,
}

#[derive(Clone)]
struct CacheEntry<T> {
    value: T,
    last_used: u64,
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct FilePreviewCacheKey {
    path: String,
    max_bytes: usize,
    len: u64,
    modified_ns: u128,
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct DiffPreviewCacheKey {
    worktree_path: String,
    rel_path: String,
    bucket: String,
    status: String,
    old_path: Option<String>,
    file_len: Option<u64>,
    file_modified_ns: Option<u128>,
    git_fingerprint: u64,
}

#[derive(Clone)]
struct WorkspaceSnapshot {
    tree: Vec<files::FileNode>,
    files: Vec<String>,
    fs_fingerprint: u64,
    git_fingerprint: u64,
}

#[derive(Default)]
struct WorkspaceSnapshotCache {
    snapshots: HashMap<String, CacheEntry<WorkspaceSnapshot>>,
    tick: u64,
}

impl PreviewCache {
    fn next_tick(&mut self) -> u64 {
        self.tick = self.tick.saturating_add(1);
        self.tick
    }

    fn get_file_preview(&mut self, key: &FilePreviewCacheKey) -> Option<files::FilePreview> {
        let tick = self.next_tick();
        let entry = self.file_previews.get_mut(key)?;
        entry.last_used = tick;
        Some(entry.value.clone())
    }

    fn insert_file_preview(&mut self, key: FilePreviewCacheKey, value: files::FilePreview) {
        let tick = self.next_tick();
        self.file_previews.insert(
            key,
            CacheEntry {
                value,
                last_used: tick,
            },
        );
        trim_cache(&mut self.file_previews, FILE_PREVIEW_CACHE_CAP);
    }

    fn get_diff_preview(&mut self, key: &DiffPreviewCacheKey) -> Option<Value> {
        let tick = self.next_tick();
        let entry = self.diff_previews.get_mut(key)?;
        entry.last_used = tick;
        Some(entry.value.clone())
    }

    fn insert_diff_preview(&mut self, key: DiffPreviewCacheKey, value: Value) {
        let tick = self.next_tick();
        self.diff_previews.insert(
            key,
            CacheEntry {
                value,
                last_used: tick,
            },
        );
        trim_cache(&mut self.diff_previews, DIFF_PREVIEW_CACHE_CAP);
    }

    fn clear_git_and_file_state(&mut self) {
        self.diff_previews.clear();
        self.file_previews.clear();
    }
}

impl WorkspaceSnapshotCache {
    fn next_tick(&mut self) -> u64 {
        self.tick = self.tick.saturating_add(1);
        self.tick
    }

    fn get(
        &mut self,
        key: &str,
        fs_fingerprint: u64,
        git_fingerprint: u64,
    ) -> Option<WorkspaceSnapshot> {
        let tick = self.next_tick();
        let entry = self.snapshots.get_mut(key)?;
        if entry.value.fs_fingerprint != fs_fingerprint
            || entry.value.git_fingerprint != git_fingerprint
        {
            return None;
        }
        entry.last_used = tick;
        Some(entry.value.clone())
    }

    fn insert(&mut self, key: String, value: WorkspaceSnapshot) {
        let tick = self.next_tick();
        self.snapshots.insert(
            key,
            CacheEntry {
                value,
                last_used: tick,
            },
        );
        trim_cache(&mut self.snapshots, WORKSPACE_SNAPSHOT_CACHE_CAP);
    }

    fn clear(&mut self) {
        self.snapshots.clear();
    }
}

fn trim_cache<K: Clone + Eq + Hash, T>(cache: &mut HashMap<K, CacheEntry<T>>, cap: usize) {
    if cache.len() <= cap {
        return;
    }
    let mut by_age = cache
        .iter()
        .map(|(key, entry)| (key.clone(), entry.last_used))
        .collect::<Vec<_>>();
    by_age.sort_by_key(|(_, last_used)| *last_used);
    for (key, _) in by_age.into_iter().take(cache.len().saturating_sub(cap)) {
        cache.remove(&key);
    }
}

fn preview_cache() -> &'static Mutex<PreviewCache> {
    PREVIEW_CACHE.get_or_init(|| Mutex::new(PreviewCache::default()))
}

fn clear_preview_cache() {
    if let Ok(mut cache) = preview_cache().lock() {
        cache.clear_git_and_file_state();
    }
}

fn clear_runtime_caches() {
    clear_preview_cache();
    clear_workspace_snapshot_cache();
}

fn workspace_snapshot_cache() -> &'static Mutex<WorkspaceSnapshotCache> {
    WORKSPACE_SNAPSHOT_CACHE.get_or_init(|| Mutex::new(WorkspaceSnapshotCache::default()))
}

fn clear_workspace_snapshot_cache() {
    if let Ok(mut cache) = workspace_snapshot_cache().lock() {
        cache.clear();
    }
}

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

        let mut should_shutdown = false;
        let response = match serde_json::from_str::<Request>(&line) {
            Ok(request) => {
                should_shutdown = request.command == "core.shutdown";
                handle_request(&ptys, &watchers, hooks.as_ref(), request)
            }
            Err(error) => Response {
                id: "unknown".into(),
                value: None,
                error: Some(format!("Invalid request: {error}")),
            },
        };

        emit_response(&output, response);
        if should_shutdown {
            break;
        }
    }
    ptys.shutdown_all();
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
        "core.shutdown" => {
            ptys.shutdown_all();
            watchers.unwatch_all();
            clear_runtime_caches();
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
        "git.commitHistory" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            let limit = params
                .get("limit")
                .and_then(Value::as_u64)
                .map(|value| value as usize)
                .unwrap_or(14);
            serde_json::to_value(git::commit_history(Path::new(&worktree_path), limit)?)
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
        "git.commitFileDiff" => git_commit_file_diff(params),
        "git.stage" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            git::stage(
                Path::new(&worktree_path),
                &string_array_param(&params, "paths")?,
            )?;
            clear_runtime_caches();
            Ok(Value::Null)
        }
        "git.unstage" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            git::unstage(
                Path::new(&worktree_path),
                &string_array_param(&params, "paths")?,
            )?;
            clear_runtime_caches();
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
            clear_runtime_caches();
            Ok(Value::Null)
        }
        "git.commit" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            git::commit(
                Path::new(&worktree_path),
                &string_param(&params, "message")?,
            )?;
            clear_runtime_caches();
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
            clear_runtime_caches();
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
            let prompt_template = params.get("promptTemplate").and_then(Value::as_str);
            let agent_command = params.get("agentCommand").and_then(Value::as_str);
            Ok(json!(git::generate_commit_message(
                Path::new(&worktree_path),
                prompt_template,
                agent_command,
            )?))
        }
        "fs.treeWithStatus" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            serde_json::to_value(workspace_snapshot(&worktree_path)?.tree)
                .map_err(|e| e.to_string())
        }
        "fs.listFiles" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            serde_json::to_value(workspace_snapshot(&worktree_path)?.files)
                .map_err(|e| e.to_string())
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
            serde_json::to_value(cached_file_preview(
                files::resolve_inside_root(&worktree_path, &rel_path)?,
                max_bytes,
            )?)
            .map_err(|e| e.to_string())
        }
        "fs.readAbsFile" => {
            let abs_path = string_param(&params, "absPath")?;
            Ok(json!(files::read_abs_file(abs_path)?))
        }
        "fs.readAbsFilePreview" => {
            let abs_path = string_param(&params, "absPath")?;
            let max_bytes = number_param(&params, "maxBytes")? as usize;
            serde_json::to_value(cached_file_preview(PathBuf::from(abs_path), max_bytes)?)
                .map_err(|e| e.to_string())
        }
        "fs.writeFile" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            let rel_path = string_param(&params, "relPath")?;
            let content = string_param(&params, "content")?;
            files::write_file(worktree_path, &rel_path, &content)?;
            clear_runtime_caches();
            Ok(Value::Null)
        }
        "fs.watchWorkspace" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            Ok(json!(watchers.watch(PathBuf::from(worktree_path))?))
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
        "pet.importPet" => {
            let source_path = string_param(&params, "sourcePath")?;
            match pets::import_pet(source_path) {
                Ok(pet) => Ok(json!({ "success": true, "pet": pet })),
                Err(error) => Ok(json!({ "success": false, "error": error })),
            }
        }
        "pet.deletePet" => {
            let pet_id = string_param(&params, "petId")?;
            match pets::delete_pet(&pet_id) {
                Ok(()) => Ok(json!({ "success": true })),
                Err(error) => Ok(json!({ "success": false, "error": error })),
            }
        }
        "pet.listPets" => serde_json::to_value(pets::list_pets()?).map_err(|e| e.to_string()),
        _ => Err(format!("Unknown core command: {command}")),
    }
}

struct FsWatchManager {
    output: Arc<Mutex<io::Stdout>>,
    next_id: AtomicUsize,
    registrations: Mutex<HashMap<String, FsWatchRegistration>>,
}

struct FsWatchRegistration {
    _watchers: Vec<RecommendedWatcher>,
    stop: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
}

impl FsWatchManager {
    fn new(output: Arc<Mutex<io::Stdout>>) -> Self {
        Self {
            output,
            next_id: AtomicUsize::new(1),
            registrations: Mutex::new(HashMap::new()),
        }
    }

    fn watch(&self, root: PathBuf) -> Result<String, String> {
        let id = format!("fs-watch-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let canonical_root = std::fs::canonicalize(&root).unwrap_or(root);
        let (tx, rx) = mpsc::channel::<Vec<PathBuf>>();
        let watch_root = canonical_root.clone();
        let watch_tx = tx.clone();
        let mut watcher =
            notify::recommended_watcher(move |event: Result<notify::Event, notify::Error>| {
                match event {
                    Ok(event) if should_emit_fs_event(&event.kind) || event.need_rescan() => {
                        let paths = event
                            .paths
                            .into_iter()
                            .filter(|path| !should_skip(path))
                            .collect::<Vec<_>>();
                        let _ = watch_tx.send(if paths.is_empty() {
                            vec![watch_root.clone()]
                        } else {
                            paths
                        });
                    }
                    Ok(_) => {}
                    Err(_) => {
                        let _ = watch_tx.send(vec![watch_root.clone()]);
                    }
                }
            })
            .map_err(|error| error.to_string())?;
        watcher
            .watch(&canonical_root, RecursiveMode::Recursive)
            .map_err(|error| error.to_string())?;
        let mut watchers = vec![watcher];

        if let Some(git_state_dir) = git_state_dir_to_watch(&canonical_root) {
            let git_watch_root = canonical_root.clone();
            let git_tx = tx.clone();
            if let Ok(mut git_watcher) =
                notify::recommended_watcher(move |event: Result<notify::Event, notify::Error>| {
                    match event {
                        Ok(event) if should_emit_fs_event(&event.kind) || event.need_rescan() => {
                            let paths = event.paths.into_iter().collect::<Vec<_>>();
                            let _ = git_tx.send(if paths.is_empty() {
                                vec![git_watch_root.clone()]
                            } else {
                                paths
                            });
                        }
                        Ok(_) => {}
                        Err(_) => {
                            let _ = git_tx.send(vec![git_watch_root.clone()]);
                        }
                    }
                })
            {
                if git_watcher
                    .watch(&git_state_dir, RecursiveMode::Recursive)
                    .is_ok()
                {
                    watchers.push(git_watcher);
                }
            }
        }

        let stop = Arc::new(AtomicBool::new(false));
        let output = Arc::clone(&self.output);
        let watch_id = id.clone();
        let worker_stop = Arc::clone(&stop);
        let worker = thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                let Ok(mut paths) = rx.recv_timeout(Duration::from_millis(250)) else {
                    continue;
                };
                thread::sleep(Duration::from_millis(FS_WATCH_DEBOUNCE_MS));
                while let Ok(mut next_paths) = rx.try_recv() {
                    paths.append(&mut next_paths);
                }
                paths.sort();
                paths.dedup();
                clear_runtime_caches();
                emit(
                    &output,
                    json!({
                        "type": "fs.changed",
                        "payload": {
                            "id": watch_id,
                            "paths": paths.iter().map(|path| path.to_string_lossy().to_string()).collect::<Vec<_>>(),
                            "changedAt": unix_millis()
                        }
                    }),
                );
            }
        });

        self.registrations
            .lock()
            .map_err(|error| error.to_string())?
            .insert(
                id.clone(),
                FsWatchRegistration {
                    _watchers: watchers,
                    stop: worker_stop,
                    worker: Some(worker),
                },
            );
        Ok(id)
    }

    fn unwatch(&self, id: &str) {
        if let Ok(mut registrations) = self.registrations.lock() {
            if let Some(mut registration) = registrations.remove(id) {
                registration.stop.store(true, Ordering::Relaxed);
                if let Some(worker) = registration.worker.take() {
                    let _ = worker.join();
                }
            }
        }
    }

    fn unwatch_all(&self) {
        let ids = self
            .registrations
            .lock()
            .map(|registrations| registrations.keys().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        for id in ids {
            self.unwatch(&id);
        }
    }
}

fn should_emit_fs_event(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    )
}

fn workspace_fingerprint(root: &Path) -> u64 {
    let mut hasher = DefaultHasher::new();
    hash_path_metadata(root, &mut hasher);
    hasher.finish()
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

fn git_state_dir_to_watch(worktree_path: &Path) -> Option<PathBuf> {
    let git_dir = git_dir_for_worktree(worktree_path);
    if !git_dir.is_dir() {
        return None;
    }
    Some(git_dir)
}

fn workspace_cache_key(path: &Path) -> String {
    std::fs::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_string()
}

fn status_priority(status: &str) -> usize {
    match status {
        "conflicted" => 0,
        "deleted" => 1,
        "modified" => 2,
        "renamed" => 3,
        "added" => 4,
        "untracked" => 5,
        _ => 6,
    }
}

fn apply_git_status(tree: &mut [files::FileNode], statuses: &[git::FileStatus]) {
    let mut status_by_path: HashMap<String, String> = HashMap::new();
    for status in statuses {
        let current = status_by_path.get(&status.path);
        if current
            .map(|current| status_priority(&status.status) < status_priority(current))
            .unwrap_or(true)
        {
            status_by_path.insert(status.path.clone(), status.status.clone());
        }
    }

    fn walk(nodes: &mut [files::FileNode], status_by_path: &HashMap<String, String>) {
        for node in nodes {
            if node.kind == "file" {
                node.git_status = status_by_path.get(&node.path).cloned();
            }
            if let Some(children) = node.children.as_mut() {
                walk(children, status_by_path);
            }
        }
    }

    walk(tree, &status_by_path);
}

fn build_workspace_snapshot(
    root: &Path,
    fs_fingerprint: u64,
    git_fingerprint: u64,
) -> Result<WorkspaceSnapshot, String> {
    let statuses = git::collect_status(root)?;
    let mut tree = files::build_tree(root)?;
    apply_git_status(&mut tree, &statuses);
    let files = files::list_files(root)?;
    Ok(WorkspaceSnapshot {
        tree,
        files,
        fs_fingerprint,
        git_fingerprint,
    })
}

fn workspace_snapshot(worktree_path: &str) -> Result<WorkspaceSnapshot, String> {
    let root = Path::new(worktree_path);
    let key = workspace_cache_key(root);
    let fs_fingerprint = workspace_fingerprint(root);
    let git_fingerprint = git_fingerprint(root);

    if let Some(snapshot) = workspace_snapshot_cache()
        .lock()
        .map_err(|error| error.to_string())?
        .get(&key, fs_fingerprint, git_fingerprint)
    {
        return Ok(snapshot);
    }

    let snapshot = build_workspace_snapshot(root, fs_fingerprint, git_fingerprint)?;
    workspace_snapshot_cache()
        .lock()
        .map_err(|error| error.to_string())?
        .insert(key, snapshot.clone());
    Ok(snapshot)
}

fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn modified_ns(metadata: &std::fs::Metadata) -> u128 {
    metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

fn file_preview_key(path: &Path, max_bytes: usize) -> Result<FilePreviewCacheKey, String> {
    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    Ok(FilePreviewCacheKey {
        path: std::fs::canonicalize(path)
            .unwrap_or_else(|_| path.to_path_buf())
            .to_string_lossy()
            .to_string(),
        max_bytes,
        len: metadata.len(),
        modified_ns: modified_ns(&metadata),
    })
}

fn cached_file_preview(path: PathBuf, max_bytes: usize) -> Result<files::FilePreview, String> {
    let key = file_preview_key(&path, max_bytes)?;
    if let Some(preview) = preview_cache()
        .lock()
        .map_err(|error| error.to_string())?
        .get_file_preview(&key)
    {
        return Ok(preview);
    }

    let preview = files::read_abs_file_preview(&path, max_bytes)?;
    preview_cache()
        .lock()
        .map_err(|error| error.to_string())?
        .insert_file_preview(key, preview.clone());
    Ok(preview)
}

fn hash_path_metadata(path: &Path, hasher: &mut DefaultHasher) {
    if let Ok(metadata) = std::fs::metadata(path) {
        path.to_string_lossy().hash(hasher);
        metadata.len().hash(hasher);
        modified_ns(&metadata).hash(hasher);
    }
}

fn git_dir_for_worktree(worktree_path: &Path) -> PathBuf {
    let dot_git = worktree_path.join(".git");
    if dot_git.is_dir() {
        return dot_git;
    }

    if let Ok(content) = std::fs::read_to_string(&dot_git) {
        if let Some(rest) = content.trim().strip_prefix("gitdir:") {
            let git_dir = PathBuf::from(rest.trim());
            if git_dir.is_absolute() {
                return git_dir;
            }
            return worktree_path.join(git_dir);
        }
    }

    dot_git
}

fn git_fingerprint(worktree_path: &Path) -> u64 {
    let git_dir = git_dir_for_worktree(worktree_path);
    let mut hasher = DefaultHasher::new();
    for path in [
        git_dir.join("HEAD"),
        git_dir.join("index"),
        git_dir.join("logs/HEAD"),
        git_dir.join("ORIG_HEAD"),
    ] {
        hash_path_metadata(&path, &mut hasher);
    }
    hasher.finish()
}

fn diff_preview_key(
    worktree_path: &str,
    rel_path: &str,
    bucket: &str,
    status: &str,
    old_path: &Option<String>,
) -> DiffPreviewCacheKey {
    let path = Path::new(worktree_path);
    let file_metadata = files::resolve_inside_root(worktree_path, rel_path)
        .ok()
        .and_then(|path| std::fs::metadata(path).ok());
    DiffPreviewCacheKey {
        worktree_path: std::fs::canonicalize(path)
            .unwrap_or_else(|_| path.to_path_buf())
            .to_string_lossy()
            .to_string(),
        rel_path: rel_path.to_string(),
        bucket: bucket.to_string(),
        status: status.to_string(),
        old_path: old_path.clone(),
        file_len: file_metadata.as_ref().map(std::fs::Metadata::len),
        file_modified_ns: file_metadata.as_ref().map(modified_ns),
        git_fingerprint: git_fingerprint(path),
    }
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
    let cache_key = diff_preview_key(&worktree_path, &rel_path, &bucket, &status, &old_path);
    if let Some(diff) = preview_cache()
        .lock()
        .map_err(|error| error.to_string())?
        .get_diff_preview(&cache_key)
    {
        return Ok(diff);
    }

    let path = Path::new(&worktree_path);
    let mut pathspecs = Vec::new();
    if let Some(old_path) = old_path.as_deref() {
        pathspecs.push(old_path);
    }
    pathspecs.push(rel_path.as_str());

    let diff_args = |cached: bool, numstat: bool| {
        let mut args = Vec::new();
        args.push("diff");
        if cached {
            args.push("--cached");
        }
        args.push("--find-renames");
        if numstat {
            args.push("--numstat");
        }
        args.push("--");
        args.extend(pathspecs.iter().copied());
        args
    };

    let patch = if bucket == "staged" {
        let args = diff_args(true, false);
        forgepad_core::command::command_output("git", &args, Some(path)).unwrap_or_default()
    } else if bucket == "untracked" {
        String::new()
    } else {
        let args = diff_args(false, false);
        forgepad_core::command::command_output("git", &args, Some(path)).unwrap_or_default()
    };
    let file_path = files::resolve_inside_root(&worktree_path, &rel_path)?;
    let mime = files::mime_for(&file_path);
    let is_image = mime.starts_with("image/");
    let numstat_args = diff_args(bucket == "staged", true);
    let is_binary = is_image
        || forgepad_core::command::command_output("git", &numstat_args, Some(path))
            .map(|out| out.split_whitespace().take(2).any(|part| part == "-"))
            .unwrap_or(false);
    let new_content = if is_binary {
        None
    } else if bucket == "staged" {
        forgepad_core::command::command_output(
            "git",
            &["show", &format!(":{rel_path}")],
            Some(path),
        )
        .ok()
    } else {
        std::fs::read_to_string(&file_path).ok()
    };
    let old_specs = if bucket == "staged" {
        let head_path = old_path.as_deref().unwrap_or(&rel_path);
        let mut specs = vec![format!("HEAD:{head_path}")];
        if head_path != rel_path {
            specs.push(format!("HEAD:{rel_path}"));
        }
        specs
    } else {
        let mut specs = vec![format!(":{rel_path}")];
        if let Some(old_path) = old_path.as_deref() {
            if old_path != rel_path {
                specs.push(format!(":{old_path}"));
            }
        }
        specs
    };
    let old_content = if is_binary {
        None
    } else {
        old_specs.iter().find_map(|spec| {
            forgepad_core::command::command_output("git", &["show", spec], Some(path)).ok()
        })
    };
    let diff = json!({
        "path": rel_path,
        "oldPath": old_path,
        "patch": patch,
        "oldContent": old_content,
        "newContent": new_content,
        "status": status,
        "bucket": bucket,
        "isBinary": is_binary
    });
    preview_cache()
        .lock()
        .map_err(|error| error.to_string())?
        .insert_diff_preview(cache_key, diff.clone());
    Ok(diff)
}

fn git_commit_file_diff(params: Value) -> Result<Value, String> {
    let worktree_path = string_param(&params, "worktreePath")?;
    let commit_hash = string_param(&params, "commitHash")?;
    let rel_path = string_param(&params, "relPath")?;
    let status = string_param(&params, "status")?;
    let old_path = params
        .get("oldPath")
        .and_then(Value::as_str)
        .map(str::to_string);
    let path = Path::new(&worktree_path);

    let mut pathspecs = Vec::new();
    if let Some(old_path) = old_path.as_deref() {
        pathspecs.push(old_path);
    }
    pathspecs.push(rel_path.as_str());

    let mut patch_args = vec!["show", "--format=", "--find-renames", &commit_hash, "--"];
    patch_args.extend(pathspecs.iter().copied());
    let patch =
        forgepad_core::command::command_output("git", &patch_args, Some(path)).unwrap_or_default();

    let mut numstat_args = vec![
        "show",
        "--format=",
        "--numstat",
        "--find-renames",
        &commit_hash,
        "--",
    ];
    numstat_args.extend(pathspecs.iter().copied());
    let is_binary = forgepad_core::command::command_output("git", &numstat_args, Some(path))
        .map(|out| out.split_whitespace().take(2).any(|part| part == "-"))
        .unwrap_or(false);

    let new_content = if is_binary || status == "deleted" {
        None
    } else {
        forgepad_core::command::command_output(
            "git",
            &["show", &format!("{commit_hash}:{rel_path}")],
            Some(path),
        )
        .ok()
    };

    let old_content = if is_binary || status == "added" {
        None
    } else {
        let parent_spec_path = old_path.as_deref().unwrap_or(&rel_path);
        forgepad_core::command::command_output(
            "git",
            &["show", &format!("{commit_hash}^:{parent_spec_path}")],
            Some(path),
        )
        .ok()
    };

    Ok(json!({
        "path": rel_path,
        "oldPath": old_path,
        "patch": patch,
        "oldContent": old_content,
        "newContent": new_content,
        "status": status,
        "bucket": "staged",
        "commitHash": commit_hash,
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
