use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{git, CoreResult};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenProjectResult {
    pub name: String,
    pub repo_path: String,
    pub branch: String,
    pub is_git_repo: bool,
}

pub fn project_from_path(path: impl AsRef<Path>) -> CoreResult<OpenProjectResult> {
    let path = path.as_ref();
    if !path.exists() {
        return Err(format!("Project path does not exist: {}", path.display()));
    }

    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("Project")
        .to_string();
    let is_git_repo = git::is_git_repo(path);
    let branch = if is_git_repo {
        git::current_branch(path)
    } else {
        "main".into()
    };

    Ok(OpenProjectResult {
        name,
        repo_path: path.to_string_lossy().to_string(),
        branch,
        is_git_repo,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_from_path_uses_directory_name() {
        let dir = tempfile::tempdir().unwrap();
        let result = project_from_path(dir.path()).unwrap();

        assert_eq!(
            result.name,
            dir.path().file_name().unwrap().to_string_lossy().to_string()
        );
        assert_eq!(result.repo_path, dir.path().to_string_lossy().to_string());
        assert_eq!(result.branch, "main");
        assert!(!result.is_git_repo);
    }

    #[test]
    fn project_from_path_rejects_missing_path() {
        let dir = tempfile::tempdir().unwrap();
        assert!(project_from_path(dir.path().join("missing")).is_err());
    }
}
