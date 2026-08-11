// Pure loot-table JSON parsing — no filesystem, no IPC (3-layer rule: the
// thinking room never touches the world). `parse_loot_table` takes the JSON
// value and returns a typed summary; callers own where the bytes come from.

use serde_json::Value;

/// A typed summary of one loot table, extracted from its JSON.
pub struct LootTableSummary {
    pub table_type: String,
    pub pools: usize,
    pub entries: usize,
}

/// Parse a loot-table JSON value into its summary. Returns `None` when the
/// JSON is not a loot table (missing `pools`, or pools is not an array).
pub fn parse_loot_table(json: &Value) -> Option<LootTableSummary> {
    let table_type = json
        .get("type")
        .and_then(|t| t.as_str())
        .unwrap_or("minecraft:unknown")
        .to_string();

    let pools = match json.get("pools") {
        Some(Value::Array(pools)) => pools,
        _ => return None,
    };

    let mut entries = 0usize;
    for pool in pools {
        if let Some(Value::Array(pool_entries)) = pool.get("entries") {
            entries += pool_entries.len();
        }
    }

    Some(LootTableSummary {
        table_type,
        pools: pools.len(),
        entries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_real_loot_crate_table() {
        // The actual FTB Quests loot table, captured from the shipped jar
        // (data/ftbquests/loot_table/blocks/loot_crate_opener.json, 1.21.1).
        let json: Value = serde_json::from_str(r#"{
            "type": "minecraft:block",
            "pools": [{
                "rolls": 1.0,
                "bonus_rolls": 0.0,
                "entries": [{
                    "type": "minecraft:item",
                    "name": "ftbquests:loot_crate_opener",
                    "functions": [{
                        "function": "minecraft:copy_components",
                        "include": ["ftbquests:loot_crate_items"],
                        "source": "block_entity"
                    }]
                }],
                "conditions": [{
                    "condition": "minecraft:survives_explosion"
                }]
            }]
        }"#).unwrap();
        let s = parse_loot_table(&json).expect("valid table parses");
        assert_eq!(s.table_type, "minecraft:block");
        assert_eq!(s.pools, 1);
        assert_eq!(s.entries, 1);
    }

    #[test]
    fn counts_entries_across_pools() {
        let json: Value = serde_json::from_str(r#"{
            "type": "minecraft:chest",
            "pools": [
                { "entries": [{ "type": "minecraft:item", "name": "a:b" }, { "type": "minecraft:item", "name": "c:d" }] },
                { "entries": [{ "type": "minecraft:item", "name": "e:f" }] }
            ]
        }"#).unwrap();
        let s = parse_loot_table(&json).expect("parses");
        assert_eq!(s.pools, 2);
        assert_eq!(s.entries, 3);
    }

    #[test]
    fn rejects_non_loot_json() {
        assert!(parse_loot_table(&serde_json::json!({ "hello": "world" })).is_none());
        assert!(parse_loot_table(&serde_json::json!({ "pools": "not-an-array" })).is_none());
        assert!(parse_loot_table(&serde_json::json!([])).is_none());
    }
}
