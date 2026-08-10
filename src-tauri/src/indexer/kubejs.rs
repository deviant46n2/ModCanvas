use std::collections::HashMap;

/// Namespace a bare KubeJS item id with the adapter-provided default.
pub(super) fn namespace_kubejs_id(id: &str, default_ns: &str) -> String {
    if id.contains(':') {
        id.to_string()
    } else {
        format!("{default_ns}:{id}")
    }
}

/// Resolve a `.texture('ns:path')` ref to its index value. Bare refs inherit
/// the item's namespace (the scan's texture keys are `ns:path`). The value is
/// a compact descriptor (`jar:<abs>!<zip>`) — never image bytes; displayable
/// URLs are materialized lazily on demand.
pub(super) fn resolve_kubejs_texture(
    texture: &str,
    item_id: &str,
    default_ns: &str,
    textures: &HashMap<String, String>,
) -> Option<String> {
    let key = if texture.contains(':') {
        texture.to_string()
    } else {
        let ns = item_id.split_once(':').map(|(n, _)| n).unwrap_or(default_ns);
        format!("{ns}:{texture}")
    };
    textures.get(&key).cloned()
}
