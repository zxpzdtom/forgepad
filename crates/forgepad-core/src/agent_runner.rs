use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::OnceLock;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Value};

use crate::pty::split_shell;

#[cfg(unix)]
use std::os::unix::process::CommandExt;

type EventEmitter = Arc<dyn Fn(Value) + Send + Sync + 'static>;

static NEXT_RUN_ID: AtomicU64 = AtomicU64::new(1);
static RUNNING_TURNS: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();
static RUNNING_TURN_CONTROLS: OnceLock<Mutex<HashMap<String, RunningTurnControl>>> =
    OnceLock::new();
static PENDING_APPROVALS: OnceLock<Mutex<HashMap<String, mpsc::Sender<AgentApprovalDecision>>>> =
    OnceLock::new();
const APPROVAL_TIMEOUT: Duration = Duration::from_secs(120);

fn running_turns() -> &'static Mutex<HashMap<String, u32>> {
    RUNNING_TURNS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn running_turn_controls() -> &'static Mutex<HashMap<String, RunningTurnControl>> {
    RUNNING_TURN_CONTROLS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn pending_approvals() -> &'static Mutex<HashMap<String, mpsc::Sender<AgentApprovalDecision>>> {
    PENDING_APPROVALS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Clone)]
struct RunningTurnControl {
    pid: u32,
    writer: Arc<Mutex<ChildStdin>>,
    thread_id: Arc<Mutex<Option<String>>>,
    turn_id: Arc<Mutex<Option<String>>>,
    pending_requests: Arc<Mutex<Vec<PendingServerRequest>>>,
}

#[derive(Clone, Debug)]
struct PendingServerRequest {
    id: Value,
    method: String,
    params: Value,
}

#[derive(Clone, Debug)]
pub struct AgentApprovalDecision {
    decision: String,
    answers: Option<Value>,
}

pub fn resolve_permission(
    pty_id: &str,
    decision: &str,
    answers: Option<Value>,
) -> Result<bool, String> {
    let sender = pending_approvals()
        .lock()
        .map_err(|_| "Agent approval registry lock failed.".to_string())?
        .remove(pty_id);
    let Some(sender) = sender else {
        return Ok(false);
    };
    let _ = sender.send(AgentApprovalDecision {
        decision: decision.to_string(),
        answers,
    });
    Ok(true)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunTurnResult {
    pub run_id: String,
}

pub fn run_turn(
    worktree_path: &str,
    agent_command: &str,
    prompt: &str,
    session_id: Option<&str>,
    pty_id: Option<&str>,
    requested_run_id: Option<&str>,
    image_data_urls: Vec<String>,
    emit: EventEmitter,
) -> Result<AgentRunTurnResult, String> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err("Prompt is empty.".to_string());
    }

    let parts = split_shell(agent_command.trim());
    let (program, configured_args) = parts
        .split_first()
        .ok_or_else(|| "Agent command is empty.".to_string())?;

    let binary_name = Path::new(program)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(program)
        .to_ascii_lowercase();

    if !binary_name.contains("codex") {
        return Err(
            "UI agent mode currently supports Codex CLI commands. Use Terminal mode for this preset."
                .to_string(),
        );
    }

    let run_id = requested_run_id
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| {
            format!(
                "run-{}-{}",
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|duration| duration.as_millis())
                    .unwrap_or(0),
                NEXT_RUN_ID.fetch_add(1, Ordering::Relaxed)
            )
        });

    let input = AgentTurnInput {
        run_id: run_id.clone(),
        pty_id: pty_id.unwrap_or("").to_string(),
        worktree_path: worktree_path.to_string(),
        prompt: prompt.to_string(),
        program: program.to_string(),
        configured_args: configured_args.to_vec(),
        session_id: session_id
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string),
        image_data_urls,
    };

    thread::Builder::new()
        .name("forgepad-agent-turn".to_string())
        .spawn(move || run_app_server_turn(input, emit))
        .map_err(|error| format!("Failed to start agent turn: {error}"))?;

    Ok(AgentRunTurnResult { run_id })
}

