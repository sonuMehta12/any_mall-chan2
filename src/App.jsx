import { useState } from 'react'
import Chat from './screens/Chat.jsx'
import PetSelect from './screens/PetSelect.jsx'

// The real Flutter app supplies its own authenticated user code — this is
// test-UI only.  Use the real code directly so AALDA API lookups succeed.
const DEFAULT_USER_CODE = '3AOU9K1PWH'

function getTabUserCode() {
  return DEFAULT_USER_CODE
}

export default function App() {
  const [screen, setScreen] = useState('petSelect') // 'petSelect' | 'chat'
  const [userCode, setUserCode] = useState(getTabUserCode)
  const [selectedPets, setSelectedPets] = useState([])
  const [language, setLanguage] = useState('EN') // 'EN' | 'JA'

  function handleStartChat(pets) {
    setSelectedPets(pets)
    setScreen('chat')
  }

  function handleBack() {
    setScreen('petSelect')
    setSelectedPets([])
  }

  return (
    <div className="phone-shell">
      {screen === 'petSelect' && (
        <PetSelect
          userCode={userCode}
          onUserCodeChange={setUserCode}
          onStartChat={handleStartChat}
          language={language}
          onLanguageChange={setLanguage}
        />
      )}
      {screen === 'chat' && (
        <Chat
          selectedPets={selectedPets}
          userCode={userCode}
          language={language}
          onBack={handleBack}
        />
      )}
    </div>
  )
}
