import { categoryColors } from '../appUtils';

interface CategoryChipsProps {
  categories?: string[];
  onRemove?: (category: string) => void;
}

export function CategoryChips({ categories, onRemove }: CategoryChipsProps) {
  const visibleCategories = categories?.filter(Boolean) ?? [];
  if (visibleCategories.length === 0) return null;

  return (
    <span className="category-chips" aria-label="Song categories">
      {visibleCategories.map((category) => {
        const colors = categoryColors(category);
        return (
          <span
            key={category}
            className="category-chip"
            style={{
              color: colors.color,
            }}
          >
            {category}
            {onRemove && (
              <button
                className="category-chip-remove"
                onClick={() => onRemove(category)}
                type="button"
                aria-label={`Remove ${category}`}
                title={`Remove ${category}`}
              >
                x
              </button>
            )}
          </span>
        );
      })}
    </span>
  );
}