pub fn cancel_turn(run_id: &str) -> Result<bool, String> {
    let control = running_turn_controls()
        .lock()
        .map_err(|_| "Agent turn registry lock failed.".to_string())?
        .get(run_id)
        .cloned();
    if let Some(control) = control {
        decline_pending_requests(&control.writer, &control.pending_requests);
        let thread_id = control
            .thread_id
            .lock()
            .ok()
            .and_then(|value| value.clone());
        let turn_id = control.turn_id.lock().ok().and_then(|value| value.clone());
        if let (Some(thread_id), Some(turn_id)) = (thread_id, turn_id) {
            let _ = send_json(
                &control.writer,
                json!({
                    "jsonrpc": "2.0",
                    "id": format!("interrupt-{run_id}"),
                    "method": "turn/interrupt",
                    "params": { "threadId": thread_id, "turnId": turn_id }
                }),
            );
        }
        thread::sleep(Duration::from_millis(150));
        terminate_process_group(control.pid);
        return Ok(true);
    }

    let pid = running_turns()
        .lock()
        .map_err(|_| "Agent turn registry lock failed.".to_string())?
        .get(run_id)
        .copied();
    let Some(pid) = pid else {
        return Ok(false);
    };
    terminate_process_group(pid);
    Ok(true)
}

pub fn undo_turn(run_id: &str) -> Result<bool, String> {
    let control = running_turn_controls()
        .lock()
        .map_err(|_| "Agent turn registry lock failed.".to_string())?
        .get(run_id)
        .cloned();
    if let Some(control) = control {
        let thread_id = control
            .thread_id
            .lock()
            .ok()
            .and_then(|value| value.clone());
        let turn_id = control.turn_id.lock().ok().and_then(|value| value.clone());
        if let (Some(thread_id), Some(turn_id)) = (thread_id, turn_id) {
            send_json(
                &control.writer,
                json!({
                    "jsonrpc": "2.0",
                    "id": format!("undo-{run_id}"),
                    "method": "turn/undo",
                    "params": { "threadId": thread_id, "turnId": turn_id }
                }),
            )?;
            return Ok(true);
        }
    }
    Ok(false)
}

fn terminate_process_group(pid: u32) {
    #[cfg(unix)]
    let _ = Command::new("kill")
        .arg("-TERM")
        .arg(format!("-{pid}"))
        .status();
    #[cfg(not(unix))]
    let _ = Command::new("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .status();
}

struct AgentTurnInput {
    run_id: String,
    pty_id: String,
    worktree_path: String,
    prompt: String,
    program: String,
    configured_args: Vec<String>,
    session_id: Option<String>,
    image_data_urls: Vec<String>,
}

fn run_app_server_turn(input: AgentTurnInput, emit: EventEmitter) {
    if let Err(error) = run_app_server_turn_inner(&input, &emit) {
        emit_agent_event(
            emit.as_ref(),
            "agent.turnFailed",
            &input.run_id,
            &input.pty_id,
            json!({ "message": error }),
        );
    }
}

fn run_app_server_turn_inner(input: &AgentTurnInput, emit: &EventEmitter) -> Result<(), String> {
    let mut args = strip_interactive_args(&input.configured_args);
    args.push("app-server".to_string());

    let mut command = Command::new(&input.program);
    command
        .args(args)
        .current_dir(&input.worktree_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start Codex app-server: {error}"))?;
    if let Ok(mut running) = running_turns().lock() {
        running.insert(input.run_id.clone(), child.id());
    }

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Codex app-server stdin is unavailable.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Codex app-server stdout is unavailable.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Codex app-server stderr is unavailable.".to_string())?;
    let writer = Arc::new(Mutex::new(stdin));
    let shared_thread_id = Arc::new(Mutex::new(input.session_id.clone()));
    let shared_turn_id = Arc::new(Mutex::new(None));
    let pending_requests = Arc::new(Mutex::new(Vec::new()));
    if let Ok(mut controls) = running_turn_controls().lock() {
        controls.insert(
            input.run_id.clone(),
            RunningTurnControl {
                pid: child.id(),
                writer: Arc::clone(&writer),
                thread_id: Arc::clone(&shared_thread_id),
                turn_id: Arc::clone(&shared_turn_id),
                pending_requests: Arc::clone(&pending_requests),
            },
        );
    }
    let stderr_buffer = Arc::new(Mutex::new(String::new()));
    let stderr_capture = Arc::clone(&stderr_buffer);
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            if let Ok(mut buffer) = stderr_capture.lock() {
                if buffer.len() > 8_192 {
                    let keep_from = buffer.len().saturating_sub(4_096);
                    *buffer = buffer[keep_from..].to_string();
                }
                buffer.push_str(&line);
                buffer.push('\n');
            }
        }
    });

    send_json(
        &writer,
        json!({
            "jsonrpc": "2.0",
            "id": "initialize",
            "method": "initialize",
            "params": {
                "clientInfo": { "name": "ForgePad", "title": "ForgePad", "version": "0.1.0" },
                "capabilities": { "experimentalApi": true }
            }
        }),
    )?;

    let mut state = AppServerTurnState {
        thread_id: input.session_id.clone(),
        turn_id: None,
        sent_turn_start: false,
        final_message: String::new(),
        thread_id_ref: shared_thread_id,
        turn_id_ref: shared_turn_id,
        pending_requests,
    };

    let reader = BufReader::new(stdout);
    for line in reader.lines() {
        let line =
            line.map_err(|error| format!("Failed to read Codex app-server output: {error}"))?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };

        if is_server_request(&value) {
            handle_app_server_request(input, emit.as_ref(), &writer, &mut state, &value)?;
            continue;
        }
        handle_app_server_message(input, emit.as_ref(), &writer, &mut state, &value)?;
        if is_turn_terminal_message(&value) {
            break;
        }
    }

    let _ = child.kill();
    let _ = child.wait();
    if let Ok(mut running) = running_turns().lock() {
        running.remove(&input.run_id);
    }
    if let Ok(mut controls) = running_turn_controls().lock() {
        controls.remove(&input.run_id);
    }

    if state.sent_turn_start {
        Ok(())
    } else {
        let stderr = stderr_buffer
            .lock()
            .map(|buffer| buffer.trim().to_string())
            .unwrap_or_default();
        Err(if stderr.is_empty() {
            "Codex app-server exited before the turn started.".to_string()
        } else {
            stderr
        })
    }
}

