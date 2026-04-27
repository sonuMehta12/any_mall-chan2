import './HomeScreen.css'

export default function HomeScreen({ onSelectTest, onSelectProd, language, onLanguageChange }) {
  return (
    <div className="home">
      {/* ── Branding ── */}
      <div className="home-hero">
        <div className="home-logo">🐾</div>
        <h1 className="home-title">AnyMall-chan</h1>
        <p className="home-subtitle">Your pet nutrition companion</p>
      </div>

      {/* ── Mode cards ── */}
      <div className="home-label">Choose a mode</div>
      <div className="home-cards">
        <button className="home-card home-card-test" onClick={onSelectTest}>
          <div className="home-card-icon">🧪</div>
          <div className="home-card-name">Test</div>
          <div className="home-card-desc">Custom profiles,<br />no AALDA needed</div>
        </button>
        <button className="home-card home-card-prod" onClick={onSelectProd}>
          <div className="home-card-icon">🐕</div>
          <div className="home-card-name">Prod</div>
          <div className="home-card-desc">My registered<br />AALDA pets</div>
        </button>
      </div>

      {/* ── Language ── */}
      <div className="home-lang-row">
        <span className="home-lang-label">Language</span>
        <div className="home-lang-btns">
          <button
            className={`home-lang-btn ${language === 'EN' ? 'home-lang-btn-active' : ''}`}
            onClick={() => onLanguageChange('EN')}
          >EN</button>
          <button
            className={`home-lang-btn ${language === 'JA' ? 'home-lang-btn-active' : ''}`}
            onClick={() => onLanguageChange('JA')}
          >日本語</button>
        </div>
      </div>

      <p className="home-footer">Dev testing UI — not the Flutter production app</p>
    </div>
  )
}
