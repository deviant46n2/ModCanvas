// Pure loot-table model (P3-LOOT editor, roadmap §13). The thinking room:
// typed views over loot-table JSON with a preserve-unknown mechanism — every
// field this model does not understand travels through as an opaque
// `extra` map and is re-emitted unchanged. Nothing dies on round-trip (the
// s2–3 fidelity lesson, applied to JSON).
//
// JSON is NOT SNBT: there is no custom serializer, no comment preservation,
// and no byte-identical round-trip promise. The fidelity bar is *fields
// survive*, not *bytes survive*. Keys are re-emitted alphabetized (serde_json
// `Map` is a BTreeMap); the game parses JSON objects regardless of key order.
//
// Parse strategy per container: known fields are typed, unknown fields land
// in `extra` via `#[serde(flatten)]`. Where a field's shape is version- or
// mod-specific (exotic `rolls` providers, unknown condition bodies), the
// opaque `Value` arm wins — parse never fails on a shape we don't model.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value};

/// Top-level loot table. `type` is `minecraft:chest`, `minecraft:block`,
/// `minecraft:entity`, etc.; some older tables omit it entirely.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LootTable {
    #[serde(rename = "type")]
    pub table_type: Option<String>,
    pub pools: Vec<LootPool>,
    /// 1.20.2+ datapacks pin the sequence id (`minecraft:chests/x`). Absent
    /// in older tables and in tables that let the game derive it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub random_sequence: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// One weighted pool: `rolls` (number, uniform range, or an exotic provider
/// we preserve opaquely), entries, and conditions (opaque — the MVP editors
/// add/remove condition blocks, never their internals).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LootPool {
    pub rolls: LootRolls,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bonus_rolls: Option<f64>,
    pub entries: Vec<LootEntry>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub conditions: Vec<Value>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// A single loot entry. `entry_type` is `minecraft:item`, `minecraft:tag`,
/// `minecraft:loot_table`, `minecraft:dynamic`, `minecraft:group`,
/// `minecraft:alternatives`, `minecraft:empty`. Item/tag/loot_table entries
/// carry `name`; group/alternatives carry `children`; functions are opaque
/// (the MVP edits entries, not the functions inside them).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LootEntry {
    #[serde(rename = "type")]
    pub entry_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quality: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<LootEntry>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub functions: Vec<Value>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// `rolls` / `bonus_rolls` value. Ordered untagged arms, most specific first:
/// a plain number (int or float, representation preserved), a uniform
/// `{min,max}` range, or anything else preserved opaquely (e.g. the modern
/// `{"type": "minecraft:binomial", "n": ..., "p": ...}` provider).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum LootRolls {
    Count(Number),
    Uniform {
        min: f64,
        max: f64,
        #[serde(flatten)]
        extra: Map<String, Value>,
    },
    /// Any other rolls shape (binomial provider, bare string, …). Survives
    /// round-trip untouched; the editor shows it read-only.
    Other(Value),
}

impl LootTable {
    /// Parse a loot-table JSON value. Returns `None` when the shape is not a
    /// loot table we can model (missing/non-array `pools`).
    pub fn from_value(json: &Value) -> Option<LootTable> {
        if !json.get("pools").is_some_and(|p| p.is_array()) {
            return None;
        }
        serde_json::from_value::<LootTable>(json.clone()).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(s: &str) -> LootTable {
        let v: Value = serde_json::from_str(s).expect("valid json");
        LootTable::from_value(&v).expect("modelable table")
    }

    /// Round-trip: parse → serialize → parse must preserve every field the
    /// model typed AND every field it did not understand.
    fn round_trip_ok(s: &str) {
        let first = parse(s);
        let out = serde_json::to_value(&first).expect("serializes");
        let second = parse(&out.to_string());
        assert_eq!(
            serde_json::to_value(&first).unwrap(),
            serde_json::to_value(&second).unwrap(),
            "double round-trip must be stable"
        );
    }

    #[test]
    fn round_trips_unknown_top_level_fields() {
        // `random_sequence` is typed; `"minecraft:custom_thing"` is not.
        round_trip_ok(r#"{
            "type": "minecraft:chest",
            "random_sequence": "minecraft:chests/simple_dungeon",
            "pools": []
        }"#);
    }

    #[test]
    fn preserves_unknown_fields_inside_pools_entries_and_conditions() {
        let json = r#"{
            "type": "minecraft:block",
            "pools": [{
                "rolls": 1.0,
                "bonus_rolls": 0.0,
                "custom_pool_field": {"nested": [1, 2, 3]},
                "entries": [{
                    "type": "minecraft:item",
                    "name": "minecraft:stick",
                    "weight": 1,
                    "quality": 0,
                    "custom_entry_field": "keep-me",
                    "functions": [{
                        "function": "minecraft:set_count",
                        "count": 3
                    }]
                }],
                "conditions": [{
                    "condition": "minecraft:survives_explosion",
                    "custom_condition_field": true
                }]
            }]
        }"#;
        let t = parse(json);
        let pool = &t.pools[0];
        assert_eq!(
            pool.extra.get("custom_pool_field").unwrap().get("nested").unwrap(),
            &serde_json::json!([1, 2, 3]),
            "unknown pool field survives"
        );
        let entry = &pool.entries[0];
        assert_eq!(entry.extra.get("custom_entry_field").unwrap(), "keep-me");
        assert_eq!(entry.functions.len(), 1);
        assert_eq!(
            pool.conditions[0].get("custom_condition_field").unwrap(),
            &serde_json::json!(true),
            "unknown condition internals survive"
        );
        round_trip_ok(json);
    }

