use super::*;
use crate::imports::snbt::{SnbtValue, parse_snbt, compound_to_snbt};
use std::collections::HashMap;

#[test]
fn test_snbt_roundtrip() {
    let mut map = HashMap::new();
    map.insert("title".to_string(), ce(SnbtValue::String("Test Quest".to_string())));
    map.insert("x".to_string(), ce(SnbtValue::Double(100.0)));
    map.insert("optional".to_string(), ce(SnbtValue::Byte(1)));
    map.insert("count".to_string(), ce(SnbtValue::Long(64)));

    let snbt_str = compound_to_snbt(&map);
    assert!(snbt_str.contains("title: \"Test Quest\""));
    assert!(snbt_str.contains("x: 100.0d"));
    assert!(snbt_str.contains("optional: 1b"));
    assert!(snbt_str.contains("count: 64L"));
}

#[test]
fn test_snbt_roundtrip_parse() {
    let mut map = HashMap::new();
    map.insert("title".to_string(), ce(SnbtValue::String("Hello World".to_string())));
    map.insert("count".to_string(), ce(SnbtValue::Int(42)));

    let snbt_str = compound_to_snbt(&map);
    let parsed = parse_snbt(&snbt_str).unwrap();
    let m = parsed.as_compound().unwrap();
    assert_eq!(m.get_str("title"), Some("Hello World"));
    assert_eq!(m.get_i64("count"), Some(42));
}

#[test]
fn test_format_detection() {
    let tmp = tempfile::tempdir().unwrap();
    // Create SNBT marker
    std::fs::write(tmp.path().join("data.snbt"), "{}").unwrap();
    assert_eq!(detect_format(tmp.path()), FtBQuestsFormat::Snbt);

    // Create Json5 marker
    let tmp2 = tempfile::tempdir().unwrap();
    std::fs::write(tmp2.path().join("data.json5"), "{}").unwrap();
    assert_eq!(detect_format(tmp2.path()), FtBQuestsFormat::Json5);
}
