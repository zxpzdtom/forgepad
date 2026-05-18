use crate::CoreResult;
use chrono::DateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};

const MAX_EXTERNAL_SESSIONS: usize = 50;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAgentSession {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    pub session_id: String,
    pub agent_preset_id: String,
    pub agent_command: String,
    pub updated_at: i64,
}

pub fn list_external_sessions(
    workspace_id: &str,
    worktree_path: &str,
) -> CoreResult<Vec<ExternalAgentSession>> {
    let home = dirs::home_dir().ok_or_else(|| "Unable to locate home directory.".to_string())?;
    Ok(list_external_sessions_from_home(
        &home,
        workspace_id,
        worktree_path,
    ))
}

fn list_external_sessions_from_home(
    home: &Path,
    workspace_id: &str,
    worktree_path: &str,
) -> Vec<ExternalAgentSession> {
    let mut sessions = Vec::new();
    sessions.extend(codex_sessions(home, workspace_id, worktree_path));
    sessions.extend(gemini_sessions(home, workspace_id, worktree_path));
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    sessions.truncate(MAX_EXTERNAL_SESSIONS);
    sessions
}

fn codex_sessions(
    home: &Path,
    workspace_id: &str,
    worktree_path: &str,
) -> Vec<ExternalAgentSession> {
    if let Some(sessions) = codex_sessions_from_sqlite(home, workspace_id, worktree_path) {
        return sessions;
    }

    let index_path = home.join(".codex").join("session_index.jsonl");
    let Ok(raw) = fs::read_to_string(index_path) else {
        return Vec::new();
    };

    raw.lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter_map(|value| {
            let session_id = value.get("id")?.as_str()?.trim();
            if session_id.is_empty() {
                return None;
            }
            let title = value
                .get("thread_name")
                .and_then(Value::as_str)
                .filter(|text| !text.trim().is_empty())
                .unwrap_or("Codex session");
            let updated_at = value
                .get("updated_at")
                .and_then(Value::as_str)
                .and_then(parse_timestamp_ms)
                .unwrap_or(0);

            Some(ExternalAgentSession {
                id: format!("{workspace_id}:codex:{session_id}"),
                workspace_id: workspace_id.to_string(),
                title: title.to_string(),
                session_id: session_id.to_string(),
                agent_preset_id: "codex".to_string(),
                agent_command: "codex".to_string(),
                updated_at,
            })
        })
        .collect()
}

fn codex_sessions_from_sqlite(
    home: &Path,
    workspace_id: &str,
    worktree_path: &str,
) -> Option<Vec<ExternalAgentSession>> {
    let db_path = home.join(".codex").join("state_5.sqlite");
    if !db_path.exists() {
        return None;
    }

    let escaped_worktree = worktree_path.replace('\'', "''");
    let query = format!(
        "SELECT id, title, updated_at_ms AS updatedAt FROM threads WHERE archived = 0 AND cwd = '{escaped_worktree}' ORDER BY updated_at_ms DESC LIMIT {MAX_EXTERNAL_SESSIONS};"
    );
    let output = Command::new("sqlite3")
        .arg("-readonly")
        .arg("-json")
        .arg(db_path)
        .arg(query)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let rows = serde_json::from_slice::<Vec<Value>>(&output.stdout).ok()?;
    Some(
        rows.into_iter()
            .filter_map(|value| {
                let session_id = value.get("id")?.as_str()?.trim();
                if session_id.is_empty() {
                    return None;
                }
                let title = value
                    .get("title")
                    .and_then(Value::as_str)
                    .map(truncate_title)
                    .filter(|text| !text.trim().is_empty())
                    .unwrap_or_else(|| "Codex session".to_string());
                let updated_at = value.get("updatedAt").and_then(Value::as_i64).unwrap_or(0);
                Some(ExternalAgentSession {
                    id: format!("{workspace_id}:codex:{session_id}"),
                    workspace_id: workspace_id.to_string(),
                    title,
                    session_id: session_id.to_string(),
                    agent_preset_id: "codex".to_string(),
                    agent_command: "codex".to_string(),
                    updated_at,
                })
            })
            .collect(),
    )
}

