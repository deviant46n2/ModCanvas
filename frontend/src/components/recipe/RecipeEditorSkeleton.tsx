/** Placeholder shown while the compact texture index loads. */
export function RecipeEditorSkeleton() {
  return (
    <div className="recipe-skeleton">
      <div className="skeleton-palette">
        <div className="skeleton-line w60" />
        <div className="skeleton-block" />
        <div className="skeleton-block" />
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </div>
      <div className="skeleton-canvas">
        <div className="skeleton-line w40" />
        <div className="skeleton-block tall" />
        <div className="skeleton-block tall" />
      </div>
      <div className="skeleton-detail">
        <div className="skeleton-block" />
      </div>
    </div>
  );
}

export default RecipeEditorSkeleton;
