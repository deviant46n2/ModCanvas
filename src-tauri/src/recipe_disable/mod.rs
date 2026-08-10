// Comment-out / uncomment of KubeJS / CraftTweaker recipe calls inside a pack's
// own source scripts. Used by the recipe editor's disable flow: commenting out
// the call is the precise, reversible "heavy path" for script-defined recipes.
//
// Both operations are line-scoped (1-based `[start, end]`, from the parser's
// `LineSpan`) and write back atomically. `uncomment` is integrity-checked with
// a SHA-256 fingerprint of the ORIGINAL pre-comment lines so a hand-edited file
// is never clobbered.

use crate::path_safety::{atomic_write_str, validate_under_root};
use crate::{db::Database, models::Project};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::State;
use uuid::Uuid;

/// Resolve a project row's path from its id (shared by both commands).
fn resolve_project_path(db: &Database, project_id: &str) -> Result<PathBuf, String> {
    let pid = Uuid::parse_str(project_id).map_err(|e| e.to_string())?;
    let project: Project = db
        .get_project(&pid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;
    Ok(PathBuf::from(project.path))
}

/// Comment out a recipe call in a pack script (returns the disable fingerprint).
#[tauri::command]
pub fn comment_out_recipe_call(
    db: State<'_, Database>,
    project_id: String,
    file: String,
    start_line: u32,
    end_line: u32,
) -> Result<String, String> {
    let project_path = resolve_project_path(&db, &project_id)?;
    comment_out_recipe_call_impl(&project_path, &file, start_line, end_line)
}

/// Reverse a comment-out, integrity-checked via the stored fingerprint.
#[tauri::command]
pub fn uncomment_recipe_call(
    db: State<'_, Database>,
    project_id: String,
    file: String,
    start_line: u32,
    end_line: u32,
    fingerprint: String,
) -> Result<(), String> {
    let project_path = resolve_project_path(&db, &project_id)?;
    uncomment_recipe_call_impl(&project_path, &file, start_line, end_line, &fingerprint)
}

/// Prepend `// ` to every line in the 1-based range `[start_line, end_line]`
/// of `file` (validated to live under `project_path`). Every other byte in the
/// file is preserved, including line endings. Returns the SHA-256 fingerprint
/// (hex) of the ORIGINAL pre-comment lines — the caller stores it in the
/// disable manifest so `uncomment_recipe_call` can later verify integrity.
pub fn comment_out_recipe_call_impl(
    project_path: &std::path::Path,
    file: &str,
    start_line: u32,
    end_line: u32,
) -> Result<String, String> {
    let path = validate_file(project_path, file)?;
    let content = read_to_string(&path)?;
    let mut lines = split_lines(&content);
    let n_lines = line_count(&content, &lines);
    let (start, end) = validate_range(start_line, end_line, n_lines)?;

    let original: Vec<String> = lines[start..=end].iter().map(|l| (*l).to_string()).collect();
    let fingerprint = hex_hash(&original.join("\n"));

    for i in start..=end {
        let (body, ending) = split_line_ending(&lines[i]);
        lines[i] = format!("// {}{}", body, ending);
    }
    atomic_write_str(&path, &join_lines(&lines))?;
    Ok(fingerprint)
}

/// Reverse a `comment_out_recipe_call`. Integrity check first: stripping one
/// leading `//` (+ one optional space) from every line in the range must yield
/// text whose SHA-256 equals `fingerprint` (hex, of the ORIGINAL pre-comment
/// lines). A mismatch means the file was edited since — refuse with an error.
pub fn uncomment_recipe_call_impl(
    project_path: &std::path::Path,
    file: &str,
    start_line: u32,
    end_line: u32,
    fingerprint: &str,
) -> Result<(), String> {
    let path = validate_file(project_path, file)?;
    let content = read_to_string(&path)?;
    let mut lines = split_lines(&content);
    let n_lines = line_count(&content, &lines);
    let (start, end) = validate_range(start_line, end_line, n_lines)?;

    let stripped: Vec<String> = lines[start..=end].iter().map(|l| strip_comment(l)).collect();
    let hash = hex_hash(&stripped.join("\n"));
    if hash != fingerprint {
        return Err(format!(
            "File was edited since this recipe was disabled (expected fingerprint {fingerprint}, got {hash}). Re-enable by hand."
        ));
    }
    for (offset, s) in stripped.into_iter().enumerate() {
        lines[start + offset] = s;
    }
    atomic_write_str(&path, &join_lines(&lines))
}

/// Resolve + validate the source file under the project root (it exists in the
/// pack tree — `kubejs/server_scripts/**`, `scripts/**` — not under `config/`).
fn validate_file(project_path: &std::path::Path, file: &str) -> Result<std::path::PathBuf, String> {
    if file.is_empty() {
        return Err("empty file path".to_string());
    }
    validate_under_root(project_path, file)
}

fn read_to_string(path: &std::path::Path) -> Result<String, String> {
    std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))
}

fn split_lines(content: &str) -> Vec<String> {
    content.split('\n').map(|s| s.to_string()).collect()
}

/// Number of logical lines: a trailing newline yields one empty split element
/// that is not a real line.
fn line_count(content: &str, lines: &[String]) -> usize {
    if content.ends_with('\n') {
        lines.len().saturating_sub(1).max(1)
    } else {
        lines.len()
    }
}

fn validate_range(start_line: u32, end_line: u32, n_lines: usize) -> Result<(usize, usize), String> {
    if start_line == 0 || end_line == 0 || start_line > end_line {
        return Err("invalid line range: need 1 ≤ start ≤ end".to_string());
    }
    let start = (start_line as usize).saturating_sub(1);
    let end = (end_line as usize).saturating_sub(1);
    if start >= n_lines || end >= n_lines {
        return Err(format!(
            "line range {start_line}-{end_line} out of bounds (file has {n_lines} lines)"
        ));
    }
    Ok((start, end))
}

fn split_line_ending(line: &str) -> (&str, &str) {
    match line.strip_suffix('\r') {
        Some(body) => (body, "\r"),
        None => (line, ""),
    }
}

/// Remove one leading `//` (plus one optional space) from a commented line.
/// Lines without the prefix are returned unchanged.
fn strip_comment(line: &str) -> String {
    let (body, ending) = split_line_ending(line);
    let stripped = match body.strip_prefix("//") {
        Some(rest) => rest.strip_prefix(' ').unwrap_or(rest),
        None => body,
    };
    format!("{stripped}{ending}")
}

fn join_lines(lines: &[String]) -> String {
    lines.join("\n")
}

fn hex_hash(s: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    let digest = hasher.finalize();
    let mut out = String::with_capacity(64);
    for b in digest {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

#[cfg(test)]
mod tests;
