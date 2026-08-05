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
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn comment_uncomment_round_trip_preserves_other_lines() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("kubejs/server_scripts/recipes.js");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        let original = "ServerEvents.recipes(event => {\n  event.shaped('minecraft:a', ['A'], { A: 'minecraft:b' })\n  event.smelting('minecraft:c', 'minecraft:d')\n})\n";
        std::fs::write(&file, original).unwrap();

        let fp = comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 2, 2).unwrap();
        let commented = std::fs::read_to_string(&file).unwrap();
        assert_eq!(
            commented,
            "ServerEvents.recipes(event => {\n//   event.shaped('minecraft:a', ['A'], { A: 'minecraft:b' })\n  event.smelting('minecraft:c', 'minecraft:d')\n})\n"
        );

        uncomment_recipe_call_impl(dir.path(), file.to_str().unwrap(), 2, 2, &fp).unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), original);
    }

    #[test]
    fn comment_out_multiline_call_with_crlf_preserved() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("scripts/recipes.zs");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        let original = "import x;\r\nfurnace.addRecipe(\"iron\",\r\n    <item:minecraft:iron_ingot>,\r\n    <item:minecraft:iron_ore>,\r\n    0.7, 200);\r\n";
        std::fs::write(&file, original).unwrap();

        comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 2, 5).unwrap();
        let commented = std::fs::read_to_string(&file).unwrap();
        let lines: Vec<&str> = commented.split("\r\n").collect();
        assert_eq!(lines[0], "import x;", "first line untouched");
        for l in &lines[1..=4] {
            assert!(l.starts_with("// "), "line should be commented: {l:?}");
        }
        // CRLF line endings survive on every line (no bare `\n` mid-line).
        assert!(lines.len() == 6 && lines[5].is_empty());
    }

    #[test]
    fn off_root_file_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let file = outside.path().join("secret.js");
        std::fs::write(&file, "event.shaped('a:b', ['A'], { A: 'c:d' })").unwrap();
        let err = comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 1, 1)
            .err()
            .expect("must reject off-root file");
        assert!(err.contains("Access denied") || err.contains("outside"), "{err}");
    }

    #[test]
    fn traversal_path_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let err = comment_out_recipe_call_impl(dir.path(), "../escape.js", 1, 1)
            .err()
            .expect("must reject traversal");
        assert!(!err.is_empty());
    }

    #[test]
    fn out_of_range_lines_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("scripts/recipes.zs");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, "a\nb\nc\n").unwrap();
        let err = comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 1, 99)
            .err()
            .expect("must reject out-of-range end");
        assert!(err.contains("out of bounds"), "{err}");
        let err = comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 3, 2)
            .err()
            .expect("must reject inverted range");
        assert!(err.contains("invalid line range"), "{err}");
    }

    #[test]
    fn fingerprint_mismatch_refuses() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("kubejs/server_scripts/recipes.js");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(
            &file,
            "event.shaped('minecraft:a', ['A'], { A: 'minecraft:b' })",
        )
        .unwrap();
        let fp = comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 1, 1).unwrap();

        // Hand-edit the commented file (e.g. change the ingredient).
        let commented = std::fs::read_to_string(&file).unwrap();
        std::fs::write(&file, commented.replace("minecraft:b", "minecraft:c")).unwrap();

        let err = uncomment_recipe_call_impl(dir.path(), file.to_str().unwrap(), 1, 1, &fp)
            .err()
            .expect("must refuse when file changed");
        assert!(err.contains("edited since"), "{err}");
        // The hand-edit is left untouched.
        assert!(std::fs::read_to_string(&file).unwrap().contains("minecraft:c"));
    }

    #[test]
    fn uncomment_with_stale_fingerprint_refuses() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("scripts/recipes.zs");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, "furnace.addRecipe(\"x\", <item:minecraft:a>);\n").unwrap();
        comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 1, 1).unwrap();
        // Wrong fingerprint (all-zero) must refuse even though lines are intact.
        let err = uncomment_recipe_call_impl(
            dir.path(),
            file.to_str().unwrap(),
            1,
            1,
            "0000000000000000000000000000000000000000000000000000000000000000",
        )
        .err()
        .expect("must refuse wrong fingerprint");
        assert!(err.contains("edited since"), "{err}");
    }

    #[test]
    fn missing_file_errors() {
        let dir = tempfile::tempdir().unwrap();
        let err = comment_out_recipe_call_impl(dir.path(), "kubejs/server_scripts/nope.js", 1, 1)
            .err()
            .expect("must error on missing file");
        assert!(err.contains("Failed to read"), "{err}");
    }

    #[test]
    fn hex_hash_is_stable_hex() {
        let h = hex_hash("event.shaped('a')");
        assert_eq!(h.len(), 64);
        assert!(h.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(h, hex_hash("event.shaped('a')"));
        assert_ne!(h, hex_hash("event.shaped('b')"));
    }

    #[test]
    fn path_must_be_nonempty() {
        let dir = tempfile::tempdir().unwrap();
        let err = comment_out_recipe_call_impl(Path::new(dir.path()), "", 1, 1)
            .err()
            .expect("must reject empty path");
        assert_eq!(err, "empty file path");
    }
}
