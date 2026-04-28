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
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  async function fetchData(query: string) {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        limit: '100',
      })
      const normalizedQuery = query.trim()
      if (normalizedQuery.length > 0) {
        params.set('query', normalizedQuery)
      }

      const response = await fetch(`${BACKEND_API_URL}/jobs/recent?${params.toString()}`)
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

  async function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await fetchData(searchTerm)
  }

  return (
    <section className="app-shell">
      <header className="hero">
      </header>

      <form className="toolbar" onSubmit={handleSearchSubmit}>
        <label className="search-field" htmlFor="job-search">
          <span>Search title</span>
          <input
            id="job-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="e.g. engineer, manager, analyst"
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Loading...' : 'Search (max 100)'}
        </button>
      </form>

      {error ? <p>{error}</p> : null}

      <div className="results-bar">
        <p>
          Showing {jobs.length} jobs (max 100)
        </p>
      </div>

      <div className="job-list">
        {jobs.map((job) => (
          <article key={job.id} className="job-card">
            <div className="job-card__header">
              <h3>{job.title}</h3>
              <span>{job.company}</span>
            </div>
            <p>{job.location}</p>
            <p>Source: {job.source}</p>
            <p>
              <a href={job.url} target="_blank" rel="noreferrer">
                View posting
              </a>
            </p>
          </article>
        ))}

        {!loading && jobs.length === 0 ? (
          <p className="empty-state">No jobs found for that search.</p>
        ) : null}
      </div>
    </section>
  )
}

export default App
