use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use toml_edit::{DocumentMut, Item, Value as TomlValue, Array as TomlArray, InlineTable};

/// A structured config value that can be displayed with friendly UI controls
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ConfigValue {
    #[serde(rename = "string")]
    String {
        value: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        comment: Option<String>,
    },

    #[serde(rename = "number")]
    Number {
        value: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        min: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        max: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        step: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        unit: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        comment: Option<String>,
    },

    #[serde(rename = "boolean")]
    Boolean {
        value: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        comment: Option<String>,
    },

    #[serde(rename = "enum")]
    Enum {
        value: String,
        options: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        comment: Option<String>,
    },

    #[serde(rename = "array")]
    Array {
        items: Vec<ConfigValue>,
        #[serde(skip_serializing_if = "Option::is_none")]
        comment: Option<String>,
    },

    #[serde(rename = "object")]
    Object {
        fields: HashMap<String, ConfigValue>,
        #[serde(skip_serializing_if = "Option::is_none")]
        comment: Option<String>,
    },

    #[serde(rename = "color")]
    Color {
        value: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        comment: Option<String>,
    },

    #[serde(rename = "group")]
    Group {
        label: String,
        fields: HashMap<String, ConfigValue>,
        #[serde(skip_serializing_if = "Option::is_none")]
        comment: Option<String>,
    },
}

/// Parsed config file structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedConfig {
    pub format: String,
    pub root: ConfigValue,
    pub raw: String,
}

/// Parse a config file into a structured representation
pub fn parse_config(content: &str, format: &str) -> Result<ParsedConfig, String> {
    let root = match format.to_lowercase().as_str() {
        "toml" => parse_toml(content)?,
        "json" => parse_json(content)?,
        "yaml" | "yml" => parse_yaml(content)?,
        "properties" => parse_properties(content)?,
        _ => ConfigValue::String {
            value: content.to_string(),
            comment: None,
        },
    };

    Ok(ParsedConfig {
        format: format.to_string(),
        root,
        raw: content.to_string(),
    })
}

fn parse_toml(content: &str) -> Result<ConfigValue, String> {
    let doc: DocumentMut = content.parse().map_err(|e| format!("TOML parse error: {}", e))?;
    // Get the root item from the document
    Ok(toml_edit_to_config_value(doc.as_item()))
}

fn toml_edit_to_config_value(item: &Item) -> ConfigValue {
    match item {
        Item::Value(v) => match v {
            TomlValue::String(s) => {
            let val = s.value().to_string();
                    if looks_like_color(&val) {
                        ConfigValue::Color {
                            value: val.clone(),
                            comment: s.decor().suffix().and_then(|c| c.as_str()).map(|c| c.to_string()),
                        }
                    } else {
                        ConfigValue::String {
                            value: val,
                            comment: s.decor().suffix().and_then(|c| c.as_str()).map(|c| c.to_string()),
                        }
                    }
            }
            TomlValue::Integer(i) => ConfigValue::Number {
                value: *i.value() as f64,
                min: None,
                max: None,
                step: Some(1.0),
                unit: None,
                comment: i.decor().suffix().and_then(|c| c.as_str()).map(|c| c.to_string()),
            },
            TomlValue::Float(f) => ConfigValue::Number {
                value: *f.value(),
                min: None,
                max: None,
                step: Some(0.1),
                unit: None,
                comment: f.decor().suffix().and_then(|c| c.as_str()).map(|c| c.to_string()),
            },
            TomlValue::Boolean(b) => ConfigValue::Boolean {
                value: *b.value(),
                comment: b.decor().suffix().and_then(|c| c.as_str()).map(|c| c.to_string()),
            },
            TomlValue::Array(arr) => {
                let items = arr.iter().map(toml_edit_value_to_config_value).collect();
                ConfigValue::Array {
                    items,
                    comment: arr.decor().suffix().and_then(|c| c.as_str()).map(|c| c.to_string()),
                }
            }
            TomlValue::InlineTable(table) => {
                let fields: HashMap<String, ConfigValue> = table
                    .iter()
                    .map(|(k, v)| (k.to_string(), toml_edit_value_to_config_value(v)))
                    .collect();
                ConfigValue::Object {
                    fields,
                    comment: None,
                }
            }
            _ => ConfigValue::String {
                value: String::new(),
                comment: None,
            },
        },
        Item::Table(table) => {
            let fields: HashMap<String, ConfigValue> = table
                .iter()
                .map(|(k, v)| (k.to_string(), toml_edit_to_config_value(v)))
                .collect();
            ConfigValue::Object {
                fields,
                comment: None,
            }
        }
        Item::None => ConfigValue::String {
            value: String::new(),
            comment: None,
        },
        _ => ConfigValue::String {
            value: String::new(),
            comment: None,
        },
    }
}

