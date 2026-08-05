use super::ConfigValue;
use toml_edit::{Array as TomlArray, DocumentMut, InlineTable, Item, Value as TomlValue};

/// Convert a ConfigValue back to a string for saving
pub fn config_value_to_string(value: &ConfigValue, format: &str) -> String {
    match format.to_lowercase().as_str() {
        "toml" => {
            let mut doc = DocumentMut::new();
            config_value_to_toml_edit(value, &mut doc, "");
            doc.to_string()
        }
        "json" => {
            let json_value = config_value_to_json(value);
            serde_json::to_string_pretty(&json_value).unwrap_or_default()
        }
        "yaml" | "yml" => {
            let yaml_value = config_value_to_yaml(value);
            serde_yaml::to_string(&yaml_value).unwrap_or_default()
        }
        "properties" => {
            config_value_to_properties(value)
        }
        _ => config_value_to_raw_string(value),
    }
}

fn config_value_to_toml_edit(value: &ConfigValue, doc: &mut DocumentMut, _prefix: &str) {
    match value {
        ConfigValue::String { value, comment } => {
            let mut val = TomlValue::String(toml_edit::Formatted::new(value.clone()));
            if let Some(c) = comment {
                val.decor_mut().set_suffix(c.clone());
            }
            doc[""] = Item::Value(val);
        }
        ConfigValue::Number { value, comment, .. } => {
            let mut val = TomlValue::Float(toml_edit::Formatted::new(*value));
            if let Some(c) = comment {
                val.decor_mut().set_suffix(c.clone());
            }
            doc[""] = Item::Value(val);
        }
        ConfigValue::Boolean { value, comment } => {
            let mut val = TomlValue::Boolean(toml_edit::Formatted::new(*value));
            if let Some(c) = comment {
                val.decor_mut().set_suffix(c.clone());
            }
            doc[""] = Item::Value(val);
        }
        ConfigValue::Enum { value, .. } => {
            let mut val = TomlValue::String(toml_edit::Formatted::new(value.clone()));
            doc[""] = Item::Value(val);
        }
        ConfigValue::Color { value, comment } => {
            let mut val = TomlValue::String(toml_edit::Formatted::new(value.clone()));
            if let Some(c) = comment {
                val.decor_mut().set_suffix(c.clone());
            }
            doc[""] = Item::Value(val);
        }
        ConfigValue::Array { items, comment } => {
            let mut arr = TomlArray::new();
            for item in items {
                let mut item_doc = DocumentMut::new();
                config_value_to_toml_edit(item, &mut item_doc, "");
                if let Some(Item::Value(v)) = item_doc.get("") {
                    arr.push(v.clone());
                }
            }
            let mut val = TomlValue::Array(arr);
            if let Some(c) = comment {
                val.decor_mut().set_suffix(c.clone());
            }
            doc[""] = Item::Value(val);
        }
        ConfigValue::Object { fields, comment } => {
            let mut table = InlineTable::new();
            for (k, v) in fields {
                let mut item_doc = DocumentMut::new();
                config_value_to_toml_edit(v, &mut item_doc, "");
                if let Some(Item::Value(val)) = item_doc.get("") {
                    table.insert(k.as_str(), val.clone());
                }
            }
            let mut val = TomlValue::InlineTable(table);
            if let Some(c) = comment {
                val.decor_mut().set_suffix(c.clone());
            }
            doc[""] = Item::Value(val);
        }
        ConfigValue::Group { fields, label, comment } => {
            let mut table = InlineTable::new();
            for (k, v) in fields {
                let mut item_doc = DocumentMut::new();
                config_value_to_toml_edit(v, &mut item_doc, "");
                if let Some(Item::Value(val)) = item_doc.get("") {
                    table.insert(k.as_str(), val.clone());
                }
            }
            let mut val = TomlValue::InlineTable(table);
            if let Some(c) = comment {
                val.decor_mut().set_suffix(c.clone());
            }
            doc[""] = Item::Value(val);
        }
    }
}

