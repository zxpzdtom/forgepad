use std::path::Path;
use std::process::Command;

use crate::{err, CoreResult};

pub fn command_output(program: &str, args: &[&str], cwd: Option<&Path>) -> CoreResult<String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }

    let output = cmd.output().map_err(err)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn command_status(program: &str, args: &[&str], cwd: Option<&Path>) -> CoreResult<()> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }

    let output = cmd.output().map_err(err)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(())
}
