import { useState } from 'react'
import OrderWizard from './components/OrderWizard'

const initialOrder = {
  table: '',
  items: [],
  total: 0,
  status: 'pendiente',
}

function App() {
  const [currentOrder, setCurrentOrder] = useState(initialOrder)

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <OrderWizard
        currentOrder={currentOrder}
        setCurrentOrder={setCurrentOrder}
        initialOrder={initialOrder}
      />
    </main>
  )
}

export default App
