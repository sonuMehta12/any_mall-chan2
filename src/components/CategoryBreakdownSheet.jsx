import './CategoryBreakdownSheet.css'

const COLOR_MAP = {
  green:  '#22C55E',
  yellow: '#EAB308',
  red:    '#EF4444',
}

function CategoryRow({ category, score, color }) {
  const barColor = COLOR_MAP[color] || COLOR_MAP.red
  return (
    <div className="breakdown-row">
      <span className="breakdown-label" title={category}>{category}</span>
      <div className="breakdown-bar-track">
        <div
          className="breakdown-bar-fill"
          style={{ width: `${score}%`, background: barColor }}
        />
      </div>
      <span className="breakdown-score" style={{ color: barColor }}>{score}%</span>
    </div>
  )
}

export default function CategoryBreakdownSheet({ categoryScores, overallScore, overallColor, onClose }) {
  const overallBarColor = COLOR_MAP[overallColor] || COLOR_MAP.red

  return (
    <>
      <div className="breakdown-backdrop" onClick={onClose} />
      <div className="breakdown-sheet">
        <div className="breakdown-header">
          <span className="breakdown-title">Profile Understanding</span>
          <button className="breakdown-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="breakdown-overall">
          <span className="breakdown-overall-label">Overall</span>
          <div className="breakdown-bar-track">
            <div
              className="breakdown-bar-fill"
              style={{ width: `${overallScore}%`, background: overallBarColor }}
            />
          </div>
          <span className="breakdown-score" style={{ color: overallBarColor }}>{overallScore}%</span>
        </div>

        <div className="breakdown-divider" />

        {categoryScores.map(({ category, score, color }) => (
          <CategoryRow key={category} category={category} score={score} color={color} />
        ))}
      </div>
    </>
  )
}
