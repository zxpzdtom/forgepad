use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::{err, CoreResult};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomPetMeta {
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub kind: String,
    pub imported_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetManifest {
    id: String,
    display_name: String,
    description: String,
    kind: Option<String>,
}

pub fn custom_pets_root() -> CoreResult<PathBuf> {
    let base = dirs::data_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Unable to resolve user data directory".to_string())?;
    Ok(base.join("ForgePad").join("custom-pets"))
}

pub fn import_pet(source: impl AsRef<Path>) -> CoreResult<CustomPetMeta> {
    let source = source.as_ref();
    let manifest_path = source.join("pet.json");
    let spritesheet_path = source.join("spritesheet.webp");
    if !manifest_path.is_file() {
        return Err("missing_pet_json".into());
    }
    if !spritesheet_path.is_file() {
        return Err("missing_spritesheet".into());
    }
    if fs::metadata(&spritesheet_path).map_err(err)?.len() < 10_000 {
        return Err("invalid_spritesheet".into());
    }

    let manifest: PetManifest = serde_json::from_slice(&fs::read(&manifest_path).map_err(err)?)
        .map_err(|_| "invalid_pet_json".to_string())?;
    let meta = meta_from_manifest(manifest)?;
    let custom_id = format!("custom-{}", meta.id);
    let target = custom_pets_root()?.join(&custom_id);
    fs::create_dir_all(&target).map_err(err)?;
    let _ = fs::remove_file(target.join("pet.json"));
    let _ = fs::remove_file(target.join("spritesheet.webp"));
    fs::copy(&manifest_path, target.join("pet.json")).map_err(err)?;
    fs::copy(&spritesheet_path, target.join("spritesheet.webp")).map_err(err)?;

    Ok(CustomPetMeta {
        id: custom_id,
        imported_at: Utc::now().to_rfc3339(),
        ..meta
    })
}

pub fn delete_pet(pet_id: &str) -> CoreResult<()> {
    if !pet_id.starts_with("custom-") || !is_safe_segment(pet_id) {
        return Err("invalid_pet_id".into());
    }
    let root = custom_pets_root()?;
    let target = root.join(pet_id);
    let root = fs::canonicalize(&root).unwrap_or(root);
    let canonical_target = fs::canonicalize(&target).unwrap_or(target);
    if !canonical_target.starts_with(&root) {
        return Err("invalid_pet_id".into());
    }
    let _ = fs::remove_dir_all(canonical_target);
    Ok(())
}

pub fn list_pets() -> CoreResult<Vec<CustomPetMeta>> {
    let root = custom_pets_root()?;
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return Ok(vec![]),
    };
    let mut pets = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(id) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let Ok(raw) = fs::read(path.join("pet.json")) else {
            continue;
        };
        let Ok(manifest) = serde_json::from_slice::<PetManifest>(&raw) else {
            continue;
        };
        let Ok(meta) = meta_from_manifest(manifest) else {
            continue;
        };
        pets.push(CustomPetMeta {
            id: id.to_string(),
            imported_at: String::new(),
            ..meta
        });
    }
    pets.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    Ok(pets)
}

fn meta_from_manifest(manifest: PetManifest) -> CoreResult<CustomPetMeta> {
    if manifest.id.is_empty()
        || !is_safe_segment(&manifest.id)
        || manifest.display_name.is_empty()
        || manifest.description.is_empty()
    {
        return Err("invalid_pet_schema".into());
    }
    let kind = manifest.kind.unwrap_or_else(|| "animal".into());
    if !matches!(kind.as_str(), "person" | "animal" | "object") {
        return Err("invalid_pet_schema".into());
    }
    Ok(CustomPetMeta {
        id: manifest.id,
        display_name: manifest.display_name,
        description: manifest.description,
        kind,
        imported_at: String::new(),
    })
}

fn is_safe_segment(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}
