use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_parse;

mod parse;
mod parse_flat;
mod serialize;
mod toml_update;

pub use parse::parse_config;
pub use serialize::config_value_to_string;
pub use toml_update::apply_config_to_toml;

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

fn looks_like_color(value: &str) -> bool {
    let v = value.trim();
    // Hex color: #RGB, #RRGGBB, #RRGGBBAA
    if v.starts_with('#') && (v.len() == 4 || v.len() == 7 || v.len() == 9) {
        return v[1..].chars().all(|c| c.is_ascii_hexdigit());
    }
    // RGB/RGBA integer format: 16777215, etc.
    false
}
