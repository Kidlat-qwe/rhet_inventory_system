import { Icon } from './Icon'

export function CategoryThumb({ category, size = 40, className = '' }) {
  const imageUrl = category?.imageUrl || category?.image_url || ''
  const label = category?.categoryName || category?.category_name || 'Category'

  if (imageUrl) {
    return (
      <img
        className={`category-thumb${className ? ` ${className}` : ''}`}
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className={`product-thumb category-thumb-fallback${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon name="box" size={Math.round(size * 0.5)} />
    </div>
  )
}