fn toml_edit_value_to_config_value(v: &TomlValue) -> ConfigValue {
    match v {
        TomlValue::String(s) => {
            let val = s.value().to_string();
            if looks_like_color(&val) {
                ConfigValue::Color {
                    value: val.clone(),
                    comment: s.decor().suffix().and_then(|c| c.as_str()).map(|c| c.to_string()),
                }
            } else {
                ConfigValue::String {
                    value: val,
                    comment: s.decor().suffix().and_then(|c| c.as_str()).map(|c| c.to_string()),
                }
            }
        }
        TomlValue::Integer(i) => ConfigValue::Number {
            value: *i.value() as f64,
            min: None,
            max: None,
            step: Some(1.0),
            unit: None,
            comment: i.decor().suffix().and_then(|c| c.as_str()).map(|c| c.to_string()),
        },
        TomlValue::Float(f) => ConfigValue::Number {
            value: *f.value(),
            min: None,
            max: None,
            step: Some(0.1),
            unit: None,
            comment: f.decor().suffix().and_then(|c| c.as_str()).map(|c| c.to_string()),
        },
        TomlValue::Boolean(b) => ConfigValue::Boolean {
            value: *b.value(),
            comment: b.decor().suffix().and_then(|c| c.as_str()).map(|c| c.to_string()),
        },
        TomlValue::Array(arr) => {
            let items = arr.iter().map(toml_edit_value_to_config_value).collect();
            ConfigValue::Array {
                items,
                comment: arr.decor().suffix().and_then(|c| c.as_str()).map(|c| c.to_string()),
            }
        }
        TomlValue::InlineTable(table) => {
            let fields: HashMap<String, ConfigValue> = table
                .iter()
                .map(|(k, v)| (k.to_string(), toml_edit_value_to_config_value(v)))
                .collect();
            ConfigValue::Object {
                fields,
                comment: None,
            }
        }
        _ => ConfigValue::String {
            value: String::new(),
            comment: None,
        },
    }
}

fn parse_json(content: &str) -> Result<ConfigValue, String> {
    let json_value: serde_json::Value =
        serde_json::from_str(content).map_err(|e| format!("JSON parse error: {}", e))?;
    Ok(json_to_config_value(&json_value))
}

fn json_to_config_value(value: &serde_json::Value) -> ConfigValue {
    match value {
        serde_json::Value::String(s) => {
            if looks_like_color(s) {
                ConfigValue::Color {
                    value: s.clone(),
                    comment: None,
                }
            } else {
                ConfigValue::String {
                    value: s.clone(),
                    comment: None,
                }
            }
        }
        serde_json::Value::Number(n) => ConfigValue::Number {
            value: n.as_f64().unwrap_or(0.0),
            min: None,
            max: None,
            step: None,
            unit: None,
            comment: None,
        },
        serde_json::Value::Bool(b) => ConfigValue::Boolean {
            value: *b,
            comment: None,
        },
        serde_json::Value::Array(arr) => {
            let items = arr.iter().map(json_to_config_value).collect();
            ConfigValue::Array {
                items,
                comment: None,
            }
        }
        serde_json::Value::Object(obj) => {
            let fields: HashMap<String, ConfigValue> = obj
                .iter()
                .map(|(k, v)| (k.clone(), json_to_config_value(v)))
                .collect();
            ConfigValue::Object {
                fields,
                comment: None,
            }
        }
        serde_json::Value::Null => ConfigValue::String {
            value: String::new(),
            comment: None,
        },
    }
}

fn parse_yaml(content: &str) -> Result<ConfigValue, String> {
    let yaml_value: serde_yaml::Value =
        serde_yaml::from_str(content).map_err(|e| format!("YAML parse error: {}", e))?;
    Ok(yaml_to_config_value(&yaml_value))
}

