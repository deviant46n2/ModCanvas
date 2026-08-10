use std::collections::HashMap;

/// SNBT Value - represents any value in SNBT format
#[derive(Debug, Clone)]
pub enum SnbtValue {
    Byte(i8),
    Short(i16),
    Int(i32),
    Long(i64),
    Float(f32),
    Double(f64),
    String(String),
    ByteArray(Vec<i8>),
    IntArray(Vec<i32>),
    LongArray(Vec<i64>),
    List(Vec<SnbtValue>),
    Compound(HashMap<String, CommentedSnbt>),
}

impl SnbtValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            SnbtValue::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_int_array(&self) -> Option<&Vec<i32>> {
        match self {
            SnbtValue::IntArray(arr) => Some(arr),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            SnbtValue::Byte(v) => Some(*v as i64),
            SnbtValue::Short(v) => Some(*v as i64),
            SnbtValue::Int(v) => Some(*v as i64),
            SnbtValue::Long(v) => Some(*v),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            SnbtValue::Float(v) => Some(*v as f64),
            SnbtValue::Double(v) => Some(*v),
            SnbtValue::Byte(v) => Some(*v as f64),
            SnbtValue::Short(v) => Some(*v as f64),
            SnbtValue::Int(v) => Some(*v as f64),
            SnbtValue::Long(v) => Some(*v as f64),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            SnbtValue::Byte(v) => Some(*v != 0),
            SnbtValue::Int(v) => Some(*v != 0),
            _ => None,
        }
    }

    pub fn as_compound(&self) -> Option<&HashMap<String, CommentedSnbt>> {
        match self {
            SnbtValue::Compound(m) => Some(m),
            _ => None,
        }
    }

    pub fn as_list(&self) -> Option<&Vec<SnbtValue>> {
        match self {
            SnbtValue::List(l) => Some(l),
            _ => None,
        }
    }

    pub fn get(&self, key: &str) -> Option<&SnbtValue> {
        match self {
            SnbtValue::Compound(m) => m.get(key).map(|c| &c.value),
            _ => None,
        }
    }

    pub fn get_str(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(|v| v.as_str())
    }

    pub fn get_i64(&self, key: &str) -> Option<i64> {
        self.get(key).and_then(|v| v.as_i64())
    }

    pub fn get_bool(&self, key: &str) -> Option<bool> {
        self.get(key).and_then(|v| v.as_bool())
    }

    pub fn get_compound(&self, key: &str) -> Option<&HashMap<String, CommentedSnbt>> {
        self.get(key).and_then(|v| v.as_compound())
    }

    pub fn get_list(&self, key: &str) -> Option<&Vec<SnbtValue>> {
        self.get(key).and_then(|v| v.as_list())
    }

    pub fn get_int_array(&self, key: &str) -> Option<&Vec<i32>> {
        self.get(key).and_then(|v| v.as_int_array())
    }

    /// Helper for FTB-style position arrays [x, y] or {x: ..., y: ...}
    pub fn get_position_xy(&self) -> Option<(f64, f64)> {
        if let Some(arr) = self.as_list() {
            if arr.len() >= 2 {
                let x = arr[0].as_f64()?;
                let y = arr[1].as_f64()?;
                return Some((x, y));
            }
        }
        if let Some(x) = self.get_f64("x") {
            let y = self.get_f64("y").unwrap_or(0.0);
            return Some((x, y));
        }
        None
    }

    pub fn get_f64(&self, key: &str) -> Option<f64> {
        self.get(key).and_then(|v| v.as_f64())
    }
}

/// A wrapper around `SnbtValue` that carries optional leading and trailing comments.
/// Used to preserve user comments during parse → serialize round-trips.
#[derive(Debug, Clone)]
pub struct CommentedSnbt {
    pub value: SnbtValue,
    pub leading_comments: Vec<String>,
    pub trailing_comment: Option<String>,
}

impl CommentedSnbt {
    pub fn new(value: SnbtValue) -> Self {
        Self {
            value,
            leading_comments: Vec::new(),
            trailing_comment: None,
        }
    }

    pub fn with_leading(mut self, comments: Vec<String>) -> Self {
        self.leading_comments = comments;
        self
    }

    pub fn with_trailing(mut self, comment: Option<String>) -> Self {
        self.trailing_comment = comment;
        self
    }

    // Delegate common accessors to the inner value
    pub fn as_str(&self) -> Option<&str> { self.value.as_str() }
    pub fn as_i64(&self) -> Option<i64> { self.value.as_i64() }
    pub fn as_f64(&self) -> Option<f64> { self.value.as_f64() }
    pub fn as_bool(&self) -> Option<bool> { self.value.as_bool() }
    pub fn as_compound(&self) -> Option<&HashMap<String, CommentedSnbt>> { self.value.as_compound() }
    pub fn as_list(&self) -> Option<&Vec<SnbtValue>> { self.value.as_list() }
    pub fn get(&self, key: &str) -> Option<&SnbtValue> { self.value.get(key) }
    pub fn get_str(&self, key: &str) -> Option<&str> { self.value.get_str(key) }
    pub fn get_i64(&self, key: &str) -> Option<i64> { self.value.get_i64(key) }
    pub fn get_f64(&self, key: &str) -> Option<f64> { self.value.get_f64(key) }
    pub fn get_bool(&self, key: &str) -> Option<bool> { self.value.get_bool(key) }
    pub fn get_compound(&self, key: &str) -> Option<&HashMap<String, CommentedSnbt>> { self.value.get_compound(key) }
    pub fn get_list(&self, key: &str) -> Option<&Vec<SnbtValue>> { self.value.get_list(key) }
    pub fn get_int_array(&self, key: &str) -> Option<&Vec<i32>> { self.value.get_int_array(key) }
    pub fn get_position_xy(&self) -> Option<(f64, f64)> { self.value.get_position_xy() }
    pub fn to_snbt_string(&self) -> String { self.value.to_snbt_string() }
}
