use std::fs;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::files::resolve_inside_root;
use crate::{err, CoreResult};

#[derive(Debug, Deserialize)]
pub struct BundleInput {
    #[serde(rename = "workspacePath")]
    pub workspace_path: String,
    #[serde(rename = "workspaceName")]
    pub workspace_name: String,
    pub branch: String,
    pub prompt: String,
    pub tasks: Vec<Value>,
    pub files: Vec<Value>,
    pub diffs: Vec<Value>,
    pub comments: Vec<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextBundleResult {
    pub id: String,
    pub path: String,
    pub rel_path: String,
    pub markdown: String,
    pub estimated_tokens: usize,
    pub created_at: i64,
}

pub fn create_bundle(input: BundleInput) -> CoreResult<ContextBundleResult> {
    let id = Uuid::new_v4().to_string();
    let rel_path = format!(".forgepad/context/{id}.md");
    let path = resolve_inside_root(&input.workspace_path, &rel_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }

    let markdown = render_bundle_markdown(&input)?;
    fs::write(&path, &markdown).map_err(err)?;

    Ok(ContextBundleResult {
        id,
        path: path.to_string_lossy().to_string(),
        rel_path,
        estimated_tokens: markdown.len() / 4,
        created_at: Utc::now().timestamp_millis(),
        markdown,
    })
}

fn render_bundle_markdown(input: &BundleInput) -> CoreResult<String> {
    let mut md = format!(
        "# ForgePad Context\n\nWorkspace: {}\nBranch: {}\n\n## Prompt\n{}\n\n",
        input.workspace_name, input.branch, input.prompt
    );

    if !input.tasks.is_empty() {
        md.push_str("## Tasks\n");
        for task in &input.tasks {
            md.push_str(&format!(
                "- {}\n",
                task.get("title").and_then(Value::as_str).unwrap_or("Task")
            ));
        }
    }

    for file in &input.files {
        if let Some(rel) = file.get("relPath").and_then(Value::as_str) {
            md.push_str(&format!("\n## File `{rel}`\n"));
            if file
                .get("includeContent")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                if let Ok(content) = fs::read_to_string(resolve_inside_root(&input.workspace_path, rel)?) {
                    md.push_str("```\n");
                    md.push_str(&content);
                    md.push_str("\n```\n");
                }
            }
        }
    }

    if !input.diffs.is_empty() {
        md.push_str("\n## Diffs\n");
        for diff in &input.diffs {
            md.push_str(&format!(
                "- {}\n",
                diff.get("relPath").and_then(Value::as_str).unwrap_or("")
            ));
        }
    }

    if !input.comments.is_empty() {
        md.push_str("\n## Comments\n");
        for comment in &input.comments {
            md.push_str(&format!("- {comment}\n"));
        }
    }

    Ok(md)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_bundle_writes_context_file() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("README.md"), "hello").unwrap();

        let result = create_bundle(BundleInput {
            workspace_path: dir.path().to_string_lossy().to_string(),
            workspace_name: "demo".into(),
            branch: "main".into(),
            prompt: "summarize".into(),
            tasks: vec![],
            files: vec![serde_json::json!({
                "relPath": "README.md",
                "includeContent": true
            })],
            diffs: vec![],
            comments: vec![],
        })
        .unwrap();

        assert!(result.rel_path.starts_with(".forgepad/context/"));
        assert!(result.markdown.contains("Workspace: demo"));
        assert!(result.markdown.contains("hello"));
        assert!(std::path::Path::new(&result.path).exists());
    }
}
