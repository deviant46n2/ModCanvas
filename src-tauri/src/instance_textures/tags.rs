use crate::instance_textures::layers::{jars_under, resource_pack_order, vanilla_jars};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};

static TAG_INDEX_MEMO: OnceLock<Mutex<HashMap<String, Arc<TagIndex>>>> = OnceLock::new();

fn tag_memo() -> &'static Mutex<HashMap<String, Arc<TagIndex>>> {
    TAG_INDEX_MEMO.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Tag → item ids, expanded from `data/<ns>/tags/items/<path>.json` `values`
/// arrays (recursively following `#tag` references, cycle-safe). Tag ids keep
/// slashes as-is, e.g. `forge:ingots/iron`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TagIndex {
    raw: HashMap<String, Vec<String>>,
}

impl TagIndex {
    /// Expand a tag to item ids, resolving nested `#tag` references.
    pub fn items(&self, tag: &str) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        let mut seen = std::collections::HashSet::new();
        let mut stack: Vec<String> = vec![tag.to_string()];
        while let Some(current) = stack.pop() {
            if !seen.insert(current.clone()) {
                continue;
            }
            if let Some(values) = self.raw.get(&current) {
                for v in values {
                    if let Some(ref_tag) = v.strip_prefix('#') {
                        stack.push(ref_tag.to_string());
                    } else if !out.contains(v) {
                        out.push(v.clone());
                    }
                }
            }
        }
        out
    }

    fn tag_from_rel(rel: &str) -> Option<String> {
        let rest = rel.strip_suffix(".json")?;
        let idx = rest.find("/tags/item")?;
        let mut segs_start = idx + "/tags/item".len();
        // Plural folder (`/tags/items/`) used by pre-1.20.5 packs.
        if rest.as_bytes().get(segs_start) == Some(&b's') {
            segs_start += 1;
        }
        let segs = rest.get(segs_start..)?.strip_prefix('/')?;
        let ns = &rest[..idx];
        Some(format!("{ns}:{segs}"))
    }

    fn merge_json(&mut self, contents: &str, tag: &str) {
        let Ok(parsed) = serde_json::from_str::<serde_json::Value>(contents) else {
            return;
        };
        let Some(values) = parsed.get("values").and_then(|v| v.as_array()) else {
            return;
        };
        let list: Vec<String> = values
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
        if !list.is_empty() {
            self.raw.entry(tag.to_string()).or_default().extend(list);
        }
    }

    fn scan_archive(&mut self, jar: &Path) {
        let file = match fs::File::open(jar) {
            Ok(f) => f,
            Err(_) => return,
        };
        let mut archive = match zip::ZipArchive::new(file) {
            Ok(a) => a,
            Err(_) => return,
        };
        for i in 0..archive.len() {
            let Ok(mut entry) = archive.by_index(i) else { continue };
            let name = entry.name().to_string();
            let Some(rel) = name.strip_prefix("data/") else { continue };
            let Some(tag) = Self::tag_from_rel(rel) else { continue };
            let mut contents = String::new();
            if entry.read_to_string(&mut contents).is_ok() {
                self.merge_json(&contents, &tag);
            }
        }
    }

    fn scan_dir(&mut self, data_root: &Path) {
        if !data_root.exists() {
            return;
        }
        let mut stack: Vec<std::path::PathBuf> = vec![data_root.to_path_buf()];
        while let Some(dir) = stack.pop() {
            let Ok(entries) = fs::read_dir(&dir) else { continue };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                } else if path.extension().map_or(false, |e| e == "json") {
                    let rel = path
                        .strip_prefix(data_root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .replace('\\', "/");
                    let Some(tag) = Self::tag_from_rel(&rel) else { continue };
                    if let Ok(contents) = fs::read_to_string(&path) {
                        self.merge_json(&contents, &tag);
                    }
                }
            }
        }
    }
}

pub fn build_tag_index(instance_path: &Path) -> Arc<TagIndex> {
    let key = format!("tags:{}", instance_path.to_string_lossy().replace('\\', "/"));
    if let Some(arc) = tag_memo().lock().ok().and_then(|g| g.get(&key).cloned()) {
        return arc;
    }

    let mut index = TagIndex::default();
    for jar in vanilla_jars(instance_path)
        .into_iter()
        .chain(jars_under(&instance_path.join("mods")))
    {
        index.scan_archive(&jar);
    }
    let pack_order = resource_pack_order(instance_path);
    for name in pack_order {
        let p = instance_path.join("resourcepacks").join(name);
        if p.extension().map_or(false, |e| e == "jar" || e == "zip") {
            index.scan_archive(&p);
        } else {
            index.scan_dir(&p.join("data"));
        }
    }
    index.scan_dir(&instance_path.join("data"));
    index.scan_dir(&instance_path.join("kubejs").join("data"));

    let arc = Arc::new(index);
    if let Ok(mut g) = tag_memo().lock() {
        g.insert(key, arc.clone());
    }
    arc
}

/// Expand a set of item tags to item ids for the given instance.
pub fn resolve_item_tags(instance_path: &Path, tags: &[String]) -> HashMap<String, Vec<String>> {
    let index = build_tag_index(instance_path);
    let mut out: HashMap<String, Vec<String>> = HashMap::new();
    for tag in tags {
        let cleaned = tag.trim_start_matches('#').to_string();
        out.insert(tag.clone(), index.items(&cleaned));
    }
    out
}

/// Catalog entry for the Tags palette tab: tag id + expanded member count.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemTagInfo {
    pub id: String,
    pub member_count: usize,
}

/// Every item tag found in the instance, sorted by id. Member counts are the
/// expanded counts (nested `#tag` references included), so the palette shows
/// how many items a tag actually matches without resolving on the client.
pub fn list_item_tags(instance_path: &Path) -> Vec<ItemTagInfo> {
    let index = build_tag_index(instance_path);
    let mut out: Vec<ItemTagInfo> = index
        .raw
        .keys()
        .map(|tag| ItemTagInfo {
            id: tag.clone(),
            member_count: index.items(tag).len(),
        })
        .collect();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}
