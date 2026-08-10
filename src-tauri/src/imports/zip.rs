//! Zip helpers shared across the importers: mrpack extraction / re-zip and the
//! standard file options for writing deflated entries.

use std::path::Path;

pub fn extract_mrpack(mrpack_path: &Path, dest: &Path) -> anyhow::Result<()> {
    let file = std::fs::File::open(mrpack_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    archive.extract(dest)?;
    Ok(())
}

pub fn default_zip_options() -> zip::write::FileOptions<'static, ()> {
    let opts = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    #[cfg(unix)]
    let opts = opts.unix_permissions(0o755);
    opts
}

pub fn create_mrpack_zip(source: &Path, dest: &Path) -> anyhow::Result<()> {
    let file = std::fs::File::create(dest)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = default_zip_options();
    
    for entry in walkdir::WalkDir::new(source) {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            let relative = path.strip_prefix(source)?;
            let name = relative.to_string_lossy().to_string();
            zip.start_file(name, options)?;
            let mut f = std::fs::File::open(path)?;
            std::io::copy(&mut f, &mut zip)?;
        }
    }
    zip.finish()?;
    Ok(())
}
