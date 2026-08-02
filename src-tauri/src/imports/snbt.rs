use std::collections::HashMap;
use anyhow::{Result, bail};

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

    /// Serialize this value to FTB-compatible SNBT string
    pub fn to_snbt_string(&self) -> String {
        self.to_snbt_pretty(0)
    }

    fn needs_quoting(s: &str) -> bool {
        if s.is_empty() { return true; }
        let mut chars = s.chars();
        let first = chars.next().unwrap();
        if !first.is_alphanumeric() && first != '_' && first != '-' && first != '.' && first != '+' {
            return true;
        }
        for ch in chars {
            if !ch.is_alphanumeric() && ch != '_' && ch != '-' && ch != '.' && ch != '+' && ch != '/' {
                return true;
            }
        }
        // Keys containing a colon (namespaced, e.g. "ftbfiltersystem:filter") must be
        // quoted: the tokenizer splits unquoted keys at ':' so they would not round-trip.
        if s.contains(':') { return true; }
        // Check for reserved words
        matches!(s, "true" | "false" | "NaN" | "Infinity" | "-Infinity")
    }

    fn quote_string(s: &str) -> String {
        // Use double quotes, escape internal quotes and backslashes
        let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
        format!("\"{}\"", escaped)
    }

    fn to_snbt_pretty(&self, indent: usize) -> String {
        match self {
            SnbtValue::Byte(v) => format!("{}b", v),
            SnbtValue::Short(v) => format!("{}s", v),
            SnbtValue::Int(v) => v.to_string(),
            SnbtValue::Long(v) => format!("{}L", v),
            SnbtValue::Float(v) => format!("{}f", v),
            SnbtValue::Double(v) => {
                if v.fract() == 0.0 && v.is_finite() {
                    format!("{}.0d", v)
                } else {
                    format!("{}d", v)
                }
            }
            SnbtValue::String(s) => Self::quote_string(s),
            SnbtValue::ByteArray(arr) => {
                let items: Vec<String> = arr.iter().map(|b| format!("{}b", b)).collect();
                format!("[B; {}]", items.join(", "))
            }
            SnbtValue::IntArray(arr) => {
                let items: Vec<String> = arr.iter().map(|i| i.to_string()).collect();
                format!("[I; {}]", items.join(", "))
            }
            SnbtValue::LongArray(arr) => {
                let items: Vec<String> = arr.iter().map(|l| format!("{}L", l)).collect();
                format!("[L; {}]", items.join(", "))
            }
            SnbtValue::List(items) => {
                if items.is_empty() {
                    return "[]".to_string();
                }
                // If all items are simple (scalars or short strings), use inline
                let all_simple = items.iter().all(|v| matches!(v,
                    SnbtValue::Byte(_) | SnbtValue::Short(_) | SnbtValue::Int(_) |
                    SnbtValue::Long(_) | SnbtValue::Float(_) | SnbtValue::Double(_) |
                    SnbtValue::String(_)
                ));
                if all_simple && items.len() <= 8 {
                    let inner: Vec<String> = items.iter().map(|v| v.to_snbt_pretty(indent)).collect();
                    return format!("[ {} ]", inner.join(", "));
                }
                // Multiline list
                let pad = " ".repeat(indent + 2);
                let inner: Vec<String> = items.iter()
                    .map(|v| format!("{}{}", pad, v.to_snbt_pretty(indent + 2)))
                    .collect();
                format!("[\n{}\n{}]", inner.join("\n"), " ".repeat(indent))
            }
            SnbtValue::Compound(map) => {
                if map.is_empty() {
                    return "{}".to_string();
                }
                let pad = " ".repeat(indent + 2);
                let mut entries: Vec<(&String, &CommentedSnbt)> = map.iter().collect();
                entries.sort_by(|a, b| a.0.cmp(b.0));
                let inner: Vec<String> = entries.iter()
                    .map(|(k, commented)| {
                        let key = if Self::needs_quoting(k) { Self::quote_string(k) } else { (*k).clone() };
                        let mut lines = Vec::new();
                        // Emit leading comments
                        for c in &commented.leading_comments {
                            lines.push(format!("{}{}", pad, c));
                        }
                        let val_str = commented.value.to_snbt_pretty(indent + 2);
                        lines.push(format!("{}{}: {}", pad, key, val_str));
                        // Emit trailing comment
                        if let Some(ref tc) = commented.trailing_comment {
                            lines.push(format!("  {}", tc));
                        }
                        lines.join("\n")
                    })
                    .collect();
                format!("{{\n{}\n{}}}", inner.join("\n"), " ".repeat(indent))
            }
        }
    }
}