fn is_server_request(value: &Value) -> bool {
    value.get("id").is_some()
        && value.get("method").and_then(Value::as_str).is_some()
        && value.get("result").is_none()
}

fn handle_app_server_request(
    input: &AgentTurnInput,
    emit: &dyn Fn(Value),
    writer: &Arc<Mutex<impl Write>>,
    state: &mut AppServerTurnState,
    value: &Value,
) -> Result<(), String> {
    let Some(request_id) = value.get("id").cloned() else {
        return Ok(());
    };
    let method = value
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let params = value.get("params").cloned().unwrap_or(Value::Null);

    if !method.ends_with("requestApproval")
        && !method.ends_with("request_approval")
        && method != "item/tool/requestUserInput"
        && method != "tool/requestUserInput"
        && method != "mcpServer/elicitation/request"
    {
        send_json(
            writer,
            json!({
                "jsonrpc": "2.0",
                "id": request_id,
                "error": { "code": -32601, "message": format!("Unsupported request method: {method}") }
            }),
        )?;
        return Ok(());
    }

    if let Ok(mut pending) = state.pending_requests.lock() {
        pending.push(PendingServerRequest {
            id: request_id.clone(),
            method: method.to_string(),
            params: params.clone(),
        });
    }

    let (sender, receiver) = mpsc::channel();
    if let Ok(mut pending) = pending_approvals().lock() {
        if let Some(existing) = pending.remove(&input.pty_id) {
            let _ = existing.send(AgentApprovalDecision {
                decision: "deny".to_string(),
                answers: None,
            });
        }
        pending.insert(input.pty_id.clone(), sender);
    }

    emit(json!({
        "type": "agent.statusUpdate",
        "payload": { "ptyId": input.pty_id, "status": "permission" }
    }));
    emit(json!({
        "type": "agent.permissionRequest",
        "payload": {
            "ptyId": input.pty_id,
            "toolName": approval_tool_name(method, &params),
            "toolInput": approval_tool_input(method, &params),
            "permissionSuggestions": [],
            "questions": approval_questions(method, &params)
        }
    }));

    let decision = receiver
        .recv_timeout(APPROVAL_TIMEOUT)
        .unwrap_or(AgentApprovalDecision {
            decision: "deny".to_string(),
            answers: None,
        });
    if let Ok(mut pending) = pending_approvals().lock() {
        pending.remove(&input.pty_id);
    }
    if let Ok(mut pending) = state.pending_requests.lock() {
        pending.retain(|request| request.id != request_id);
    }
    emit(json!({
        "type": "agent.permissionClear",
        "payload": { "ptyId": input.pty_id }
    }));
    emit(json!({
        "type": "agent.statusUpdate",
        "payload": { "ptyId": input.pty_id, "status": "working" }
    }));

    send_json(
        writer,
        json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": approval_response_result(method, &params, &decision)
        }),
    )?;
    if state.thread_id.is_none() {
        if let Some(thread_id) = extract_thread_id(&params) {
            set_thread_id(state, thread_id);
        }
    }
    Ok(())
}

