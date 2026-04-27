import { useState } from 'react'
import './App.css'

const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL

type JobPosting = {
  id: number
  company: string
  title: string
  url: string
  source: string
  location: string
  first_seen: string
  last_seen: string
}

function App() {
  const [jobs, setJobs] = useState<JobPosting[]>([])
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  async function fetchData() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${BACKEND_API_URL}/jobs/recent`)
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }

      const data = (await response.json()) as JobPosting[]
      setJobs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setJobs([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="center">
      <div>
        <button onClick={fetchData} disabled={loading}>
          {loading ? 'Loading...' : 'Fetch Data'}
        </button>
      </div>

      {error ? <p>{error}</p> : null}

      <div>
        {jobs.map((job) => (
          <article key={job.id}>
            <h3>{job.title}</h3>
            <p>Company: {job.company}</p>
            <p>Location: {job.location}</p>
            <p>ID: {job.id}</p>
            <p>First Seen: {job.first_seen}</p>
            <p>Last Seen: {job.last_seen}</p>
            <p>Source: {job.source}</p>
            <p>
              URL:{' '}
              <a href={job.url} target="_blank" rel="noreferrer">
                {job.url}
              </a>
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

export default App
