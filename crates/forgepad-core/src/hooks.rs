use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};

type EventHandler = Arc<dyn Fn(Value) + Send + Sync + 'static>;

const PERMISSION_TIMEOUT: Duration = Duration::from_secs(120);

pub struct HookServer {
    port: u16,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<PermissionDecision>>>>,
    settings: Arc<Mutex<HookSettings>>,
    renamed_pty_ids: Arc<Mutex<HashSet<String>>>,
}

#[derive(Default)]
struct HookSettings {
    auto_generate_tab_title: bool,
    tab_title_prompt_template: String,
    rename_on_first_message_only: bool,
}

#[derive(Clone)]
pub struct PermissionDecision {
    decision: String,
    answers: Option<Value>,
}

impl HookServer {
    pub fn start(on_event: impl Fn(Value) + Send + Sync + 'static) -> Result<Self, String> {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let pending = Arc::new(Mutex::new(HashMap::new()));
        let settings = Arc::new(Mutex::new(HookSettings::default()));
        let renamed_pty_ids = Arc::new(Mutex::new(HashSet::new()));
        let on_event: EventHandler = Arc::new(on_event);

        let thread_pending = Arc::clone(&pending);
        let thread_settings = Arc::clone(&settings);
        let thread_renamed = Arc::clone(&renamed_pty_ids);
        let thread_events = Arc::clone(&on_event);

        thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let pending = Arc::clone(&thread_pending);
                let settings = Arc::clone(&thread_settings);
                let renamed = Arc::clone(&thread_renamed);
                let events = Arc::clone(&thread_events);
                thread::spawn(move || {
                    let _ = handle_stream(stream, pending, settings, renamed, events);
                });
            }
        });

        Ok(Self {
            port,
            pending,
            settings,
            renamed_pty_ids,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn resolve_permission(&self, pty_id: &str, decision: PermissionDecision) {
        if let Some(sender) = self.pending.lock().unwrap().remove(pty_id) {
            let _ = sender.send(decision);
        }
    }

    pub fn update_settings(&self, settings: &Value) {
        let mut current = self.settings.lock().unwrap();
        if let Some(value) = settings
            .get("autoGenerateTabTitle")
            .and_then(Value::as_bool)
        {
            current.auto_generate_tab_title = value;
        }
        if let Some(value) = settings
            .get("tabTitlePromptTemplate")
            .and_then(Value::as_str)
        {
            current.tab_title_prompt_template = value.to_string();
        }
        if let Some(value) = settings
            .get("renameOnFirstMessageOnly")
            .and_then(Value::as_bool)
        {
            current.rename_on_first_message_only = value;
        }
    }
}

impl Drop for HookServer {
    fn drop(&mut self) {
        self.pending.lock().unwrap().clear();
        self.renamed_pty_ids.lock().unwrap().clear();
    }
}

pub fn decision_from_params(params: &Value) -> Result<PermissionDecision, String> {
    Ok(PermissionDecision {
        decision: params
            .get("decision")
            .and_then(Value::as_str)
            .unwrap_or("allow")
            .to_string(),
        answers: params.get("answers").cloned(),
    })
}

fn handle_stream(
    mut stream: TcpStream,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<PermissionDecision>>>>,
    settings: Arc<Mutex<HookSettings>>,
    renamed_pty_ids: Arc<Mutex<HashSet<String>>>,
    on_event: EventHandler,
) -> Result<(), String> {
    let request = read_request(&stream)?;
    let path = request.path.split('?').next().unwrap_or("/");
    if path == "/health" {
        return write_response(&mut stream, 200, "text/plain", "ok");
    }
    if path != "/hook/notify" {
        return write_response(&mut stream, 404, "text/plain", "not found");
    }

    let query = parse_query(request.path.split_once('?').map(|(_, q)| q).unwrap_or(""));
    let event_type = query.get("eventType").cloned().unwrap_or_default();
    let pty_id = query.get("ptyId").cloned().unwrap_or_default();
    let source = query
        .get("source")
        .cloned()
        .unwrap_or_else(|| "claude".to_string());

    if event_type.is_empty() || pty_id.is_empty() {
        return write_response(&mut stream, 400, "text/plain", "missing params");
    }

    if let Some(status) = status_for_event(&event_type) {
        on_event(json!({
            "type": "agent.statusUpdate",
            "payload": { "ptyId": pty_id, "status": status }
        }));
    }

    match (event_type.as_str(), request.method.as_str()) {
        ("PermissionRequest", "POST") => {
            handle_permission_request(&mut stream, &pty_id, &request.body, pending, on_event)
        }
        ("UserPromptSubmit", "POST") => handle_user_prompt_submit(
            &mut stream,
            &pty_id,
            &source,
            &request.body,
            settings,
            renamed_pty_ids,
            on_event,
        ),
        ("Stop" | "StopFailure", "POST") => handle_stop(
            &mut stream,
            &pty_id,
            &request.body,
            renamed_pty_ids,
            on_event,
        ),
        _ => write_response(&mut stream, 200, "text/plain", "ok"),
    }
}

fn handle_permission_request(
    stream: &mut TcpStream,
    pty_id: &str,
    body: &str,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<PermissionDecision>>>>,
    on_event: EventHandler,
) -> Result<(), String> {
    let parsed = parse_permission_body(body);
    if let Some(existing) = pending.lock().unwrap().remove(pty_id) {
        let _ = existing.send(PermissionDecision {
            decision: "deny".to_string(),
            answers: None,
        });
    }

    let (sender, receiver) = mpsc::channel();
    pending.lock().unwrap().insert(pty_id.to_string(), sender);

    on_event(json!({
        "type": "agent.permissionRequest",
        "payload": {
            "ptyId": pty_id,
            "toolName": parsed.tool_name,
            "toolInput": parsed.tool_input,
            "permissionSuggestions": parsed.permission_suggestions,
            "questions": parsed.questions
        }
    }));

    let decision = receiver
        .recv_timeout(PERMISSION_TIMEOUT)
        .unwrap_or(PermissionDecision {
            decision: "allow".to_string(),
            answers: None,
        });
    pending.lock().unwrap().remove(pty_id);

    on_event(json!({
        "type": "agent.permissionClear",
        "payload": { "ptyId": pty_id }
    }));

    write_response(
        stream,
        200,
        "application/json",
        &permission_response_body(&decision, parsed.tool_input, parsed.permission_suggestions),
    )
}

fn handle_user_prompt_submit(
    stream: &mut TcpStream,
    pty_id: &str,
    source: &str,
    body: &str,
    settings: Arc<Mutex<HookSettings>>,
    renamed_pty_ids: Arc<Mutex<HashSet<String>>>,
    on_event: EventHandler,
) -> Result<(), String> {
    let prompt = parse_first_string(body, &["prompt", "user_prompt", "input", "message"]);
    if prompt.is_empty() {
        return write_response(stream, 200, "text/plain", "ok");
    }

    let rename_on_first_message_only = settings.lock().unwrap().rename_on_first_message_only;
    if rename_on_first_message_only && renamed_pty_ids.lock().unwrap().contains(pty_id) {
        on_event(
            json!({"type": "agent.userPrompt", "payload": { "ptyId": pty_id, "prompt": prompt }}),
        );
        return write_response(
            stream,
            200,
            "application/json",
            &user_prompt_submit_output(source, None),
        );
    }

    let quick_title = truncate_title(&prompt);
    on_event(
        json!({"type": "agent.renameTab", "payload": { "ptyId": pty_id, "title": quick_title }}),
    );
    on_event(json!({"type": "agent.userPrompt", "payload": { "ptyId": pty_id, "prompt": prompt }}));

    if rename_on_first_message_only {
        renamed_pty_ids.lock().unwrap().insert(pty_id.to_string());
    }

    write_response(
        stream,
        200,
        "application/json",
        &user_prompt_submit_output(source, Some(&quick_title)),
    )
}

fn handle_stop(
    stream: &mut TcpStream,
    pty_id: &str,
    body: &str,
    renamed_pty_ids: Arc<Mutex<HashSet<String>>>,
    on_event: EventHandler,
) -> Result<(), String> {
    let ai_message = parse_first_string(
        body,
        &[
            "last_assistant_message",
            "message",
            "text",
            "summary",
            "transcript_summary",
        ],
    );
    if !ai_message.is_empty() {
        on_event(
            json!({"type": "agent.completion", "payload": { "ptyId": pty_id, "aiMessage": ai_message }}),
        );
    }
    renamed_pty_ids.lock().unwrap().remove(pty_id);
    write_response(stream, 200, "text/plain", "ok")
}

struct Request {
    method: String,
    path: String,
    body: String,
}

fn read_request(stream: &TcpStream) -> Result<Request, String> {
    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let mut first_line = String::new();
    reader
        .read_line(&mut first_line)
        .map_err(|e| e.to_string())?;
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let path = parts.next().unwrap_or("/").to_string();

    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).map_err(|e| e.to_string())?;
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            break;
        }
        if let Some(value) = trimmed.strip_prefix("Content-Length:") {
            content_length = value.trim().parse().unwrap_or(0);
        } else if let Some(value) = trimmed.strip_prefix("content-length:") {
            content_length = value.trim().parse().unwrap_or(0);
        }
    }

    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        reader.read_exact(&mut body).map_err(|e| e.to_string())?;
    }

    Ok(Request {
        method,
        path,
        body: String::from_utf8_lossy(&body).to_string(),
    })
}

