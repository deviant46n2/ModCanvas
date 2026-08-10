//! Chapter decoration (`images`) import/export round-trip tests.

use super::*;
use crate::quest::*;
use tempfile;

fn images_roundtrip(mut graph: QuestGraph, expected: usize, sidecar: &snbt_sidecar::SnbtSidecar) -> QuestGraph {
    let chapters_with_images: Vec<_> = graph.chapters.iter().filter(|c| !c.images.is_empty()).collect();
    assert_eq!(chapters_with_images.len(), expected, "expected {expected} chapter(s) with images after import");

    if let Some(ch) = chapters_with_images.first() {
        let img = &ch.images[0];
        assert!(!img.image.is_empty(), "image path must be non-empty");
        assert!(img.x != 0.0 || img.y != 0.0, "image position should round-trip");
    }

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), sidecar).unwrap();
    import_ftb_quests(export_dir.path()).unwrap().graph
}

#[test]
fn test_flat_chapter_images_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(chapters_dir.join("decorated.snbt"), r#"{
    id = "ch_dec"
    filename = "decorated"
    title = "Decorated"
    images: [
        {
            height: 2.0d
            image: "atm:textures/questpics/basicarmor/armor_title.png"
            rotation: 0.0d
            width: 13.30952380952381d
            x: 4.5d
            y: -1.5d
        }
        {
            height: 1.5d
            image: "atm:textures/questpics/basicarmor/armor_trims.png"
            rotation: 10.0d
            width: 9.982142857142858d
            x: -5.5d
            y: 5.5d
            order: 1
        }
    ]
    quests = []
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let mut graph = import_result.graph;
    let images = graph.chapters.iter().find(|c| c.id == "ch_dec").map(|c| c.images.clone()).expect("chapter has images");
    assert_eq!(images.len(), 2);
    assert_eq!(images[0].image, "atm:textures/questpics/basicarmor/armor_title.png");
    assert!((images[0].x - 4.5).abs() < 1e-9);
    assert!((images[0].width - 13.30952380952381).abs() < 1e-9);
    assert_eq!(images[1].order, 1);
    assert!((images[1].rotation - 10.0).abs() < 1e-9);

    // Mutate: move the first decoration and rotate the second
    let ch = graph.chapters.iter_mut().find(|c| c.id == "ch_dec").unwrap();
    ch.images[0].x = 8.0;
    ch.images[0].y = 3.0;
    ch.images[1].rotation = 45.0;

    let graph2 = images_roundtrip(graph, 1, &import_result.sidecar);
    let imgs2 = graph2.chapters.iter().find(|c| c.id == "ch_dec").map(|c| &c.images).expect("images survive export");
    assert_eq!(imgs2.len(), 2, "decoration count preserved");
    assert!((imgs2[0].x - 8.0).abs() < 1e-9, "moved x persisted, got {}", imgs2[0].x);
    assert!((imgs2[0].y - 3.0).abs() < 1e-9, "moved y persisted");
    assert!((imgs2[1].rotation - 45.0).abs() < 1e-9, "rotation persisted");
}

#[test]
fn test_delete_all_decorations_persists() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(chapters_dir.join("decorated.snbt"), r#"{
    id = "ch_dec"
    filename = "decorated"
    title = "Decorated"
    images: [
        { image: "atm:textures/questpics/star.png", x: 1.0d, y: 2.0d, width: 3.0d, height: 3.0d }
    ]
    quests = []
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let mut graph = import_result.graph;
    graph.chapters.iter_mut().find(|c| c.id == "ch_dec").unwrap().images.clear();

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();
    let result2 = import_ftb_quests(export_dir.path()).unwrap();
    let imgs2 = result2.graph.chapters.iter().find(|c| c.id == "ch_dec").map(|c| c.images.len()).unwrap();
    assert_eq!(imgs2, 0, "deleting all decorations must persist through export");
}

#[test]
fn test_subdirs_chapter_images_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapter_dir = quests_dir.join("decorated");
    std::fs::create_dir_all(&chapter_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(chapter_dir.join("chapter.snbt"), r#"{
    id = "ch_dec"
    filename = "decorated"
    title = "Decorated"
    images: [
        { image: "atm:textures/questpics/chap2/creative_star", x: -2.0d, y: 1.0d, width: 4.0d, height: 4.0d }
    ]
    quests = []
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = images_roundtrip(import_result.graph, 1, &import_result.sidecar);
    let imgs = graph.chapters.iter().find(|c| c.id == "ch_dec").map(|c| &c.images).expect("images survive subdirs export");
    assert_eq!(imgs.len(), 1);
    assert!((imgs[0].x - -2.0).abs() < 1e-9);
}

#[test]
fn real_pack_images_export_roundtrip() {
    let real = std::path::PathBuf::from(
        std::env::var("HOME").unwrap_or_default()
    ).join(".local/share/PrismLauncher/instances/All the Mods 10- To the Sky   ATM10SKY(1)/minecraft");
    if !real.exists() {
        eprintln!("Skipping: instance not found");
        return;
    }
    let import_result = import_ftb_quests(&real).unwrap();
    let mut graph = import_result.graph;
    let chapters_with_images: Vec<_> = graph.chapters.iter().filter(|c| !c.images.is_empty()).collect();
    println!("chapters with images: {}/{}", chapters_with_images.len(), graph.chapters.len());
    assert!(!chapters_with_images.is_empty(), "expected decorations in the real pack");

    let total_before: usize = graph.chapters.iter().map(|c| c.images.len()).sum();
    println!("total decorations before: {total_before}");

    let ch = chapters_with_images[0].id.clone();
    let img = &chapters_with_images[0].images[0];
    println!("sample: {} @ ({}, {}) {}x{} rot {}", img.image, img.x, img.y, img.width, img.height, img.rotation);

    // Mutate the first decoration of the first decorated chapter
    let c = graph.chapters.iter_mut().find(|c| c.id == ch).unwrap();
    c.images[0].x += 1.0;
    c.images[0].rotation = 33.3;

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    let total_after: usize = graph2.chapters.iter().map(|c| c.images.len()).sum();
    println!("total decorations after: {total_after}");
    assert_eq!(total_before, total_after, "decoration count must survive export");

    let c2 = graph2.chapters.iter().find(|c| c.id == ch).unwrap();
    let a = graph.chapters.iter().find(|c| c.id == ch).unwrap();
    assert_eq!(a.images.len(), c2.images.len());
    assert!((c2.images[0].x - a.images[0].x).abs() < 1e-9, "x mutation persisted");
    assert!((c2.images[0].rotation - 33.3).abs() < 1e-9, "rotation mutation persisted");
    println!("real-pack images export round-trip OK");
}