fn approval_tool_name(method: &str, params: &Value) -> String {
    if let Some(tool) = params.get("toolName").and_then(Value::as_str) {
        return tool.to_string();
    }
    if method.contains("fileChange") || method.contains("file_change") {
        return "File change".to_string();
    }
    if method.contains("commandExecution") || method.contains("command_execution") {
        return "Command".to_string();
    }
    if method.contains("permissions") {
        return "Permissions".to_string();
    }
    method.to_string()
}

fn approval_tool_input(method: &str, params: &Value) -> Value {
    let mut input = params.clone();
    if let Some(object) = input.as_object_mut() {
        object
            .entry("requestMethod".to_string())
            .or_insert_with(|| Value::String(method.to_string()));
    }
    input
}

fn approval_questions(method: &str, params: &Value) -> Value {
    if method == "item/tool/requestUserInput" || method == "tool/requestUserInput" {
        return params
            .get("questions")
            .or_else(|| params.pointer("/input/questions"))
            .cloned()
            .unwrap_or_else(|| json!([]));
    }
    if method == "mcpServer/elicitation/request" {
        let message = params
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("需要你继续确认");
        return json!([{ "question": message, "options": [] }]);
    }
    json!([])
}

fn approval_response_result(
    method: &str,
    params: &Value,
    decision: &AgentApprovalDecision,
) -> Value {
    if method == "item/tool/requestUserInput" || method == "tool/requestUserInput" {
        return json!({ "answers": normalize_user_input_answers(decision.answers.clone()) });
    }
    if method == "mcpServer/elicitation/request" {
        let action = if decision.decision == "allow" || decision.decision == "accept" {
            "accept"
        } else {
            "decline"
        };
        return json!({ "action": action });
    }

    let accepted = matches!(
        decision.decision.as_str(),
        "allow" | "allowAlways" | "accept" | "acceptForSession"
    );
    if method == "item/permissions/requestApproval" {
        return json!({
            "permissions": if accepted {
                params.get("permissions").cloned().unwrap_or_else(|| json!({}))
            } else {
                json!({})
            },
            "scope": "turn"
        });
    }

    let app_server_decision = if accepted {
        if decision.decision == "allowAlways"
            && (method == "item/commandExecution/requestApproval"
                || method == "item/command_execution/request_approval")
        {
            "acceptForSession"
        } else {
            "accept"
        }
    } else {
        "decline"
    };
    json!({ "decision": app_server_decision })
}

fn normalize_user_input_answers(answers: Option<Value>) -> Value {
    let Some(Value::Object(map)) = answers else {
        return json!({});
    };
    let normalized = map
        .into_iter()
        .map(|(key, value)| {
            let answer_values = match value {
                Value::Array(values) => values,
                Value::String(value) if value.trim().is_empty() => Vec::new(),
                Value::String(value) => vec![Value::String(value)],
                other => vec![other],
            };
            (key, json!({ "answers": answer_values }))
        })
        .collect::<serde_json::Map<_, _>>();
    Value::Object(normalized)
}

fn extract_thread_id(value: &Value) -> Option<String> {
    ["threadId", "thread_id"]
        .iter()
        .find_map(|key| value.get(key).and_then(Value::as_str))
        .map(str::to_string)
}

fn decline_pending_requests(
    writer: &Arc<Mutex<ChildStdin>>,
    pending_requests: &Arc<Mutex<Vec<PendingServerRequest>>>,
) {
    let requests = pending_requests
        .lock()
        .map(|mut pending| pending.drain(..).collect::<Vec<_>>())
        .unwrap_or_default();
    for request in requests {
        let decision = AgentApprovalDecision {
            decision: "deny".to_string(),
            answers: None,
        };
        let _ = send_json(
            writer,
            json!({
                "jsonrpc": "2.0",
                "id": request.id,
                "result": approval_response_result(&request.method, &request.params, &decision)
            }),
        );
    }
}

