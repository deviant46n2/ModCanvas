use anyhow::{Result, bail};

/// SNBT Tokenizer
#[derive(Debug, Clone)]
pub(crate) enum Token {
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

pub(crate) struct SnbtTokenizer<'a> {
    chars: Vec<char>,
    pos: usize,
    _phantom: std::marker::PhantomData<&'a ()>,
}

impl<'a> SnbtTokenizer<'a> {
    pub(crate) fn new(input: &'a str) -> Self {
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

    pub(crate) fn tokenize(&mut self) -> Result<Vec<Token>> {
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
