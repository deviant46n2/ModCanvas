use anyhow::{Result, bail};

use super::value::SnbtValue;

/// Parse a numeric token string (e.g. "42", "3.14d", "7L") into the
/// matching `SnbtValue` variant, preserving the type suffix.
pub(crate) fn parse_number(s: &str) -> Result<SnbtValue> {
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
