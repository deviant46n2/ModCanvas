fn main() {
    // Load .env at compile time so option_env!("CURSEFORGE_API_KEY") works
    let _ = dotenvy::dotenv();
}
