use super::*;
use std::path::Path;
use crate::imports::snbt::{SnbtValue, CommentedSnbt, compound_to_snbt};

    #[test]
    fn store_and_lookup() {
        let mut sidecar = SnbtSidecar::new();
        store_chapter(&mut sidecar, "ch1", "{id: \"ch1\"}");
        assert_eq!(sidecar.get("chapter:ch1").unwrap(), "{id: \"ch1\"}");
        assert!(!sidecar.contains_key("chapter:ch2"));
    }

    #[test]
    fn merge_preserves_comments_on_unchanged_fields() {
        // The parser's `collect_trailing_comment()` grabs the first Comment token
        // after a value as that field's trailing comment.  A comment between two
        // fields is trailing on the *preceding* field, not leading on the next.
        //
        // In this input:
        //   `/* a */` becomes leading comment on `x`
        //   `/* b */` becomes trailing comment on `x` (consumed after x's value)
        //   `y` has no comments.
        //
        // To test: x unchanged → both comments survive. y changed → no comment.

        let raw = r#"{
  /* a */
  x: 100.0d
  /* b */
  y: 200.0d
  quests: []
}"#;
        let mut chapter = HashMap::new();
        chapter.insert("x".to_string(), CommentedSnbt::new(SnbtValue::Double(100.0)));
        chapter.insert("y".to_string(), CommentedSnbt::new(SnbtValue::Double(999.0))); // changed

        let new_quests: Vec<SnbtValue> = vec![];

        let mut sidecar = SnbtSidecar::new();
        store_chapter(&mut sidecar, "merge_test_ch", raw);

        let merged = merge_quests_in_chapter(&sidecar, "merge_test_ch", &chapter, &new_quests).unwrap();
        let s = compound_to_snbt(&merged);

        // x unchanged → original entry preserved (includes leading "/* a */" and trailing "/* b */")
        assert!(s.contains("/* a */"), "x leading comment preserved");
        assert!(s.contains("/* b */"), "x trailing comment preserved");
        // y changed → original entry not used, no comments on y
        assert!(!s.contains("200.0d"), "y uses new value");
        assert!(s.contains("999.0d"), "y uses new value");
    }

    #[test]
    fn values_equal_cross_type() {
        assert!(values_equal(&SnbtValue::Byte(1), &SnbtValue::Int(1)));
        assert!(values_equal(&SnbtValue::Long(42), &SnbtValue::Int(42)));
        assert!(!values_equal(&SnbtValue::Int(1), &SnbtValue::Int(2)));
    }

    #[test]
    fn build_sidecar_from_disk_captures_chapters_and_book_files() {
        let dir = tempfile::tempdir().unwrap();
        let quests = dir.path().join("config").join("ftbquests").join("quests");
        std::fs::create_dir_all(&quests).unwrap();

        // Subdirs chapter with a comment
        let ch_dir = quests.join("Chapter_A");
        std::fs::create_dir_all(&ch_dir).unwrap();
        std::fs::write(ch_dir.join("chapter.snbt"), "{id: \"chA\" /* keep me */ title: \"Chapter A\" quests: []}").unwrap();
        // Flat chapters layout
        let chapters_dir = quests.join("chapters");
        std::fs::create_dir_all(&chapters_dir).unwrap();
        std::fs::write(chapters_dir.join("Chapter_B.snbt"), "{id: \"chB\" title: \"Chapter B\" quests: []}").unwrap();
        // Standalone quest file
        std::fs::write(ch_dir.join("q1.snbt"), "{id: \"q1\" title: \"Quest 1\"}").unwrap();
        // Book files
        std::fs::write(quests.join("data.snbt"), "{version: 13L /* v */}").unwrap();
        std::fs::write(quests.join("chapter_groups.snbt"), "{chapter_groups: []}").unwrap();
        let rt_dir = quests.join("reward_tables");
        std::fs::create_dir_all(&rt_dir).unwrap();
        std::fs::write(rt_dir.join("0000000000000001.snbt"), "{id: \"0000000000000001\" rewards: []}").unwrap();

        let sidecar = build_sidecar_from_quests_dir(&quests);

        assert!(sidecar.contains_key("chapter:chA"), "subdirs chapter captured");
        assert!(sidecar.contains_key("chapter:chB"), "flat chapters captured");
        assert!(sidecar.contains_key("quest:q1"), "standalone quest captured");
        assert!(sidecar.contains_key("book:data"), "data.snbt captured");
        assert!(sidecar.contains_key("book:chapter_groups"), "chapter_groups.snbt captured");
        assert!(sidecar.contains_key("book:reward_table:0000000000000001"), "reward table captured");
        assert!(sidecar.get("chapter:chA").unwrap().contains("keep me"), "raw content preserved");
    }

    #[test]
    fn build_sidecar_from_nonexistent_dir_is_empty() {
        let sidecar = build_sidecar_from_quests_dir(Path::new("/nonexistent/definitely/not/here"));
        assert!(sidecar.is_empty());
    }

    #[test]
    fn merge_book_comments_preserves_unchanged_keys() {
        let mut sidecar = SnbtSidecar::new();
        sidecar.insert(
            "book:data".to_string(),
            "{version: 13L /* the version */ grid_scale: 1.0d}".to_string(),
        );

        let mut new_compound = HashMap::new();
        new_compound.insert("version".to_string(), CommentedSnbt::new(SnbtValue::Int(13)));
        new_compound.insert("grid_scale".to_string(), CommentedSnbt::new(SnbtValue::Double(2.0))); // changed

        let merged = merge_book_comments(&sidecar, "book:data", &new_compound).unwrap();
        let s = compound_to_snbt(&merged);

        assert!(s.contains("/* the version */"), "unchanged key comment preserved");
        assert!(s.contains("grid_scale: 2.0d"), "changed key uses new value");
        assert!(!s.contains("1.0d"), "changed key no longer shows old value");
    }
