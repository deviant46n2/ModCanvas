use super::ConfigValue;
use toml_edit::{Array as TomlArray, DocumentMut, Formatted, Item, Table, Value as TomlValue};

/// Apply structured config edits onto an existing TOML document in place,
/// preserving table headers, block comments, ordering, and layout for every
/// key the model leaves unchanged.
///
/// `original` is the current on-disk file content. `root` is the edited model.
/// Values that changed are written over their existing entries (keeping the
/// original key decor); keys the model does not touch are left byte-identical.
pub fn apply_config_to_toml(original: &str, root: &ConfigValue) -> String {
    let mut doc: DocumentMut = match original.parse() {
        Ok(d) => d,
        Err(_) => return original.to_string(),
    };

    let root_table = match root {
        ConfigValue::Object { fields, .. } => fields,
        ConfigValue::Group { fields, .. } => fields,
        _ => return original.to_string(),
    };

    // Apply each top-level field in place. Nested tables are handled
    // recursively so `[section]` headers and their comments survive.
    for (key, value) in root_table {
        apply_toml_value(doc.as_table_mut(), key, value);
    }

    doc.to_string()
}

/// Write a single ConfigValue at `key` inside `table`, recursing into nested
/// tables (which keeps `[section]` headers) and preserving existing decor.
fn apply_toml_value(table: &mut Table, key: &str, value: &ConfigValue) {
    match value {
        ConfigValue::Object { fields, .. } | ConfigValue::Group { fields, .. } => {
            if let Some(Item::Table(child)) = table.get_mut(key) {
                for (k, v) in fields {
                    apply_toml_value(child, k, v);
                }
            } else {
                // Key doesn't exist (or is a scalar) — build a fresh table
                let mut child = Table::new();
                for (k, v) in fields {
                    apply_toml_value(&mut child, k, v);
                }
                let mut item = Item::Table(child);
                if let Some(c) = comment_of(value) {
                    if let Some(child_table) = item.as_table_mut() {
                        child_table.decor_mut().set_suffix(c.clone());
                    }
                }
                table[key] = item;
            }
        }
        _ => {
            let mut new_item = config_value_to_toml_item(value);
            if let Some(existing) = table.get(key) {
                // Preserve the original key's leading comment (prefix decor)
                if let Some(p) = item_prefix(existing) {
                    if let Some(new_val) = new_item.as_value_mut() {
                        new_val.decor_mut().set_prefix(p.as_str().to_owned());
                    }
                }
            }
            table[key] = new_item;
        }
    }
}

/// Copy the prefix decor (leading comment) off any Item type.
fn item_prefix(item: &Item) -> Option<String> {
    match item {
        Item::Value(v) => v.decor().prefix().and_then(|s| s.as_str().map(str::to_owned)),
        Item::Table(t) => t.decor().prefix().and_then(|s| s.as_str().map(str::to_owned)),
        _ => None,
    }
}

fn comment_of(value: &ConfigValue) -> Option<String> {
    match value {
        ConfigValue::String { comment, .. }
        | ConfigValue::Number { comment, .. }
        | ConfigValue::Boolean { comment, .. }
        | ConfigValue::Enum { comment, .. }
        | ConfigValue::Array { comment, .. }
        | ConfigValue::Object { comment, .. }
        | ConfigValue::Color { comment, .. }
        | ConfigValue::Group { comment, .. } => comment.clone(),
    }
}

/// Convert a leaf ConfigValue into a toml_edit Item (value with suffix decor).
fn config_value_to_toml_item(value: &ConfigValue) -> Item {
    let mut val = match value {
        ConfigValue::String { value, .. } => TomlValue::String(Formatted::new(value.clone())),
        ConfigValue::Number { value, .. } => {
            if value.fract() == 0.0 && value.abs() < 9_007_199_254_740_992.0 {
                TomlValue::Integer(Formatted::new(*value as i64))
            } else {
                TomlValue::Float(Formatted::new(*value))
            }
        }
        ConfigValue::Boolean { value, .. } => TomlValue::Boolean(Formatted::new(*value)),
        ConfigValue::Enum { value, .. } => TomlValue::String(Formatted::new(value.clone())),
        ConfigValue::Color { value, .. } => TomlValue::String(Formatted::new(value.clone())),
        ConfigValue::Array { items, .. } => {
            let mut arr = TomlArray::new();
            for item in items {
                if let Item::Value(v) = config_value_to_toml_item(item) {
                    arr.push(v);
                }
            }
            TomlValue::Array(arr)
        }
        _ => TomlValue::String(Formatted::new(String::new())),
    };
    if let Some(c) = comment_of(value) {
        val.decor_mut().set_suffix(c);
    }
    Item::Value(val)
}