fn write_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &str,
) -> Result<(), String> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        _ => "Error",
    };
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.as_bytes().len()
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|e| e.to_string())
}

fn parse_query(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            Some((url_decode(key), url_decode(value)))
        })
        .collect()
}

fn url_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                if let Ok(hex) = u8::from_str_radix(&value[index + 1..index + 3], 16) {
                    out.push(hex);
                    index += 3;
                } else {
                    out.push(bytes[index]);
                    index += 1;
                }
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

struct ParsedPermission {
    tool_name: String,
    tool_input: Value,
    permission_suggestions: Value,
    questions: Value,
}

fn parse_permission_body(body: &str) -> ParsedPermission {
    let json = serde_json::from_str::<Value>(body).unwrap_or(Value::Null);
    let tool_name = first_string(&json, &["tool_name", "toolName", "tool", "name"]);
    let tool_input = first_value(
        &json,
        &[
            "tool_input",
            "toolInput",
            "input",
            "arguments",
            "args",
            "params",
        ],
    )
    .filter(|value| value.is_object())
    .cloned()
    .unwrap_or(Value::Null);
    let permission_suggestions = json
        .get("permission_suggestions")
        .filter(|value| value.is_array())
        .cloned()
        .unwrap_or(Value::Null);
    let questions = parse_ask_user_questions(&tool_name, &tool_input);
    ParsedPermission {
        tool_name,
        tool_input,
        permission_suggestions,
        questions,
    }
}

