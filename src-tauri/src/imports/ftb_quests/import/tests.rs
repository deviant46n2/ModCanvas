#[cfg(test)]
mod chapter_title_tests {
    use super::super::{parse_chapter_titles, parse_group_titles};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_parse_chapter_titles_recursive_scanning() {
        let dir = tempdir().unwrap();
        let quests_dir = dir.path().join("quests");
        let lang_dir = quests_dir.join("lang").join("en_us").join("chapters");
        fs::create_dir_all(&lang_dir).unwrap();
        
        let chapter1_content = r#"{
    chapter.007B547630FF0478.title: "Theurgy"
    chapter.05E614FDA677D85E.title: "Food and Farming"
}"#;
        fs::write(lang_dir.join("chapter1.snbt"), chapter1_content).unwrap();
        
        let chapter2_content = r#"{
    chapter.07210DDF872160BA.title: "Applied Energistics 2"
    chapter.0A093D8C4429B627.title: "Mekanism: Reactors"
}"#;
        fs::write(lang_dir.join("chapter2.snbt"), chapter2_content).unwrap();
        
        let nested_dir = lang_dir.join("mods");
        fs::create_dir_all(&nested_dir).unwrap();
        let nested_content = r#"{
    chapter.1BE666F01EFFC00D.title: "Tips and Tricks"
    chapter.1D42B373285DEF81.title: "Silent Gear"
}"#;
        fs::write(nested_dir.join("utils.snbt"), nested_content).unwrap();
        
        let titles = parse_chapter_titles(&quests_dir);
        
        assert_eq!(titles.len(), 6);
        assert_eq!(titles.get("007B547630FF0478"), Some(&"Theurgy".to_string()));
        assert_eq!(titles.get("05E614FDA677D85E"), Some(&"Food and Farming".to_string()));
        assert_eq!(titles.get("07210DDF872160BA"), Some(&"Applied Energistics 2".to_string()));
        assert_eq!(titles.get("0A093D8C4429B627"), Some(&"Mekanism: Reactors".to_string()));
        assert_eq!(titles.get("1BE666F01EFFC00D"), Some(&"Tips and Tricks".to_string()));
        assert_eq!(titles.get("1D42B373285DEF81"), Some(&"Silent Gear".to_string()));
    }

    #[test]
    fn test_parse_chapter_titles_handles_missing_dir() {
        let dir = tempdir().unwrap();
        let quests_dir = dir.path().join("quests");
        fs::create_dir_all(&quests_dir).unwrap();
        // No lang dir
        
        let titles = parse_chapter_titles(&quests_dir);
        assert!(titles.is_empty());
    }

    #[test]
    fn test_parse_chapter_titles_prefers_en_us() {
        let dir = tempdir().unwrap();
        let quests_dir = dir.path().join("quests");
        let lang_dir = quests_dir.join("lang");
        
        let en_us_dir = lang_dir.join("en_us").join("chapters");
        fs::create_dir_all(&en_us_dir).unwrap();
        let en_content = r#"{
    chapter.TEST_UUID.title: "English Title"
}"#;
        fs::write(en_us_dir.join("test.snbt"), en_content).unwrap();
        
        let fr_fr_dir = lang_dir.join("fr_fr").join("chapters");
        fs::create_dir_all(&fr_fr_dir).unwrap();
        let fr_content = r#"{
    chapter.TEST_UUID.title: "Titre Francais"
}"#;
        fs::write(fr_fr_dir.join("test.snbt"), fr_content).unwrap();
        
        let titles = parse_chapter_titles(&quests_dir);
        assert_eq!(titles.get("TEST_UUID"), Some(&"English Title".to_string()));
    }

    #[test]
    fn test_parse_group_titles_resolves_chapter_group_prefix() {
        let dir = tempdir().unwrap();
        let quests_dir = dir.path().join("quests");
        let lang_dir = quests_dir.join("lang").join("en_us");
        fs::create_dir_all(&lang_dir).unwrap();

        let content = r#"{
    chapter_group.029264819125415F.title: "&f&lSkyblock Quests"
    chapter_group.428CE9AF17D90D68.title: "&f&lThe Basics"
    chapter.6D5CCD51C7A73F40.title: "&fWelcome"
}"#;
        fs::write(lang_dir.join("en_us.snbt"), content).unwrap();

        let groups = parse_group_titles(&quests_dir);
        assert_eq!(groups.len(), 2);
        assert_eq!(groups.get("029264819125415F"), Some(&"&f&lSkyblock Quests".to_string()));
        assert_eq!(groups.get("428CE9AF17D90D68"), Some(&"&f&lThe Basics".to_string()));
        // Chapter keys must not leak into group titles
        assert!(groups.get("6D5CCD51C7A73F40").is_none());
    }
}