struct AppServerTurnState {
    thread_id: Option<String>,
    turn_id: Option<String>,
    sent_turn_start: bool,
    final_message: String,
    thread_id_ref: Arc<Mutex<Option<String>>>,
    turn_id_ref: Arc<Mutex<Option<String>>>,
    pending_requests: Arc<Mutex<Vec<PendingServerRequest>>>,
}

fn handle_app_server_message(
    input: &AgentTurnInput,
    emit: &dyn Fn(Value),
    writer: &Arc<Mutex<impl Write>>,
    state: &mut AppServerTurnState,
    value: &Value,
) -> Result<(), String> {
    if value.get("id").and_then(Value::as_str) == Some("initialize") {
        send_json(
            writer,
            json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
        )?;
        if let Some(thread_id) = state.thread_id.clone() {
            emit_turn_started(input, emit, &thread_id);
            send_turn_start(
                writer,
                &thread_id,
                &input.worktree_path,
                &input.prompt,
                &input.image_data_urls,
            )?;
            state.sent_turn_start = true;
        } else {
            send_json(
                writer,
                json!({
                    "jsonrpc": "2.0",
                    "id": "thread-start",
                    "method": "thread/start",
                    "params": { "cwd": input.worktree_path }
                }),
            )?;
        }
        return Ok(());
    }

    if value.get("id").and_then(Value::as_str) == Some("thread-start") {
        if let Some(thread_id) = value
            .pointer("/result/thread/id")
            .and_then(Value::as_str)
            .map(str::to_string)
        {
            set_thread_id(state, thread_id.clone());
            emit_turn_started(input, emit, &thread_id);
            send_turn_start(
                writer,
                &thread_id,
                &input.worktree_path,
                &input.prompt,
                &input.image_data_urls,
            )?;
            state.sent_turn_start = true;
        }
        return Ok(());
    }

    let method = value
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let params = value.get("params").unwrap_or(&Value::Null);
    match method {
        "thread/started" => {
            if state.thread_id.is_none() {
                if let Some(thread_id) = params.pointer("/thread/id").and_then(Value::as_str) {
                    set_thread_id(state, thread_id.to_string());
                }
            }
        }
        "turn/started" => {
            if let Some(turn_id) = params.pointer("/turn/id").and_then(Value::as_str) {
                set_turn_id(state, turn_id.to_string());
            }
            emit_agent_event(
                emit,
                "agent.turnStatus",
                &input.run_id,
                &input.pty_id,
                json!({ "status": "running", "threadId": state.thread_id }),
            );
        }
        "item/started"
        | "item/autoApprovalReview/started"
        | "item/autoApprovalReview/completed"
        | "item/reasoning/textDelta"
        | "item/reasoning/summaryTextDelta"
        | "item/reasoning/summaryPartAdded"
        | "item/commandExecution/outputDelta"
        | "item/commandExecution/terminalInteraction"
        | "item/fileChange/outputDelta"
        | "item/fileChange/patchUpdated"
        | "item/plan/delta"
        | "turn/plan/updated"
        | "hook/started"
        | "hook/completed"
        | "serverRequest/resolved"
        | "item/mcpToolCall/progress"
        | "mcpServer/oauthLogin/completed"
        | "model/rerouted"
        | "model/verification"
        | "configWarning"
        | "deprecationNotice"
        | "guardianWarning" => {
            emit_agent_event(
                emit,
                "agent.turnItem",
                &input.run_id,
                &input.pty_id,
                json!({ "method": method, "params": params, "threadId": state.thread_id, "turnId": state.turn_id }),
            );
        }
        "item/agentMessage/delta"
        | "codex/event/agent_message_content_delta"
        | "codex/event/agent_message_delta" => {
            emit_agent_event(
                emit,
                "agent.turnItem",
                &input.run_id,
                &input.pty_id,
                json!({ "method": method, "params": params, "threadId": state.thread_id, "turnId": state.turn_id }),
            );
            if let Some(delta) = extract_delta(params) {
                state.final_message.push_str(&delta);
                emit_agent_event(
                    emit,
                    "agent.turnDelta",
                    &input.run_id,
                    &input.pty_id,
                    json!({ "delta": delta, "threadId": state.thread_id }),
                );
            }
        }
        "item/completed" | "codex/event/item_completed" | "codex/event/agent_message" => {
            emit_agent_event(
                emit,
                "agent.turnItem",
                &input.run_id,
                &input.pty_id,
                json!({ "method": method, "params": params, "threadId": state.thread_id, "turnId": state.turn_id }),
            );
            if let Some(text) = extract_completed_agent_message(params) {
                state.final_message = text.clone();
                emit_agent_event(
                    emit,
                    "agent.turnMessage",
                    &input.run_id,
                    &input.pty_id,
                    json!({ "text": text, "threadId": state.thread_id }),
                );
            }
        }
        "turn/diff/updated" | "codex/event/turn_diff_updated" | "codex/event/turn_diff" => {
            emit_agent_event(
                emit,
                "agent.turnItem",
                &input.run_id,
                &input.pty_id,
                json!({ "method": method, "params": params, "threadId": state.thread_id, "turnId": state.turn_id }),
            );
            emit_agent_event(
                emit,
                "agent.turnDiff",
                &input.run_id,
                &input.pty_id,
                params.clone(),
            );
        }
        "turn/completed" => {
            emit_agent_event(
                emit,
                "agent.turnCompleted",
                &input.run_id,
                &input.pty_id,
                json!({ "threadId": state.thread_id, "finalMessage": state.final_message }),
            );
        }
        "turn/failed" | "error" => {
            emit_agent_event(
                emit,
                "agent.turnFailed",
                &input.run_id,
                &input.pty_id,
                json!({ "threadId": state.thread_id, "message": params.to_string() }),
            );
        }
        "thread/tokenUsage/updated" | "codex/event/token_count" => {
            emit_agent_event(
                emit,
                "agent.tokenUsage",
                &input.run_id,
                &input.pty_id,
                json!({ "tokenUsage": params.get("tokenUsage").unwrap_or(params), "threadId": state.thread_id, "turnId": state.turn_id }),
            );
        }
        "thread/name/updated" | "codex/event/thread_name_updated" => {
            let name = params.pointer("/thread/name").and_then(Value::as_str)
                .or_else(|| params.pointer("/name").and_then(Value::as_str));
            if let Some(name) = name {
                emit_agent_event(
                    emit,
                    "agent.renameTab",
                    &input.run_id,
                    &input.pty_id,
                    json!({ "ptyId": input.pty_id, "title": name }),
                );
            }
        }
        "thread/compacted" => {
            emit_agent_event(
                emit,
                "agent.turnItem",
                &input.run_id,
                &input.pty_id,
                json!({ "method": "thread/compacted", "params": params, "threadId": state.thread_id, "turnId": state.turn_id }),
            );
        }
        "thread/archived" | "thread/closed" => {
            emit_agent_event(
                emit,
                "agent.turnItem",
                &input.run_id,
                &input.pty_id,
                json!({ "method": method, "params": params, "threadId": state.thread_id, "turnId": state.turn_id }),
            );
        }
        "codex/event/undo_started" | "codex/event/undo_completed" => {
            emit_agent_event(
                emit,
                "agent.turnItem",
                &input.run_id,
                &input.pty_id,
                json!({ "method": method, "params": params, "threadId": state.thread_id, "turnId": state.turn_id }),
            );
        }
        "codex/event/collab_agent_spawn_begin"
        | "codex/event/collab_agent_spawn_end"
        | "codex/event/collab_agent_interaction_begin"
        | "codex/event/collab_agent_interaction_end"
        | "codex/event/collab_resume_begin"
        | "codex/event/collab_resume_end"
        | "codex/event/collab_waiting_begin"
        | "codex/event/collab_waiting_end"
        | "codex/event/collab_close_begin"
        | "codex/event/collab_close_end" => {
            emit_agent_event(
                emit,
                "agent.turnItem",
                &input.run_id,
                &input.pty_id,
                json!({ "method": method, "params": params, "threadId": state.thread_id, "turnId": state.turn_id }),
            );
        }
        "rawResponseItem/completed" => {
            emit_agent_event(
                emit,
                "agent.turnItem",
                &input.run_id,
                &input.pty_id,
                json!({ "method": method, "params": params, "threadId": state.thread_id, "turnId": state.turn_id }),
            );
        }
        _ => {}
    }

    Ok(())
}

