use std::collections::HashMap;

use anyhow::{Result, bail};

use super::number::parse_number;
use super::tokenizer::Token;
use super::value::{CommentedSnbt, SnbtValue};

/// SNBT Parser
pub(crate) struct SnbtParser {
    tokens: Vec<Token>,
    pos: usize,
}

impl SnbtParser {
    pub(crate) fn new(tokens: Vec<Token>) -> Self {
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
                parse_number(&s)
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

    pub(crate) fn parse(mut self) -> Result<CommentedSnbt> {
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