fn yaml_to_config_value(value: &serde_yaml::Value) -> ConfigValue {
    match value {
        serde_yaml::Value::String(s) => {
            if looks_like_color(s) {
                ConfigValue::Color {
                    value: s.clone(),
                    comment: None,
                }
            } else {
                ConfigValue::String {
                    value: s.clone(),
                    comment: None,
                }
            }
        }
        serde_yaml::Value::Number(n) => ConfigValue::Number {
            value: n.as_f64().unwrap_or(0.0),
            min: None,
            max: None,
            step: None,
            unit: None,
            comment: None,
        },
        serde_yaml::Value::Bool(b) => ConfigValue::Boolean {
            value: *b,
            comment: None,
        },
        serde_yaml::Value::Sequence(arr) => {
            let items = arr.iter().map(yaml_to_config_value).collect();
            ConfigValue::Array {
                items,
                comment: None,
            }
        }
        serde_yaml::Value::Mapping(map) => {
            let fields: HashMap<String, ConfigValue> = map
                .iter()
                .filter_map(|(k, v)| {
                    if let serde_yaml::Value::String(key) = k {
                        Some((key.clone(), yaml_to_config_value(v)))
                    } else {
                        None
                    }
                })
                .collect();
            ConfigValue::Object {
                fields,
                comment: None,
            }
        }
        serde_yaml::Value::Null => ConfigValue::String {
            value: String::new(),
            comment: None,
        },
        serde_yaml::Value::Tagged(tagged) => yaml_to_config_value(&tagged.value),
    }
}

fn parse_properties(content: &str) -> Result<ConfigValue, String> {
    let mut fields = HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with('!') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim().to_string();
            let value = value.trim().to_string();

            // Try to parse value as typed
            let config_value = if let Ok(b) = value.parse::<bool>() {
                ConfigValue::Boolean {
                    value: b,
                    comment: None,
                }
            } else if let Ok(i) = value.parse::<i64>() {
                ConfigValue::Number {
                    value: i as f64,
                    min: None,
                    max: None,
                    step: Some(1.0),
                    unit: None,
                    comment: None,
                }
            } else if let Ok(f) = value.parse::<f64>() {
                ConfigValue::Number {
                    value: f,
                    min: None,
                    max: None,
                    step: Some(0.1),
                    unit: None,
                    comment: None,
                }
            } else if looks_like_color(&value) {
                ConfigValue::Color {
                    value,
                    comment: None,
                }
            } else {
                ConfigValue::String {
                    value,
                    comment: None,
                }
            };

            fields.insert(key, config_value);
        }
    }

    Ok(ConfigValue::Object {
        fields,
        comment: None,
    })
}

fn looks_like_color(value: &str) -> bool {
    let v = value.trim();
    // Hex color: #RGB, #RRGGBB, #RRGGBBAA
    if v.starts_with('#') && (v.len() == 4 || v.len() == 7 || v.len() == 9) {
        return v[1..].chars().all(|c| c.is_ascii_hexdigit());
    }
    // RGB/RGBA integer format: 16777215, etc.
    false
}

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

#[cfg(test)]
mod tests {
    use super::*;

    // ── TOML comment preservation ──

    #[test]
    fn test_toml_parse_with_comments() {
        let toml = r#"# Top-level comment
key = "value" # inline comment
"#;
        let parsed = parse_toml(toml).unwrap();
        match &parsed {
            ConfigValue::Object { fields, .. } => {
                assert!(fields.contains_key("key"));
                if let Some(ConfigValue::String { value, comment }) = fields.get("key") {
                    assert_eq!(value, "value");
                    assert_eq!(comment.as_deref(), Some(" # inline comment"));
                } else {
                    panic!("expected String field");
                }
            }
            _ => panic!("expected Object"),
        }
    }

    #[test]
    fn test_toml_multi_key_comments() {
        let toml = r#"# Server config
[server]
port = 25565 # Default port
# IP to bind to
host = "0.0.0.0"
"#;
        let parsed = parse_toml(toml).unwrap();
        match &parsed {
            ConfigValue::Object { fields, .. } => {
                let server = fields.get("server").unwrap();
                match server {
                    ConfigValue::Object { fields, .. } => {
                        assert!(fields.contains_key("port"));
                        assert!(fields.contains_key("host"));
                        if let Some(ConfigValue::Number { comment, .. }) = fields.get("port") {
                            assert_eq!(comment.as_deref(), Some(" # Default port"));
                        } else {
                            panic!("expected Number for port");
                        }
                    }
                    _ => panic!("expected Object for [server]"),
                }
            }
            _ => panic!("expected Object"),
        }
    }