fn emit_turn_started(input: &AgentTurnInput, emit: &dyn Fn(Value), thread_id: &str) {
    emit_agent_event(
        emit,
        "agent.turnStarted",
        &input.run_id,
        &input.pty_id,
        json!({ "threadId": thread_id }),
    );
}

fn set_thread_id(state: &mut AppServerTurnState, thread_id: String) {
    state.thread_id = Some(thread_id.clone());
    if let Ok(mut shared) = state.thread_id_ref.lock() {
        *shared = Some(thread_id);
    }
}

fn set_turn_id(state: &mut AppServerTurnState, turn_id: String) {
    state.turn_id = Some(turn_id.clone());
    if let Ok(mut shared) = state.turn_id_ref.lock() {
        *shared = Some(turn_id);
    }
}

fn send_turn_start(
    writer: &Arc<Mutex<impl Write>>,
    thread_id: &str,
    cwd: &str,
    prompt: &str,
    image_data_urls: &[String],
) -> Result<(), String> {
    let mut input_items = vec![json!({ "type": "text", "text": prompt, "text_elements": [] })];
    input_items.extend(
        image_data_urls
            .iter()
            .filter(|url| url.starts_with("data:image/"))
            .map(|url| json!({ "type": "image", "url": url })),
    );
    send_json(
        writer,
        json!({
            "jsonrpc": "2.0",
            "id": "turn-start",
            "method": "turn/start",
            "params": {
                "threadId": thread_id,
                "cwd": cwd,
                "input": input_items
            }
        }),
    )
}

