import { Suspense, useEffect, useState } from 'react'
import './App.css'
import CV from './pages/CV'
import ToyProjects from './pages/ToyProjects'
import { findToyProject, type ToyProject } from './toyProjects'

const TABS = [
  { id: 'cv', label: 'CV', hash: '#/' },
  { id: 'toy-projects', label: 'Toy Projects', hash: '#/toy-projects' },
] as const

type TabId = (typeof TABS)[number]['id']

type Route =
  | { tab: 'cv' }
  | { tab: 'toy-projects'; project?: ToyProject }

function parseRoute(hash: string): Route {
  const m = hash.match(/^#\/toy-projects(?:\/([^/?#]+))?/)
  if (!m) return { tab: 'cv' }
  const project = m[1] ? findToyProject(decodeURIComponent(m[1])) : undefined
  return { tab: 'toy-projects', project: project?.component ? project : undefined }
}

function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseRoute(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const tab: TabId = route.tab
  const project = route.tab === 'toy-projects' ? route.project : undefined
  const Project = project?.component

  return (
    <>
      <div className="nav-bar">
        <nav className="site-nav">
          <a href="#/" className="site-name">Min Hyeong Kim</a>
          <ul className="tabs">
            {TABS.map((t) => (
              <li key={t.id}>
                <a
                  href={t.hash}
                  className={tab === t.id ? 'tab active' : 'tab'}
                  aria-current={tab === t.id && !project ? 'page' : undefined}
                >
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {Project ? (
        <main className="toy-page">
          <Suspense fallback={<p className="toy-loading">Loading {project.title}…</p>}>
            <Project />
          </Suspense>
        </main>
      ) : (
        <div className="container">
          <main>{tab === 'cv' ? <CV /> : <ToyProjects />}</main>

          <footer>
            <p>Last updated: October 2026</p>
          </footer>
        </div>
      )}
    </>
  )
}

export default App
