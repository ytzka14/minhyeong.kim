import { toyProjects } from '../toyProjects'

function ToyProjects() {
  return (
    <section>
      <h2>Toys</h2>
      {toyProjects.length === 0 ? (
        <p className="empty-note">Small side projects will appear here soon.</p>
      ) : (
        <div className="project-list">
          {toyProjects.map((p) => {
            const href = p.component ? `#/toy-projects/${p.slug}` : p.demo
            return (
              <article key={p.slug} className="project">
                <div className="entry-header">
                  <span className="project-title">
                    {href ? <a href={href}>{p.title}</a> : p.title}
                  </span>
                  <span className="project-links">
                    {[
                      p.component && <a key="play" href={`#/toy-projects/${p.slug}`}>Play</a>,
                      p.demo && <a key="demo" href={p.demo} target="_blank" rel="noreferrer">Demo</a>,
                      p.repo && <a key="repo" href={p.repo} target="_blank" rel="noreferrer">GitHub</a>,
                    ]
                      .filter(Boolean)
                      .flatMap((link, i) => (i === 0 ? [link] : [' · ', link]))}
                  </span>
                </div>
                <div className="entry-body">{p.description}</div>
                {p.tags && p.tags.length > 0 && (
                  <div className="project-tags">{p.tags.join(' · ')}</div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default ToyProjects