    #[test]
    fn test_toml_parse_boolean_with_comment() {
        let toml = r#"enabled = true # turn on feature
"#;
        let parsed = parse_toml(toml).unwrap();
        match &parsed {
            ConfigValue::Object { fields, .. } => {
                if let Some(ConfigValue::Boolean { value, comment }) = fields.get("enabled") {
                    assert!(value);
                    assert_eq!(comment.as_deref(), Some(" # turn on feature"));
                } else {
                    panic!("expected Boolean");
                }
            }
            _ => panic!("expected Object"),
        }
    }

    #[test]
    fn test_toml_parse_empty() {
        let parsed = parse_toml("").unwrap();
        match parsed {
            ConfigValue::Object { fields, .. } => {
                assert!(fields.is_empty());
            }
            _ => panic!("expected Object"),
        }
    }

    #[test]
    fn test_toml_parse_integer_comment() {
        let toml = r#"timeout = 30 # seconds
"#;
        let parsed = parse_toml(toml).unwrap();
        match &parsed {
            ConfigValue::Object { fields, .. } => {
                if let Some(ConfigValue::Number { value, comment, .. }) = fields.get("timeout") {
                    assert_eq!(*value, 30.0);
                    assert_eq!(comment.as_deref(), Some(" # seconds"));
                } else {
                    panic!("expected Number");
                }
            }
            _ => panic!("expected Object"),
        }
    }

    #[test]
    fn test_toml_parse_float_comment() {
        let toml = r#"rate = 3.14 # pi-ish
"#;
        let parsed = parse_toml(toml).unwrap();
        match &parsed {
            ConfigValue::Object { fields, .. } => {
                if let Some(ConfigValue::Number { value, comment, .. }) = fields.get("rate") {
                    assert!((value - 3.14).abs() < 1e-10);
                    assert_eq!(comment.as_deref(), Some(" # pi-ish"));
                } else {
                    panic!("expected Number");
                }
            }
            _ => panic!("expected Object"),
        }
    }

    #[test]
    fn test_toml_parse_array_comment() {
        let toml = r#"nums = [1, 2, 3] # a list
"#;
        let parsed = parse_toml(toml).unwrap();
        match &parsed {
            ConfigValue::Object { fields, .. } => {
                if let Some(ConfigValue::Array { items, comment }) = fields.get("nums") {
                    assert_eq!(items.len(), 3);
                    assert_eq!(comment.as_deref(), Some(" # a list"));
                } else {
                    panic!("expected Array");
                }
            }
            _ => panic!("expected Object"),
        }
    }

    // ── JSON parse ──

    #[test]
    fn test_parse_json_simple() {
        let json = r#"{"name": "test", "count": 42}"#;
        let parsed = parse_json(json).unwrap();
        match &parsed {
            ConfigValue::Object { fields, .. } => {
                assert!(fields.contains_key("name"));
                assert!(fields.contains_key("count"));
            }
            _ => panic!("expected Object"),
        }
    }

    #[test]
    fn test_parse_json_color() {
        let json = r##"{"primary": "#FF5733"}"##;
        let parsed = parse_json(json).unwrap();
        match &parsed {
            ConfigValue::Object { fields, .. } => {
                if let Some(ConfigValue::Color { value, .. }) = fields.get("primary") {
                    assert_eq!(value, "#FF5733");
                } else {
                    panic!("expected Color");
                }
            }
            _ => panic!("expected Object"),
        }
    }

    #[test]
    fn test_parse_json_null() {
        let parsed = parse_json("null").unwrap();
        match parsed {
            ConfigValue::String { value, .. } => {
                assert!(value.is_empty());
            }
            _ => panic!("expected String"),
        }
    }

    // ── YAML parse ──

    #[test]
    fn test_parse_yaml_simple() {
        let yaml = "name: test\ncount: 42\n";
        let parsed = parse_yaml(yaml).unwrap();
        match &parsed {
            ConfigValue::Object { fields, .. } => {
                assert!(fields.contains_key("name"));
                assert!(fields.contains_key("count"));
            }
            _ => panic!("expected Object"),
        }
    }

    // ── Properties parse ──

