use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use chrono::Utc;
use forgepad_core::{command as core_command, context as core_context, files as core_files, git as core_git, lsp as core_lsp, pty as core_pty, state as core_state};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

struct AppState {
    ptys: core_pty::PtyManager,
}

impl AppState {
    fn new(app: AppHandle) -> Self {
        let data_app = app.clone();
        let exit_app = app;
        Self {
            ptys: core_pty::PtyManager::new(
                move |id, data| {
                    let _ = data_app.emit(&format!("pty:data:{id}"), data);
                },
                move |id, exit_code| {
                    let _ = exit_app.emit(&format!("pty:exit:{id}"), json!({ "exitCode": exit_code }));
                },
            ),
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenProjectResult {
    name: String,
    repo_path: String,
    branch: String,
    is_git_repo: bool,
}

fn err<E: std::fmt::Display>(e: E) -> String { e.to_string() }

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
        OpenProjectResult { name: p.file_name().and_then(|s| s.to_str()).unwrap_or("Project").to_string(), branch: core_git::current_branch(&p), is_git_repo: core_git::is_git_repo(&p), repo_path }
    }))
}

#[tauri::command]
async fn app_open_project_from_path(selected_path: String) -> Result<Option<OpenProjectResult>, String> {
    let p = PathBuf::from(&selected_path);
    if !p.exists() { return Ok(None); }
    Ok(Some(OpenProjectResult { name: p.file_name().and_then(|s| s.to_str()).unwrap_or("Project").to_string(), branch: core_git::current_branch(&p), is_git_repo: core_git::is_git_repo(&p), repo_path: selected_path }))
}

#[tauri::command]
async fn app_show_emoji_panel() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { let _ = core_command::command_status("osascript", &["-e", "tell application \"System Events\" to key code 49 using {control down, command down}"], None); }
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
    core_state::load_state()
}

#[tauri::command]
async fn state_save(state: Value) -> Result<(), String> {
    core_state::save_state(&state)
}

#[tauri::command]
async fn git_current_branch(worktree_path: String) -> Result<String, String> { Ok(core_git::current_branch(Path::new(&worktree_path))) }

#[tauri::command]
async fn git_status(worktree_path: String) -> Result<Vec<core_git::FileStatus>, String> { core_git::collect_status(Path::new(&worktree_path)) }

#[tauri::command]
async fn git_branch_stats(worktree_path: String) -> Result<core_git::BranchStats, String> { Ok(core_git::branch_stats(Path::new(&worktree_path))) }

#[tauri::command]
async fn git_file_diff(worktree_path: String, rel_path: String, bucket: String, status: String, old_path: Option<String>) -> Result<Value, String> {
    let p = Path::new(&worktree_path);
    let patch = if bucket == "staged" { core_command::command_output("git", &["diff", "--cached", "--", &rel_path], Some(p)).unwrap_or_default() }
    else if bucket == "untracked" { String::new() }
    else { core_command::command_output("git", &["diff", "--", &rel_path], Some(p)).unwrap_or_default() };
    let new_content = fs::read_to_string(core_files::resolve_inside_root(&worktree_path, &rel_path)?).ok();
    Ok(json!({"path": rel_path, "oldPath": old_path, "patch": patch, "newContent": new_content, "status": status, "bucket": bucket, "isBinary": false}))
}

#[tauri::command]
async fn git_stage(worktree_path: String, paths: Vec<String>) -> Result<(), String> { core_git::stage(Path::new(&worktree_path), &paths) }

#[tauri::command]
async fn git_unstage(worktree_path: String, paths: Vec<String>) -> Result<(), String> { core_git::unstage(Path::new(&worktree_path), &paths) }

#[tauri::command]
async fn git_discard(worktree_path: String, entries: Vec<core_git::DiscardEntry>) -> Result<(), String> { core_git::discard(Path::new(&worktree_path), &entries) }

#[tauri::command]
async fn git_commit(worktree_path: String, message: String) -> Result<(), String> { core_git::commit(Path::new(&worktree_path), &message) }
#[tauri::command]
async fn git_push(worktree_path: String) -> Result<(), String> { core_git::push(Path::new(&worktree_path)) }
#[tauri::command]
async fn git_pull(worktree_path: String) -> Result<(), String> { core_git::pull(Path::new(&worktree_path)) }
#[tauri::command]
async fn git_fetch(repo_path: String) -> Result<(), String> { core_git::fetch(Path::new(&repo_path)) }
#[tauri::command]
async fn git_remote_branches(repo_path: String) -> Result<Vec<String>, String> { core_git::remote_branches(Path::new(&repo_path)) }
#[tauri::command]
async fn git_pr_number(_worktree_path: String) -> Result<Option<Value>, String> { Ok(None) }
#[tauri::command]
async fn git_generate_commit_msg(worktree_path: String, _prompt_template: String) -> Result<String, String> { Ok(core_git::generate_commit_message(Path::new(&worktree_path))) }
#[tauri::command]
async fn git_worktree_add(repo_path: String, branch: String, track_remote: Option<bool>, worktree_base_dir: Option<String>) -> Result<core_git::WorktreeAddResult, String> { core_git::add_worktree(Path::new(&repo_path), &branch, track_remote.unwrap_or(false), worktree_base_dir.as_deref()) }
#[tauri::command]
async fn git_worktree_remove(repo_path: String, worktree_path: String, _branch: String) -> Result<(), String> { core_git::remove_worktree(Path::new(&repo_path), &worktree_path) }
#[tauri::command]
async fn git_scan_worktrees(base_dir: String) -> Result<Vec<core_git::WorktreeSummary>, String> { core_git::scan_worktrees(base_dir) }

