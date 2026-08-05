use super::*;
use std::collections::HashMap;

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

    // ── apply_config_to_toml in-place update ──

    #[test]
    fn test_apply_config_to_toml_preserves_sections_and_comments() {
        let original = r#"# top comment
title = "ModCanvas" # title comment
version = 1

# section header comment
[section]
enabled = true # flag
count = 42
"#;

        // Simulate an edit: change `enabled` to false, keep everything else.
        let parsed = parse_config(original, "toml").unwrap();
        let mut root = parsed.root;
        if let ConfigValue::Object { fields, .. } = &mut root {
            if let Some(ConfigValue::Object { fields, .. }) = fields.get_mut("section") {
                if let Some(ConfigValue::Boolean { value, .. }) = fields.get_mut("enabled") {
                    *value = false;
                }
            }
        }

        let updated = apply_config_to_toml(original, &root);

        assert!(updated.contains("# top comment"), "root block comment preserved");
        assert!(updated.contains("title = \"ModCanvas\""), "unchanged title kept");
        assert!(updated.contains("# title comment"), "inline title comment preserved");
        assert!(updated.contains("# section header comment"), "section header comment preserved");
        assert!(updated.contains("[section]"), "section header preserved");
        assert!(updated.contains("enabled = false"), "edited value applied: {updated}");
        assert!(!updated.contains("enabled = true"), "old value gone");
        assert!(updated.contains("count = 42"), "unchanged section field kept");
    }

    #[test]
    fn test_apply_config_to_toml_adds_missing_field() {
        let original = r#"title = "ModCanvas"
[section]
enabled = true
"#;
        let parsed = parse_config(original, "toml").unwrap();
        let mut root = parsed.root;
        if let ConfigValue::Object { fields, .. } = &mut root {
            if let Some(ConfigValue::Object { fields, .. }) = fields.get_mut("section") {
                fields.insert("new_key".into(), ConfigValue::String { value: "hello".into(), comment: None });
            }
        }

        let updated = apply_config_to_toml(original, &root);
        assert!(updated.contains("new_key = \"hello\""), "new field added: {updated}");
        assert!(updated.contains("[section]"), "section preserved");
        assert!(updated.contains("enabled = true"), "existing field kept");
    }

    #[test]
    fn test_apply_config_to_toml_invalid_original_returns_original() {
        let original = "this is not = valid toml";
        let parsed = parse_config(original, "toml");
        if let Ok(parsed) = parsed {
            let updated = apply_config_to_toml(original, &parsed.root);
            assert_eq!(updated, original, "invalid original returned unchanged");
        }
    }
