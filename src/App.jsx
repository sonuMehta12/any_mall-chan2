import { useState } from 'react'
import Chat from './screens/Chat.jsx'
import HomeScreen from './screens/HomeScreen.jsx'
import PetSelect from './screens/PetSelect.jsx'
import TestProfileManager from './screens/TestProfileManager.jsx'

// The real Flutter app supplies its own authenticated user code — this is
// test-UI only.  Use the real code directly so AALDA API lookups succeed.
const DEFAULT_USER_CODE = '3AOU9K1PWH'

function getTabUserCode() {
  return DEFAULT_USER_CODE
}

export default function App() {
  const [screen, setScreen] = useState('home') // 'home' | 'petSelect' | 'testProfileManager' | 'chat'
  const [userCode, setUserCode] = useState(getTabUserCode)
  const [selectedPets, setSelectedPets] = useState([])
  const [language, setLanguage] = useState('EN') // 'EN' | 'JA'

  // Test mode — when active, chat uses inline pet profiles instead of AALDA
  const [testMode, setTestMode] = useState(false)
  const [activeTestPets, setActiveTestPets] = useState(null)
  const [ownerName, setOwnerName] = useState('')

  function handleStartChat(pets) {
    setSelectedPets(pets)
    setScreen('chat')
  }

  // Back from prod chat → pet select
  function handleBack() {
    setScreen('petSelect')
    setSelectedPets([])
  }

  // Back from pet select → home
  function handleBackToHome() {
    setScreen('home')
  }

  function handleTestProfileSelected({ pets, ownerName: name }) {
    // Build fake selectedPets for Chat.jsx header display (pet_id = 0-indexed)
    const fakePets = pets.map((tp, i) => ({
      pet_id: i,
      name: tp.name,
      species: tp.species,
      breed: tp.breed,
      date_of_birth: tp.date_of_birth,
      life_stage: '',
    }))
    setActiveTestPets(pets)
    setOwnerName(name || '')
    setTestMode(true)
    setSelectedPets(fakePets)
    setScreen('chat')
  }

  function handleExitTestMode() {
    setTestMode(false)
    setActiveTestPets(null)
    setOwnerName('')
    setScreen('home')
    setSelectedPets([])
  }

  return (
    <div className="phone-shell">
      {screen === 'home' && (
        <HomeScreen
          onSelectTest={() => setScreen('testProfileManager')}
          onSelectProd={() => setScreen('petSelect')}
          language={language}
          onLanguageChange={setLanguage}
        />
      )}
      {screen === 'petSelect' && (
        <PetSelect
          userCode={userCode}
          onUserCodeChange={setUserCode}
          onStartChat={handleStartChat}
          language={language}
          onLanguageChange={setLanguage}
          onBack={handleBackToHome}
        />
      )}
      {screen === 'testProfileManager' && (
        <TestProfileManager
          onBack={() => setScreen('home')}
          onStartChat={handleTestProfileSelected}
          language={language}
          onLanguageChange={setLanguage}
        />
      )}
      {screen === 'chat' && (
        <Chat
          selectedPets={selectedPets}
          userCode={userCode}
          language={language}
          onBack={testMode ? handleExitTestMode : handleBack}
          testMode={testMode}
          activeTestPets={activeTestPets}
          ownerName={ownerName}
        />
      )}
    </div>
  )
}