#[tauri::command]
async fn fs_tree_with_status(worktree_path: String) -> Result<Vec<core_files::FileNode>, String> { core_files::build_tree(Path::new(&worktree_path)) }
#[tauri::command]
async fn fs_list_files(worktree_path: String) -> Result<Vec<String>, String> { core_files::list_files(&worktree_path) }
#[tauri::command]
async fn fs_read_file(worktree_path: String, rel_path: String) -> Result<String, String> { core_files::read_file(&worktree_path, &rel_path) }
#[tauri::command]
async fn fs_read_file_data_url(worktree_path: String, rel_path: String) -> Result<String, String> { core_files::read_file_data_url(&worktree_path, &rel_path) }
#[tauri::command]
async fn fs_read_abs_file(abs_path: String) -> Result<String, String> { fs::read_to_string(abs_path).map_err(err) }
#[tauri::command]
async fn fs_read_abs_file_data_url(abs_path: String) -> Result<String, String> {
    let path = PathBuf::from(abs_path);
    let data = fs::read(&path).map_err(err)?;
    Ok(format!("data:{};base64,{}", core_files::mime_for(&path), BASE64.encode(data)))
}
#[tauri::command]
async fn fs_write_file(worktree_path: String, rel_path: String, content: String) -> Result<(), String> { core_files::write_file(&worktree_path, &rel_path, &content) }
#[tauri::command]
async fn fs_watch(worktree_path: String) -> Result<String, String> { Ok(format!("watch:{}", worktree_path)) }
#[tauri::command]
async fn fs_unwatch(_watch_id: String) -> Result<(), String> { Ok(()) }

#[tauri::command]
async fn pty_create(_app: AppHandle, state: tauri::State<'_, AppState>, worktree_path: String, shell: Option<String>, command: Option<String>, extra_env: Option<std::collections::HashMap<String, String>>) -> Result<String, String> { state.ptys.create(worktree_path, shell, command, extra_env) }
#[tauri::command]
async fn pty_write(state: tauri::State<'_, AppState>, id: String, data: String) -> Result<(), String> { state.ptys.write(&id, &data) }
#[tauri::command]
async fn pty_resize(state: tauri::State<'_, AppState>, id: String, cols: u16, rows: u16) -> Result<(), String> { state.ptys.resize(&id, cols, rows) }
#[tauri::command]
async fn pty_destroy(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> { state.ptys.destroy(&id) }
#[tauri::command]
async fn pty_reattach(state: tauri::State<'_, AppState>, id: String) -> Result<core_pty::PtyReplay, String> { Ok(state.ptys.reattach(&id)) }

#[tauri::command]
async fn context_create_bundle(input: core_context::BundleInput) -> Result<core_context::ContextBundleResult, String> { core_context::create_bundle(input) }

#[tauri::command]
async fn shell_open_external(url: String) -> Result<(), String> { open_target(&url) }
#[tauri::command]
async fn shell_open_path(full_path: String) -> Result<(), String> { open_target(&full_path) }
#[tauri::command]
async fn shell_show_item_in_folder(full_path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        core_command::command_status("open", &["-R", &full_path], None)
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
        core_command::command_status("open", &["-a", "Terminal", &full_path], None)
    }
    #[cfg(not(target_os = "macos"))]
    {
        open_target(&full_path)
    }
}
#[tauri::command]
async fn shell_open_in_ide(full_path: String) -> Result<(), String> { core_command::command_status("code", &[&full_path], None).or_else(|_| open_target(&full_path)) }
#[tauri::command]
async fn shell_detect_ides() -> Result<Vec<Value>, String> { Ok(vec![json!({"id":"vscode","label":"VS Code","command":"code","appName":"Visual Studio Code"})]) }
#[tauri::command]
async fn shell_open_with_ide(full_path: String, _ide_id: String) -> Result<(), String> { shell_open_in_ide(full_path).await }
#[tauri::command]
async fn shell_detect_terminals() -> Result<Vec<Value>, String> { Ok(vec![json!({"id":"terminal","label":"Terminal","appName":"Terminal"})]) }
#[tauri::command]
async fn shell_open_with_terminal(full_path: String, _terminal_id: String) -> Result<(), String> { shell_open_in_terminal(full_path).await }
fn open_target(target: &str) -> Result<(), String> { #[cfg(target_os="macos")] { return core_command::command_status("open", &[target], None); } #[cfg(target_os="windows")] { return core_command::command_status("cmd", &["/C", "start", target], None); } #[cfg(target_os="linux")] { return core_command::command_status("xdg-open", &[target], None); } #[allow(unreachable_code)] Ok(()) }

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
async fn lsp_get_definition(worktree_path: String, token: String) -> Result<Vec<core_lsp::LspLocation>, String> { core_lsp::get_definition(Path::new(&worktree_path), &token) }
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            app.manage(AppState::new(app.handle().clone()));
            Ok(())
        })
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
