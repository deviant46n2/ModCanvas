// Ingredient -> KubeJS literal serializer (`event.*` input syntax). Pure
// function used by both script orchestrators.

pub(crate) fn ingredient_to_kubejs(ing: &crate::models::RecipeIngredient) -> String {
    let mut parts = Vec::new();
    
    if ing.tag.unwrap_or(false) {
        parts.push(format!("#{}", ing.item));
    } else {
        parts.push(format!("'{}'", ing.item));
    }
    
    if let Some(count) = ing.count {
        if count > 1 {
            parts.push(format!("count: {}", count));
        }
    }
    
    if let Some(nbt) = &ing.nbt {
        if !nbt.is_empty() {
            let nbt_str = serde_json::to_string(nbt).unwrap_or_default();
            parts.push(format!("nbt: {}", nbt_str));
        }
    }
    
    if parts.len() == 1 {
        parts[0].clone()
    } else {
        format!("{{ {} }}", parts.join(", "))
    }
}
