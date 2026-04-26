import './App.css'
const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL;

function App() {

  async function fetchData() {
    const response = await fetch(`${BACKEND_API_URL}/jobs/recent`)
    console.log(response)
    const data = await response.json()
    console.log(data)
  }

  return (
    <>
      <section id="center">
        <div className="hero">
          
        </div>
        <div>
          <button onClick={fetchData}>Fetch Data</button>
        </div>
      </section>
    </>
  )
}

export default App