fn parse_ask_user_questions(tool_name: &str, tool_input: &Value) -> Value {
    if tool_name != "AskUserQuestion" {
        return Value::Null;
    }
    let Some(raw_questions) = tool_input.get("questions").and_then(Value::as_array) else {
        return Value::Null;
    };
    Value::Array(
        raw_questions
            .iter()
            .map(|question| {
                let options = question
                    .get("options")
                    .and_then(Value::as_array)
                    .map(|options| {
                        Value::Array(
                            options
                                .iter()
                                .map(|option| {
                                    if let Some(label) = option.as_str() {
                                        json!({ "label": label })
                                    } else {
                                        json!({
                                            "label": option.get("label").and_then(Value::as_str).unwrap_or(""),
                                            "description": option.get("description").and_then(Value::as_str)
                                        })
                                    }
                                })
                                .collect(),
                        )
                    })
                    .unwrap_or_else(|| Value::Array(vec![]));
                json!({
                    "question": question.get("question").and_then(Value::as_str).unwrap_or("Question"),
                    "header": question.get("header").and_then(Value::as_str),
                    "multiSelect": question.get("multiSelect").and_then(Value::as_bool),
                    "options": options
                })
            })
            .collect(),
    )
}

fn permission_response_body(
    decision: &PermissionDecision,
    tool_input: Value,
    permission_suggestions: Value,
) -> String {
    let decision_value = match decision.decision.as_str() {
        "deny" => json!({ "behavior": "deny" }),
        "answer" => {
            let mut updated_input = tool_input.as_object().cloned().unwrap_or_default();
            if let Some(answers) = &decision.answers {
                updated_input.insert("answers".to_string(), answers.clone());
            }
            json!({ "behavior": "allow", "updatedInput": updated_input })
        }
        "allowAlways" if permission_suggestions.is_array() => {
            json!({ "behavior": "allow", "updatedPermissions": permission_suggestions })
        }
        "allowAlways" => json!({ "behavior": "allow" }),
        _ => json!({ "behavior": "allow" }),
    };
    json!({
        "hookSpecificOutput": {
            "hookEventName": "PermissionRequest",
            "decision": decision_value
        }
    })
    .to_string()
}

fn user_prompt_submit_output(source: &str, session_title: Option<&str>) -> String {
    let mut output = json!({ "hookEventName": "UserPromptSubmit" });
    if source == "claude" {
        if let Some(title) = session_title {
            output["sessionTitle"] = json!(title);
        }
    }
    json!({ "hookSpecificOutput": output }).to_string()
}

fn parse_first_string(body: &str, keys: &[&str]) -> String {
    serde_json::from_str::<Value>(body)
        .ok()
        .map(|value| first_string(&value, keys))
        .unwrap_or_default()
}

fn first_string(value: &Value, keys: &[&str]) -> String {
    first_value(value, keys)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn first_value<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().find_map(|key| value.get(*key))
}

fn truncate_title(prompt: &str) -> String {
    let cleaned = prompt.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned.chars().count() <= 10 {
        return cleaned;
    }
    let truncated: String = cleaned.chars().take(10).collect();
    if let Some(last_space) = truncated.rfind(' ') {
        if last_space > 4 {
            return format!("{}…", &truncated[..last_space]);
        }
    }
    format!("{truncated}…")
}

fn status_for_event(event_type: &str) -> Option<&'static str> {
    match event_type {
        "UserPromptSubmit" | "Start" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure"
        | "SubagentStart" | "SubagentStop" | "task_started" => Some("working"),
        "Stop" | "StopFailure" | "agent-turn-complete" | "task_complete" => Some("review"),
        "PermissionRequest"
        | "Notification"
        | "exec_approval_request"
        | "apply_patch_approval_request"
        | "request_user_input" => Some("permission"),
        "SessionStart" | "SessionEnd" => Some("idle"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_codex_permission_event_to_permission_status() {
        assert_eq!(
            status_for_event("exec_approval_request"),
            Some("permission")
        );
    }

    #[test]
    fn parses_prompt_title() {
        assert_eq!(truncate_title("hello world from forgepad"), "hello…");
    }
}