fn config_value_to_json(value: &ConfigValue) -> serde_json::Value {
    match value {
        ConfigValue::String { value, .. } => serde_json::Value::String(value.clone()),
        ConfigValue::Number { value, .. } => {
            serde_json::Value::Number(serde_json::Number::from_f64(*value).expect("Invalid JSON number"))
        }
        ConfigValue::Boolean { value, .. } => serde_json::Value::Bool(*value),
        ConfigValue::Enum { value, .. } => serde_json::Value::String(value.clone()),
        ConfigValue::Color { value, .. } => serde_json::Value::String(value.clone()),
        ConfigValue::Array { items, .. } => {
            let arr = items.iter().map(config_value_to_json).collect();
            serde_json::Value::Array(arr)
        }
        ConfigValue::Object { fields, .. } => {
            let map: serde_json::Map<String, serde_json::Value> = fields
                .iter()
                .map(|(k, v)| (k.clone(), config_value_to_json(v)))
                .collect();
            serde_json::Value::Object(map)
        }
        ConfigValue::Group { fields, .. } => {
            let map: serde_json::Map<String, serde_json::Value> = fields
                .iter()
                .map(|(k, v)| (k.clone(), config_value_to_json(v)))
                .collect();
            serde_json::Value::Object(map)
        }
    }
}

fn config_value_to_yaml(value: &ConfigValue) -> serde_yaml::Value {
    match value {
        ConfigValue::String { value, .. } => serde_yaml::Value::String(value.clone()),
        ConfigValue::Number { value, .. } => {
            serde_yaml::Value::Number(serde_yaml::Number::from(*value))
        }
        ConfigValue::Boolean { value, .. } => serde_yaml::Value::Bool(*value),
        ConfigValue::Enum { value, .. } => serde_yaml::Value::String(value.clone()),
        ConfigValue::Color { value, .. } => serde_yaml::Value::String(value.clone()),
        ConfigValue::Array { items, .. } => {
            let arr = items.iter().map(config_value_to_yaml).collect();
            serde_yaml::Value::Sequence(arr)
        }
        ConfigValue::Object { fields, .. } => {
            let map: serde_yaml::Mapping = fields
                .iter()
                .map(|(k, v)| {
                    (
                        serde_yaml::Value::String(k.clone()),
                        config_value_to_yaml(v),
                    )
                })
                .collect();
            serde_yaml::Value::Mapping(map)
        }
        ConfigValue::Group { fields, .. } => {
            let map: serde_yaml::Mapping = fields
                .iter()
                .map(|(k, v)| {
                    (
                        serde_yaml::Value::String(k.clone()),
                        config_value_to_yaml(v),
                    )
                })
                .collect();
            serde_yaml::Value::Mapping(map)
        }
    }
}

fn config_value_to_properties(value: &ConfigValue) -> String {
    let mut lines = Vec::new();
    match value {
        ConfigValue::Object { fields, .. } => {
            for (k, v) in fields {
                lines.push(format!("{} = {}", k, config_value_to_raw_string(v)));
            }
        }
        _ => {
            lines.push(config_value_to_raw_string(value));
        }
    }
    lines.join("\n")
}

fn config_value_to_raw_string(value: &ConfigValue) -> String {
    match value {
        ConfigValue::String { value, .. } => value.clone(),
        ConfigValue::Number { value, .. } => value.to_string(),
        ConfigValue::Boolean { value, .. } => value.to_string(),
        ConfigValue::Enum { value, .. } => value.clone(),
        ConfigValue::Color { value, .. } => value.clone(),
        ConfigValue::Array { items, .. } => {
            let strs: Vec<String> = items.iter().map(config_value_to_raw_string).collect();
            format!("[{}]", strs.join(", "))
        }
        ConfigValue::Object { fields, .. } => {
            let entries: Vec<String> = fields
                .iter()
                .map(|(k, v)| format!("{}={}", k, config_value_to_raw_string(v)))
                .collect();
            entries.join(", ")
        }
        ConfigValue::Group { fields, .. } => {
            let entries: Vec<String> = fields
                .iter()
                .map(|(k, v)| format!("{}={}", k, config_value_to_raw_string(v)))
                .collect();
            entries.join(", ")
        }
    }
}