fn send_json(writer: &Arc<Mutex<impl Write>>, value: Value) -> Result<(), String> {
    let mut writer = writer
        .lock()
        .map_err(|_| "Codex app-server stdin lock failed.".to_string())?;
    serde_json::to_writer(&mut *writer, &value).map_err(|error| error.to_string())?;
    writer.write_all(b"\n").map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

fn emit_agent_event(
    emit: &dyn Fn(Value),
    event_type: &str,
    run_id: &str,
    pty_id: &str,
    payload: Value,
) {
    emit(json!({
        "type": event_type,
        "payload": {
            "runId": run_id,
            "ptyId": pty_id,
            "data": payload
        }
    }));
}

fn extract_delta(params: &Value) -> Option<String> {
    ["delta", "text", "content"]
        .iter()
        .find_map(|key| params.get(key).and_then(Value::as_str))
        .map(str::to_string)
        .or_else(|| params.get("event").and_then(|event| extract_delta(event)))
}

fn extract_completed_agent_message(params: &Value) -> Option<String> {
    if let Some(text) = params.get("text").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    if let Some(text) = params.get("message").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    let item = params.get("item").unwrap_or(params);
    let item_type = item.get("type").and_then(Value::as_str).unwrap_or_default();
    let normalized_item_type = item_type.replace(['_', '-'], "").to_ascii_lowercase();
    if matches!(
        normalized_item_type.as_str(),
        "agentmessage" | "assistantmessage" | "message" | "exitedreviewmode"
    ) {
        return extract_message_text(item);
    }
    None
}

fn extract_message_text(value: &Value) -> Option<String> {
    ["text", "message", "review"]
        .iter()
        .find_map(|key| value.get(key).and_then(Value::as_str))
        .filter(|text| !text.trim().is_empty())
        .map(str::to_string)
        .or_else(|| {
            let parts = value
                .get("content")
                .and_then(Value::as_array)?
                .iter()
                .filter_map(|item| {
                    let content_type = item.get("type").and_then(Value::as_str).unwrap_or("text");
                    let normalized = content_type.replace(['_', '-'], "").to_ascii_lowercase();
                    matches!(
                        normalized.as_str(),
                        "text" | "inputtext" | "outputtext" | "message"
                    )
                    .then(|| {
                        item.get("text")
                            .or_else(|| item.get("delta"))
                            .or_else(|| item.pointer("/data/text"))
                            .and_then(Value::as_str)
                    })
                    .flatten()
                })
                .filter(|text| !text.trim().is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>();
            (!parts.is_empty()).then(|| parts.join("\n"))
        })
}

fn is_turn_terminal_message(value: &Value) -> bool {
    matches!(
        value.get("method").and_then(Value::as_str),
        Some("turn/completed" | "turn/failed" | "error")
    )
}

fn strip_interactive_args(args: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    let mut skip_next = false;
    for arg in args {
        if skip_next {
            skip_next = false;
            continue;
        }
        match arg.as_str() {
            "--remote" | "--remote-auth-token-env" => skip_next = true,
            "--no-alt-screen" => {}
            value
                if value.starts_with("--remote=")
                    || value.starts_with("--remote-auth-token-env=") => {}
            value => out.push(value.to_string()),
        }
    }
    out
}