    #[test]
    fn test_parse_properties_simple() {
        let props = "key1 = value1\nkey2 = true\nkey3 = 42\n";
        let parsed = parse_properties(props).unwrap();
        match &parsed {
            ConfigValue::Object { fields, .. } => {
                assert!(fields.contains_key("key1"));
                assert!(fields.contains_key("key2"));
                assert!(fields.contains_key("key3"));
            }
            _ => panic!("expected Object"),
        }
    }

    // ── config_value_to_string round-trip ──

    #[test]
    fn test_toml_round_trip_string() {
        let value = ConfigValue::String {
            value: "hello".to_string(),
            comment: Some(" # greeting".to_string()),
        };
        let result = config_value_to_string(&value, "toml");
        assert!(result.contains("hello"));
        assert!(result.contains("greeting"));
    }

    #[test]
    fn test_toml_round_trip_number() {
        let value = ConfigValue::Number {
            value: 42.0,
            min: None,
            max: None,
            step: Some(1.0),
            unit: None,
            comment: Some(" # answer".to_string()),
        };
        let result = config_value_to_string(&value, "toml");
        assert!(result.contains("42"));
        assert!(result.contains("answer"));
    }

    #[test]
    fn test_toml_round_trip_boolean() {
        let value = ConfigValue::Boolean {
            value: true,
            comment: Some(" # feature flag".to_string()),
        };
        let result = config_value_to_string(&value, "toml");
        assert!(result.contains("true"));
        assert!(result.contains("feature"));
    }

    #[test]
    fn test_json_round_trip() {
        let value = ConfigValue::Object {
            fields: {
                let mut m = HashMap::new();
                m.insert("name".into(), ConfigValue::String { value: "test".into(), comment: None });
                m.insert("count".into(), ConfigValue::Number { value: 10.0, min: None, max: None, step: None, unit: None, comment: None });
                m
            },
            comment: None,
        };
        let result = config_value_to_string(&value, "json");
        assert!(result.contains("\"name\""));
        assert!(result.contains("\"test\""));
        assert!(result.contains("10"));
    }

    #[test]
    fn test_yaml_round_trip() {
        let value = ConfigValue::Object {
            fields: {
                let mut m = HashMap::new();
                m.insert("key".into(), ConfigValue::String { value: "val".into(), comment: None });
                m
            },
            comment: None,
        };
        let result = config_value_to_string(&value, "yaml");
        assert!(result.contains("key"));
        assert!(result.contains("val"));
    }

    #[test]
    fn test_properties_round_trip() {
        let value = ConfigValue::Object {
            fields: {
                let mut m = HashMap::new();
                m.insert("key".into(), ConfigValue::String { value: "val".into(), comment: None });
                m
            },
            comment: None,
        };
        let result = config_value_to_string(&value, "properties");
        assert!(result.contains("key = val"));
    }

    // ── looks_like_color ──

    #[test]
    fn test_looks_like_color_hex() {
        assert!(looks_like_color("#FFF"));
        assert!(looks_like_color("#FF5733"));
        assert!(looks_like_color("#FF5733AA"));
        assert!(!looks_like_color("not a color"));
        assert!(!looks_like_color("#GGG"));
        assert!(!looks_like_color("16777215"));
    }

    // ── Full parse ──

    #[test]
    fn test_parse_config_toml() {
        let toml = r#"title = "ModCanvas"
version = 1
[section]
enabled = true
"#;
        let result = parse_config(toml, "toml").unwrap();
        assert_eq!(result.format, "toml");
        match &result.root {
            ConfigValue::Object { fields, .. } => {
                assert!(fields.contains_key("title"));
                assert!(fields.contains_key("version"));
                assert!(fields.contains_key("section"));
            }
            _ => panic!("expected Object"),
        }
    }

    #[test]
    fn test_parse_config_unknown_format() {
        let result = parse_config("raw text", "unknown").unwrap();
        assert_eq!(result.format, "unknown");
        match &result.root {
            ConfigValue::String { value, .. } => {
                assert_eq!(value, "raw text");
            }
            _ => panic!("expected String"),
        }
    }

    #[test]
    fn test_toml_invalid_syntax() {
        let result = parse_toml("key = = bad");
        assert!(result.is_err());
    }

    #[test]
    fn test_json_invalid_syntax() {
        let result = parse_json("{bad json}");
        assert!(result.is_err());
    }

    #[test]
    fn test_yaml_invalid_syntax() {
        let result = parse_yaml(":");
        assert!(result.is_err());
    }
}
