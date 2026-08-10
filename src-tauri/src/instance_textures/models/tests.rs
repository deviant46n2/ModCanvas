use crate::instance_textures::{resolve_texture_urls, scan_instance_textures};
use std::fs;
use std::io::Write;
use std::path::Path;
use tempfile::tempdir;

pub(super) mod layers;
pub(super) mod resolve;

pub(super) fn write_jar_entries(path: &Path, entries: &[(&str, &[u8])]) {
    use zip::write::FileOptions;
    use zip::CompressionMethod;
    let file = fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options: FileOptions<'_, ()> = FileOptions::default().compression_method(CompressionMethod::Stored);
    for (name, data) in entries {
        zip.start_file(*name, options).unwrap();
        zip.write_all(data).unwrap();
    }
    zip.finish().unwrap();
}

pub(super) fn fake_png(seed: u8) -> Vec<u8> {
    vec![0x89, b'P', b'N', b'G', seed, seed, seed, seed]
}

pub(super) fn decoded(url: &str) -> Vec<u8> {
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;
    STANDARD.decode(url.strip_prefix("data:image/png;base64,").unwrap()).unwrap()
}

pub(super) fn new_instance() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("resourcepacks")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();
    let instance = dir.path().to_path_buf();
    (dir, instance)
}