/// Serialize a HashMap to SNBT string (for chapter/quest files)
pub fn compound_to_snbt(map: &HashMap<String, CommentedSnbt>) -> String {
    let val = SnbtValue::Compound(map.clone());
    val.to_snbt_string()
}

/// SNBT Tokenizer
#[derive(Debug, Clone)]
enum Token {
    OpenBrace,
    CloseBrace,
    OpenBracket,
    CloseBracket,
    Equals,
    Colon,
    Comma,
    Semicolon,
    String(String),
    Number(String),
    Boolean(bool),
    Identifier(String),
    Comment(String),
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
    pub fn get_position_xy(&self) -> Option<(f64, f64)> { self.value.get_position_xy() }
    pub fn to_snbt_string(&self) -> String { self.value.to_snbt_string() }
}

struct SnbtTokenizer<'a> {
    chars: Vec<char>,
    pos: usize,
    _phantom: std::marker::PhantomData<&'a ()>,
}

impl<'a> SnbtTokenizer<'a> {
    fn new(input: &'a str) -> Self {
        SnbtTokenizer {
            chars: input.chars().collect(),
            pos: 0,
            _phantom: std::marker::PhantomData,
        }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn advance(&mut self) -> Option<char> {
        let ch = self.chars.get(self.pos).copied();
        self.pos += 1;
        ch
    }

    fn skip_whitespace(&mut self) -> Vec<String> {
        let mut comments = Vec::new();
        while let Some(ch) = self.peek() {
            if ch.is_whitespace() || ch == '\n' || ch == '\r' {
                self.advance();
            } else if ch == '/' {
                let start = self.pos;
                self.advance();
                if let Some('/') = self.peek() {
                    // Line comment — consume to end of line
                    while let Some(ch) = self.advance() {
                        if ch == '\n' {
                            break;
                        }
                    }
                    let comment: String = self.chars[start..self.pos]
                        .iter()
                        .collect::<String>()
                        .trim_end()
                        .to_string();
                    comments.push(comment);
                } else if let Some('*') = self.peek() {
                    // Block comment
                    self.advance();
                    loop {
                        match self.advance() {
                            Some('*') => {
                                if let Some('/') = self.peek() {
                                    self.advance();
                                    break;
                                }
                            }
                            None => break,
                            _ => {}
                        }
                    }
                    let comment: String = self.chars[start..self.pos]
                        .iter()
                        .collect::<String>();
                    comments.push(comment);
                } else {
                    // Not a comment, just a '/' — put it back by not advancing further
                    self.pos = start;
                    break;
                }
            } else {
                break;
            }
        }
        comments
    }

    fn read_string(&mut self, quote: char) -> Result<String> {
        let mut s = String::new();
        loop {
            match self.advance() {
                None => bail!("Unterminated string"),
                Some(ch) if ch == quote => break,
                Some('\\') => {
                    match self.advance() {
                        Some('n') => s.push('\n'),
                        Some('t') => s.push('\t'),
                        Some('r') => s.push('\r'),
                        Some('\\') => s.push('\\'),
                        Some(c) if c == quote => s.push(c),
                        Some(c) => {
                            s.push('\\');
                            s.push(c);
                        }
                        None => bail!("Unterminated escape in string"),
                    }
                }
                Some(ch) => s.push(ch),
            }
        }
        Ok(s)
    }

    fn read_unquoted_string(&mut self) -> String {
        let mut s = String::new();
        while let Some(ch) = self.peek() {
            if ch.is_alphanumeric() || ch == '_' || ch == '-' || ch == '.' || ch == '+' {
                s.push(ch);
                self.advance();
            } else {
                break;
            }
        }
        s
    }

    fn read_number_or_id(&mut self, first: char) -> Token {
        let mut s = String::new();
        s.push(first);

        while let Some(ch) = self.peek() {
            if ch.is_ascii_digit() || ch == '.' || ch == '-' || ch == '+' || ch == 'e' || ch == 'E' {
                s.push(ch);
                self.advance();
            } else if ch == 'b' || ch == 'B' || ch == 's' || ch == 'S' || ch == 'l' || ch == 'L' || ch == 'f' || ch == 'F' || ch == 'd' || ch == 'D' {
                s.push(ch);
                self.advance();
                break;
            } else {
                break;
            }
        }

        // Check if it's a valid number (with optional type suffix like 0b, 0s, 0L, 0f, 0d)
        let stripped = s.trim_end_matches(|c: char| c == 'b' || c == 'B' || c == 's' || c == 'S' || c == 'l' || c == 'L' || c == 'f' || c == 'F' || c == 'd' || c == 'D');
        if stripped.parse::<f64>().is_ok() {
            Token::Number(s)
        } else {
            Token::Identifier(s)
        }
    }

    fn tokenize(&mut self) -> Result<Vec<Token>> {
        let mut tokens = Vec::new();

        loop {
            let comments = self.skip_whitespace();
            // Emit collected comments as tokens
            for comment in comments {
                tokens.push(Token::Comment(comment));
            }

            match self.peek() {
                None => break,
                Some(ch) => {
                    self.advance();
                    match ch {
                        '{' => tokens.push(Token::OpenBrace),
                        '}' => tokens.push(Token::CloseBrace),
                        '[' => tokens.push(Token::OpenBracket),
                        ']' => tokens.push(Token::CloseBracket),
                        '=' => tokens.push(Token::Equals),
                        ':' => tokens.push(Token::Colon),
                        ',' => tokens.push(Token::Comma),
                        ';' => tokens.push(Token::Semicolon),
                        '"' | '\'' => {
                            let s = self.read_string(ch)?;
                            tokens.push(Token::String(s));
                        }
                        't' => {
                            let rest = self.read_unquoted_string();
                            if rest == "rue" || rest == "true" {
                                tokens.push(Token::Boolean(true));
                            } else {
                                tokens.push(Token::Identifier(format!("t{}", rest)));
                            }
                        }
                        'f' => {
                            let rest = self.read_unquoted_string();
                            if rest == "alse" || rest == "false" {
                                tokens.push(Token::Boolean(false));
                            } else {
                                tokens.push(Token::Identifier(format!("f{}", rest)));
                            }
                        }
                        '-' if self.peek().map_or(false, |c| c.is_ascii_digit()) => {
                            tokens.push(self.read_number_or_id(ch));
                        }
                        _ if ch.is_ascii_digit() => {
                            tokens.push(self.read_number_or_id(ch));
                        }
                        _ if ch.is_alphabetic() || ch == '_' => {
                            // Could be identifier or unquoted string
                            let mut s = String::new();
                            s.push(ch);
                            while let Some(ch) = self.peek() {
                                if ch.is_alphanumeric() || ch == '_' || ch == '-' || ch == '.' {
                                    s.push(ch);
                                    self.advance();
                                } else {
                                    break;
                                }
                            }
                            // Check for type suffixes on numbers that look like "123b" etc.
                            if s.chars().all(|c| c.is_ascii_digit() || c == '-' || c == '+') {
                                tokens.push(Token::Number(s));
                            } else {
                                tokens.push(Token::Identifier(s));
                            }
                        }
                        _ => {
                            // Skip unknown characters
                        }
                    }
                }
            }
        }

        Ok(tokens)
    }
}

/// SNBT Parser
struct SnbtParser {
    tokens: Vec<Token>,
    pos: usize,
}

impl SnbtParser {
    fn new(tokens: Vec<Token>) -> Self {
        SnbtParser { tokens, pos: 0 }
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    fn advance(&mut self) -> Option<Token> {
        let tok = self.tokens.get(self.pos).cloned();
        self.pos += 1;
        tok
    }

    fn _expect(&mut self, expected: &Token) -> Result<()> {
        match self.advance() {
            Some(ref tok) if std::mem::discriminant(tok) == std::mem::discriminant(expected) => Ok(()),
            Some(tok) => bail!("Expected {:?}, got {:?}", expected, tok),
            None => bail!("Unexpected end of input, expected {:?}", expected),
        }
    }

    fn parse_value(&mut self) -> Result<SnbtValue> {
        match self.peek().cloned() {
            Some(Token::OpenBrace) => self.parse_compound(),
            Some(Token::OpenBracket) => self.parse_list_or_array(),
            Some(Token::String(s)) => {
                self.advance();
                Ok(SnbtValue::String(s))
            }
            Some(Token::Boolean(b)) => {
                self.advance();
                Ok(SnbtValue::Byte(if b { 1 } else { 0 }))
            }
            Some(Token::Number(s)) => {
                self.advance();
                self.parse_number(&s)
            }
            Some(Token::Identifier(s)) => {
                self.advance();
                // Check for type suffixes
                if s.ends_with('b') || s.ends_with('B') {
                    let num_str = &s[..s.len()-1];
                    if let Ok(v) = num_str.parse::<i8>() {
                        return Ok(SnbtValue::Byte(v));
                    }
                }
                if s.ends_with('s') || s.ends_with('S') {
                    let num_str = &s[..s.len()-1];
                    if let Ok(v) = num_str.parse::<i16>() {
                        return Ok(SnbtValue::Short(v));
                    }
                }
                if s.ends_with('l') || s.ends_with('L') {
                    let num_str = &s[..s.len()-1];
                    if let Ok(v) = num_str.parse::<i64>() {
                        return Ok(SnbtValue::Long(v));
                    }
                }
                if s.ends_with('f') || s.ends_with('F') {
                    let num_str = &s[..s.len()-1];
                    if let Ok(v) = num_str.parse::<f32>() {
                        return Ok(SnbtValue::Float(v));
                    }
                }
                if s.ends_with('d') || s.ends_with('D') {
                    let num_str = &s[..s.len()-1];
                    if let Ok(v) = num_str.parse::<f64>() {
                        return Ok(SnbtValue::Double(v));
                    }
                }
                // Treat as string
                Ok(SnbtValue::String(s))
            }
            None => bail!("Unexpected end of input"),
            Some(tok) => bail!("Unexpected token: {:?}", tok),
        }
    }

    fn parse_number(&mut self, s: &str) -> Result<SnbtValue> {
        // Strip type suffix (b/s/L/f/d) if present
        let suffix = s.chars().last().filter(|c| matches!(c, 'b' | 'B' | 's' | 'S' | 'l' | 'L' | 'f' | 'F' | 'd' | 'D'));
        let (bare, type_char) = if let Some(sc) = suffix {
            (&s[..s.len()-1], Some(sc))
        } else {
            (s, None)
        };

        // Try to parse as various numeric types
        if bare.contains('.') || bare.contains('e') || bare.contains('E') {
            if let Ok(v) = bare.parse::<f64>() {
                return match type_char {
                    Some('f' | 'F') => Ok(SnbtValue::Float(v as f32)),
                    _ => Ok(SnbtValue::Double(v)),
                };
            }
        }
        if let Ok(v) = bare.parse::<i64>() {
            return match type_char {
                Some('b' | 'B') => Ok(SnbtValue::Byte(v as i8)),
                Some('s' | 'S') => Ok(SnbtValue::Short(v as i16)),
                Some('l' | 'L') => Ok(SnbtValue::Long(v)),
                Some('f' | 'F') => Ok(SnbtValue::Float(v as f32)),
                Some('d' | 'D') => Ok(SnbtValue::Double(v as f64)),
                _ => {
                    if v >= i32::MIN as i64 && v <= i32::MAX as i64 {
                        return Ok(SnbtValue::Int(v as i32));
                    }
                    Ok(SnbtValue::Long(v))
                }
            };
        }
        bail!("Invalid number: {}", s)
    }

    fn parse_compound(&mut self) -> Result<SnbtValue> {
        self.advance(); // Consume '{'
        let mut map = HashMap::new();

        loop {
            self.skip_whitespace_tokens();

            match self.peek() {
                Some(Token::CloseBrace) => {
                    self.advance();
                    break;
                }
                None => bail!("Unexpected end of compound"),
                _ => {}
            }

            // Collect any leading comments for this entry
            let leading_comments = self.collect_leading_comments();

            // Parse key
            let key = match self.advance() {
                Some(Token::String(s)) => s,
                Some(Token::Identifier(s)) => s,
                Some(Token::Number(s)) => s,
                Some(Token::Comment(_)) => {
                    // More comments after collecting — keep collecting
                    continue;
                }
                Some(tok) => bail!("Expected key, got {:?}", tok),
                None => bail!("Unexpected end of input"),
            };

            self.skip_whitespace_tokens();

            // Expect '=' or ':', or an immediate '{' (FTB Quests style: "key" { })
            match self.peek() {
                Some(Token::Equals) | Some(Token::Colon) => {
                    self.advance();
                }
                Some(Token::OpenBrace) => {
                    // FTB Quests format: key followed directly by compound
                }
                Some(tok) => bail!("Expected '=' or ':', got {:?}", tok),
                None => bail!("Unexpected end of input"),
            }

            self.skip_whitespace_tokens();

            // Parse value
            let value = self.parse_value()?;

            // Collect trailing comment (on same line / after value)
            let trailing = self.collect_trailing_comment();

            let commented = CommentedSnbt::new(value)
                .with_leading(leading_comments)
                .with_trailing(trailing);
            map.insert(key, commented);

            self.skip_whitespace_tokens();

            // Check for comma or end
            match self.peek() {
                Some(Token::Comma) => {
                    self.advance();
                }
                Some(Token::CloseBrace) => {}
                _ => {}
            }
        }

        Ok(SnbtValue::Compound(map))
    }

    fn parse_list_or_array(&mut self) -> Result<SnbtValue> {
        self.advance(); // Consume '['
        let mut items = Vec::new();

        // Check for type prefix like [B;, [I;, [L;
        let mut array_type = None;
        if let Some(Token::Identifier(s)) = self.peek() {
            if s == "B" || s == "I" || s == "L" {
                let typ = s.clone();
                self.advance();
                if let Some(Token::Semicolon) = self.peek() {
                    self.advance();
                    array_type = Some(typ);
                } else {
                    // Not an array prefix, put it back conceptually
                    // Parse as first item
                    // Actually we already consumed it, so treat as item
                    match typ.as_str() {
                        "B" => items.push(SnbtValue::Byte(0)),
                        "I" => items.push(SnbtValue::Int(0)),
                        "L" => items.push(SnbtValue::Long(0)),
                        _ => {}
                    }
                }
            }
        }

        loop {
            self.skip_whitespace_tokens();

            match self.peek() {
                Some(Token::CloseBracket) => {
                    self.advance();
                    break;
                }
                None => bail!("Unexpected end of list"),
                _ => {}
            }

            let value = self.parse_value()?;
            items.push(value);

            self.skip_whitespace_tokens();

            match self.peek() {
                Some(Token::Comma) => {
                    self.advance();
                }
                Some(Token::CloseBracket) => {}
                _ => {}
            }
        }

        match array_type.as_deref() {
            Some("B") => {
                let bytes: Vec<i8> = items.iter()
                    .filter_map(|v| match v {
                        SnbtValue::Byte(b) => Some(*b),
                        SnbtValue::Int(i) => Some(*i as i8),
                        _ => None,
                    })
                    .collect();
                Ok(SnbtValue::ByteArray(bytes))
            }
            Some("I") => {
                let ints: Vec<i32> = items.iter()
                    .filter_map(|v| v.as_i64().map(|i| i as i32))
                    .collect();
                Ok(SnbtValue::IntArray(ints))
            }
            Some("L") => {
                let longs: Vec<i64> = items.iter()
                    .filter_map(|v| v.as_i64())
                    .collect();
                Ok(SnbtValue::LongArray(longs))
            }
            _ => Ok(SnbtValue::List(items)),
        }
    }

    fn skip_whitespace_tokens(&mut self) {
        // Already handled by tokenizer
    }

    /// Consume any leading Comment tokens and return them.
    fn collect_leading_comments(&mut self) -> Vec<String> {
        let mut comments = Vec::new();
        while let Some(Token::Comment(c)) = self.peek() {
            comments.push(c.clone());
            self.advance();
        }
        comments
    }

    fn parse(mut self) -> Result<CommentedSnbt> {
        let leading = self.collect_leading_comments();
        let value = self.parse_value()?;
        // Collect any trailing comment (comment after the value on same/next line)
        let trailing = self.collect_trailing_comment();
        Ok(CommentedSnbt::new(value)
            .with_leading(leading)
            .with_trailing(trailing))
    }

    fn collect_trailing_comment(&mut self) -> Option<String> {
        // Skip whitespace-only tokens (not comments) and check for a comment
        // Only take the first comment as trailing
        if let Some(Token::Comment(c)) = self.peek() {
            let comment = c.clone();
            self.advance();
            Some(comment)
        } else {
            None
        }
    }
}

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