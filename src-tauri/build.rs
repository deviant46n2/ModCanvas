// The build script used to load `.env` at compile time so
// `option_env!("CURSEFORGE_API_KEY")` would bake the CurseForge key into
// the binary. That path was REMOVED (2026-08-10): a credential compiled
// into every distributed binary is a published credential. The key now
// lives in the OS keychain (key_store.rs) with a mode-0600 database
// fallback. Nothing here needs to run at build time.
fn main() {}
