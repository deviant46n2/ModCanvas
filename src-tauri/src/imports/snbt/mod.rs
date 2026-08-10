//! SNBT (stringified NBT) parser/serializer with comment preservation.
//! Split into submodules: `value` (data model + accessors), `serialize`
//! (FTB-compatible output), `tokenizer` (lexer), `number` (numeric parsing),
//! `parser` (structure). The public API below is unchanged by the split.

pub mod serialize;
pub mod value;
mod number;
mod parser;
mod tokenizer;

pub use serialize::compound_to_snbt;
pub use value::{CommentedSnbt, SnbtValue};

use std::collections::HashMap;

use anyhow::{Result, bail};

use parser::SnbtParser;
use tokenizer::SnbtTokenizer;

/// Parse SNBT content and return a commented compound value
pub fn parse_snbt(content: &str) -> Result<CommentedSnbt> {
    let mut tokenizer = SnbtTokenizer::new(content);
    let tokens = tokenizer.tokenize()?;
    let parser = SnbtParser::new(tokens);
    parser.parse()
}

/// Helper to parse SNBT and extract a compound at the root
pub fn parse_snbt_compound(content: &str) -> Result<HashMap<String, CommentedSnbt>> {
    match parse_snbt(content)?.value {
        SnbtValue::Compound(m) => Ok(m),
        _ => bail!("Root is not a compound"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_compound() {
        let snbt = r#"{ name = "Test", value = 42 }"#;
        let result = parse_snbt(snbt).unwrap();
        assert_eq!(result.get_str("name"), Some("Test"));
        assert_eq!(result.get_i64("value"), Some(42));
    }

    #[test]
    fn test_parse_nested_compound() {
        let snbt = r#"{ outer = { inner = "hello" } }"#;
        let result = parse_snbt(snbt).unwrap();
        assert_eq!(result.get_str("outer.inner"), None);
        let outer = result.get_compound("outer").unwrap();
        assert_eq!(outer.get("inner").and_then(|v| v.as_str()), Some("hello"));
    }

    #[test]
    fn test_parse_list() {
        let snbt = r#"{ items = [1, 2, 3] }"#;
        let result = parse_snbt(snbt).unwrap();
        let list = result.get_list("items").unwrap();
        assert_eq!(list.len(), 3);
    }

    #[test]
    fn test_parse_ftb_quest_snbt() {
        let snbt = r#"{
            "quest:1" {
                title = "Get Started"
                description = "Begin your journey"
                x = 100.0
                y = 200.0
                tasks {
                    "task:1" {
                        type = "minecraft:item"
                        title = "Get a pickaxe"
                        item {
                            id = "minecraft:stone_pickaxe"
                            count = 1
                        }
                    }
                }
                dependencies = ["quest:0"]
            }
        }"#;
        let result = parse_snbt(snbt).unwrap();
        let quest = result.get("quest:1").unwrap();
        assert_eq!(quest.get_str("title"), Some("Get Started"));
        assert_eq!(quest.get_str("description"), Some("Begin your journey"));
        assert_eq!(quest.get_f64("x"), Some(100.0));
    }
}