fn gemini_sessions(
    home: &Path,
    workspace_id: &str,
    worktree_path: &str,
) -> Vec<ExternalAgentSession> {
    let Some(project_dir) = gemini_project_temp_dir(home, worktree_path) else {
        return Vec::new();
    };
    let chats_dir = project_dir.join("chats");
    let Ok(entries) = fs::read_dir(chats_dir) else {
        return Vec::new();
    };

    entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            matches!(
                path.extension().and_then(|ext| ext.to_str()),
                Some("json") | Some("jsonl")
            )
        })
        .filter_map(|path| gemini_session_from_chat_file(workspace_id, &path))
        .collect()
}

fn gemini_project_temp_dir(home: &Path, worktree_path: &str) -> Option<PathBuf> {
    let gemini_dir = home.join(".gemini");
    let tmp_dir = gemini_dir.join("tmp");
    let normalized_worktree = normalize_path(worktree_path);

    if let Some(slug) = gemini_project_slug_from_registry(&gemini_dir, &normalized_worktree) {
        let candidate = tmp_dir.join(slug);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    if let Some(candidate) = find_gemini_project_dir_by_marker(&tmp_dir, &normalized_worktree) {
        return Some(candidate);
    }

    let legacy_hash = sha256_hex(worktree_path.as_bytes());
    let legacy = tmp_dir.join(legacy_hash);
    legacy.exists().then_some(legacy)
}

fn gemini_project_slug_from_registry(
    gemini_dir: &Path,
    normalized_worktree: &str,
) -> Option<String> {
    let raw = fs::read_to_string(gemini_dir.join("projects.json")).ok()?;
    let value = serde_json::from_str::<Value>(&raw).ok()?;
    value
        .get("projects")?
        .as_object()?
        .iter()
        .find_map(|(path, slug)| {
            (normalize_path(path) == normalized_worktree)
                .then(|| slug.as_str().map(ToString::to_string))
                .flatten()
        })
}

fn find_gemini_project_dir_by_marker(tmp_dir: &Path, normalized_worktree: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(tmp_dir).ok()?;
    for entry in entries.filter_map(Result::ok) {
        let candidate = entry.path();
        let marker = candidate.join(".project_root");
        let Ok(owner) = fs::read_to_string(marker) else {
            continue;
        };
        if normalize_path(owner.trim()) == normalized_worktree {
            return Some(candidate);
        }
    }
    None
}

fn gemini_session_from_chat_file(workspace_id: &str, path: &Path) -> Option<ExternalAgentSession> {
    let raw = fs::read_to_string(path).ok()?;
    let parsed = parse_json_or_jsonl(&raw);
    let file_stem = path.file_stem()?.to_str()?.to_string();
    let session_id = parsed
        .as_ref()
        .and_then(|value| first_string_for_keys(value, &["sessionId", "session_id", "id"]))
        .unwrap_or_else(|| file_stem.clone());
    if session_id.trim().is_empty() {
        return None;
    }

    let title = parsed
        .as_ref()
        .and_then(|value| {
            first_string_for_keys(
                value,
                &["title", "name", "firstUserPrompt", "prompt", "text"],
            )
        })
        .map(|text| truncate_title(&text))
        .filter(|text| !text.trim().is_empty())
        .unwrap_or_else(|| "Gemini session".to_string());
    let updated_at = path
        .metadata()
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);

    Some(ExternalAgentSession {
        id: format!("{workspace_id}:gemini:{session_id}"),
        workspace_id: workspace_id.to_string(),
        title,
        session_id,
        agent_preset_id: "gemini".to_string(),
        agent_command: "gemini --approval-mode=auto_edit".to_string(),
        updated_at,
    })
}

fn parse_json_or_jsonl(raw: &str) -> Option<Value> {
    serde_json::from_str::<Value>(raw).ok().or_else(|| {
        let values = raw
            .lines()
            .filter_map(|line| serde_json::from_str::<Value>(line).ok())
            .collect::<Vec<_>>();
        (!values.is_empty()).then(|| Value::Array(values))
    })
}

