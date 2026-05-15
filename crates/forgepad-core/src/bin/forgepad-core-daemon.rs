use std::collections::HashMap;
use std::io::{self, BufRead, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};

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
            Ok(request) => handle_request(&ptys, hooks.as_ref(), request),
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
    hooks: Option<&hooks::HookServer>,
    request: Request,
) -> Response {
    match dispatch(ptys, hooks, &request.command, request.params) {
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
        "fs.readFileDataUrl" => {
            let worktree_path = string_param(&params, "worktreePath")?;
            let rel_path = string_param(&params, "relPath")?;
            Ok(json!(files::read_file_data_url(worktree_path, &rel_path)?))
        }
        "fs.readAbsFile" => {
            let abs_path = string_param(&params, "absPath")?;
            Ok(json!(files::read_abs_file(abs_path)?))
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
    let new_content =
        std::fs::read_to_string(files::resolve_inside_root(&worktree_path, &rel_path)?).ok();
    Ok(json!({
        "path": rel_path,
        "oldPath": old_path,
        "patch": patch,
        "newContent": new_content,
        "status": status,
        "bucket": bucket,
        "isBinary": false
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
