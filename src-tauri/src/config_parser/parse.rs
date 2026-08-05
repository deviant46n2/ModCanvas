use std::collections::HashMap;
use super::parse_flat::{parse_json, parse_properties, parse_yaml};
use super::{looks_like_color, ConfigValue, ParsedConfig};
use toml_edit::{DocumentMut, Item, Value as TomlValue};

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

pub(super) fn parse_toml(content: &str) -> Result<ConfigValue, String> {
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
