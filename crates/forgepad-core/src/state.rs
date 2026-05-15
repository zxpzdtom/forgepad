use std::fs;
use std::path::PathBuf;

use serde_json::Value;

use crate::{err, CoreResult};

pub fn user_data_dir() -> CoreResult<PathBuf> {
    let base = dirs::data_dir()
        .or_else(dirs::home_dir)
        .ok_or("Unable to resolve user data dir")?;
    Ok(base.join("ForgePad"))
}

pub fn state_path() -> CoreResult<PathBuf> {
    Ok(user_data_dir()?.join("forgepad-state.json"))
}

pub fn load_state() -> CoreResult<Option<Value>> {
    let path = state_path()?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(path).map_err(err)?;
    Ok(serde_json::from_str(&raw).ok())
}

pub fn save_state(state: &Value) -> CoreResult<()> {
    let path = state_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::write(path, serde_json::to_string_pretty(state).map_err(err)?).map_err(err)
}
