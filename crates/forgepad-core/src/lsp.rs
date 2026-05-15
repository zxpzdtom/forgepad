use std::path::Path;

use serde::Serialize;

use crate::command::command_output;
use crate::CoreResult;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspLocation {
    pub file_path: String,
    pub line_number: u32,
    pub char_start: u32,
    pub line_text: String,
}

pub fn get_definition(worktree_path: &Path, token: &str) -> CoreResult<Vec<LspLocation>> {
    let out = command_output("git", &["grep", "-n", "--", token], Some(worktree_path)).unwrap_or_default();
    Ok(parse_git_grep(&out, 100))
}

pub fn parse_git_grep(output: &str, limit: usize) -> Vec<LspLocation> {
    output
        .lines()
        .take(limit)
        .filter_map(|line| {
            let mut parts = line.splitn(3, ':');
            Some(LspLocation {
                file_path: parts.next()?.to_string(),
                line_number: parts.next()?.parse::<u32>().ok()?,
                char_start: 0,
                line_text: parts.next().unwrap_or("").to_string(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_git_grep_lines() {
        assert_eq!(
            parse_git_grep("src/app.ts:12:const token = true\n", 100),
            vec![LspLocation {
                file_path: "src/app.ts".into(),
                line_number: 12,
                char_start: 0,
                line_text: "const token = true".into(),
            }]
        );
    }
}
