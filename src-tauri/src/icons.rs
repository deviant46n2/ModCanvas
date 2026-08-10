//! On-demand icon helpers. The legacy "scan mods directory" family
//! (`scan_jar_for_textures`, `scan_directory_for_jar_textures`, and the
//! base64 `textures_<hash>.json` cache) was removed — scans must be
//! enumeration-only and never read PNG bytes (AGENTS.md). Displayable URLs
//! come from the lazy materializer, not from scans.
//!
//! What survives here are per-request, lazy reads: a pack icon is resolved on
//! demand when a user asks for it, never during a scan.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use std::fs;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

pub fn get_pack_icon(mrpack_or_dir: &Path) -> Option<String> {
    if mrpack_or_dir.is_dir() {
        let icon_path = mrpack_or_dir.join("pack.png");
        if icon_path.exists() {
            if let Ok(bytes) = fs::read(&icon_path) {
                let b64 = STANDARD.encode(&bytes);
                return Some(format!("data:image/png;base64,{}", b64));
            }
        }
        let icon_path = mrpack_or_dir.join("icon.png");
        if icon_path.exists() {
            if let Ok(bytes) = fs::read(&icon_path) {
                let b64 = STANDARD.encode(&bytes);
                return Some(format!("data:image/png;base64,{}", b64));
            }
        }
        None
    } else {
        let file = fs::File::open(mrpack_or_dir).ok()?;
        let mut archive = ZipArchive::new(file).ok()?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).ok()?;
            let name = entry.name();
            if name == "pack.png" || name == "icon.png" {
                let mut buf = Vec::new();
                if entry.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
                    let b64 = STANDARD.encode(&buf);
                    return Some(format!("data:image/png;base64,{}", b64));
                }
            }
        }
        None
    }
}
