use std::collections::HashMap;
use super::{looks_like_color, ConfigValue};

pub(super) fn parse_json(content: &str) -> Result<ConfigValue, String> {
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

pub(super) fn parse_yaml(content: &str) -> Result<ConfigValue, String> {
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

pub(super) fn parse_properties(content: &str) -> Result<ConfigValue, String> {
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