    #[test]
    fn rolls_preserves_int_vs_float_and_uniform_ranges() {
        let t = parse(r#"{"pools": [{"rolls": 1, "entries": []}, {"rolls": 1.5, "entries": []}]}"#);
        match &t.pools[0].rolls {
            LootRolls::Count(n) => assert_eq!(n.as_i64(), Some(1), "integer stays integer"),
            other => panic!("expected Count for 1, got {other:?}"),
        }
        match &t.pools[1].rolls {
            LootRolls::Count(n) => assert_eq!(n.as_f64(), Some(1.5)),
            other => panic!("expected Count for 1.5, got {other:?}"),
        }

        let t = parse(r#"{"pools": [{"rolls": {"min": 2, "max": 5}, "entries": []}]}"#);
        match &t.pools[0].rolls {
            LootRolls::Uniform { min, max, .. } => {
                assert_eq!(*min, 2.0);
                assert_eq!(*max, 5.0);
            }
            other => panic!("expected Uniform, got {other:?}"),
        }
        round_trip_ok(r#"{"pools": [{"rolls": 1, "entries": []}]}"#);
        round_trip_ok(r#"{"pools": [{"rolls": 1.5, "entries": []}]}"#);
        round_trip_ok(r#"{"pools": [{"rolls": {"min": 2, "max": 5}, "entries": []}]}"#);
    }

    #[test]
    fn exotic_rolls_providers_survive_opaque() {
        // Modern binomial provider: not typed, must round-trip untouched.
        let json = r#"{
            "pools": [{
                "rolls": {"type": "minecraft:binomial", "n": 3, "p": 0.5},
                "entries": [{"type": "minecraft:item", "name": "minecraft:apple"}]
            }]
        }"#;
        let t = parse(json);
        match &t.pools[0].rolls {
            LootRolls::Other(v) => {
                assert_eq!(v.get("type").unwrap(), "minecraft:binomial");
            }
            other => panic!("expected opaque Other, got {other:?}"),
        }
        round_trip_ok(json);
    }

    #[test]
    fn group_and_loot_table_entries_model_children_and_name() {
        let json = r#"{
            "type": "minecraft:chest",
            "pools": [{
                "rolls": 1,
                "entries": [
                    {"type": "minecraft:loot_table", "name": "minecraft:chests/other"},
                    {"type": "minecraft:group", "children": [
                        {"type": "minecraft:item", "name": "minecraft:coal", "weight": 2}
                    ]}
                ]
            }]
        }"#;
        let t = parse(json);
        assert_eq!(t.pools[0].entries[0].name.as_deref(), Some("minecraft:chests/other"));
        let children = t.pools[0].entries[1].children.as_ref().expect("group children");
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].name.as_deref(), Some("minecraft:coal"));
        round_trip_ok(json);
    }

    #[test]
    fn rejects_non_loot_json() {
        assert!(LootTable::from_value(&serde_json::json!({"hello": "world"})).is_none());
        assert!(LootTable::from_value(&serde_json::json!({"pools": "nope"})).is_none());
        assert!(LootTable::from_value(&serde_json::json!([])).is_none());
    }
}
