use super::parse::parse_toml;
use super::parse_flat::{parse_json, parse_properties, parse_yaml};
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
    #[allow(clippy::approx_constant)]
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