fn first_string_for_keys(value: &Value, keys: &[&str]) -> Option<String> {
    match value {
        Value::Object(map) => {
            for key in keys {
                if let Some(text) = map.get(*key).and_then(Value::as_str) {
                    if !text.trim().is_empty() {
                        return Some(text.trim().to_string());
                    }
                }
            }
            map.values()
                .find_map(|child| first_string_for_keys(child, keys))
        }
        Value::Array(items) => items
            .iter()
            .find_map(|child| first_string_for_keys(child, keys)),
        _ => None,
    }
}

fn parse_timestamp_ms(raw: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|date| date.timestamp_millis())
}

fn normalize_path(path: &str) -> String {
    let normalized = Path::new(path)
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(path))
        .to_string_lossy()
        .replace('\\', "/");
    if cfg!(windows) {
        normalized.to_lowercase()
    } else {
        normalized
    }
}

fn truncate_title(value: &str) -> String {
    let cleaned = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned.chars().count() <= 64 {
        return cleaned;
    }
    let mut title = cleaned.chars().take(61).collect::<String>();
    title.push('…');
    title
}

fn sha256_hex(input: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut h = [
        0x6a09e667u32,
        0xbb67ae85,
        0x3c6ef372,
        0xa54ff53a,
        0x510e527f,
        0x9b05688c,
        0x1f83d9ab,
        0x5be0cd19,
    ];
    let bit_len = (input.len() as u64) * 8;
    let mut data = input.to_vec();
    data.push(0x80);
    while (data.len() % 64) != 56 {
        data.push(0);
    }
    data.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in data.chunks(64) {
        let mut w = [0u32; 64];
        for (i, word) in w.iter_mut().take(16).enumerate() {
            let offset = i * 4;
            *word = u32::from_be_bytes([
                chunk[offset],
                chunk[offset + 1],
                chunk[offset + 2],
                chunk[offset + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    h.iter().map(|word| format!("{word:08x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn imports_codex_session_index() {
        let temp = tempfile::tempdir().unwrap();
        let codex_dir = temp.path().join(".codex");
        fs::create_dir_all(&codex_dir).unwrap();
        fs::write(
            codex_dir.join("session_index.jsonl"),
            r#"{"id":"abc","thread_name":"Fix startup","updated_at":"2026-05-18T03:08:54.759066Z"}"#,
        )
        .unwrap();

        let sessions = list_external_sessions_from_home(temp.path(), "workspace-1", "/tmp/project");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].agent_preset_id, "codex");
        assert_eq!(sessions[0].session_id, "abc");
        assert_eq!(sessions[0].title, "Fix startup");
    }

    #[test]
    fn imports_gemini_project_chats_from_registry() {
        let temp = tempfile::tempdir().unwrap();
        let gemini_dir = temp.path().join(".gemini");
        let workspace = temp.path().join("My Project");
        fs::create_dir_all(&workspace).unwrap();
        let normalized = normalize_path(workspace.to_str().unwrap());
        fs::create_dir_all(gemini_dir.join("tmp").join("my-project").join("chats")).unwrap();
        fs::write(
            gemini_dir.join("projects.json"),
            serde_json::json!({ "projects": { normalized.as_str(): "my-project" } }).to_string(),
        )
        .unwrap();
        let mut file = fs::File::create(
            gemini_dir
                .join("tmp")
                .join("my-project")
                .join("chats")
                .join("session-1.json"),
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            serde_json::json!({ "sessionId": "gemini-1", "title": "Refactor renderer sessions" })
        )
        .unwrap();

        let sessions = list_external_sessions_from_home(
            temp.path(),
            "workspace-1",
            workspace.to_str().unwrap(),
        );
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].agent_preset_id, "gemini");
        assert_eq!(sessions[0].session_id, "gemini-1");
        assert_eq!(sessions[0].title, "Refactor renderer sessions");
    }

    #[test]
    fn sha256_matches_gemini_legacy_project_hash() {
        assert_eq!(
            sha256_hex(b"/tmp/project"),
            "f630ad93b344dd6bd04d44ecde70b128e7e77f9ecc28ee90b62b018734a7e8c4"
        );
    }
}
