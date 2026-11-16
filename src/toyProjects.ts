import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export interface ToyProject {
  /** URL-safe id; an integrated project is served at `#/toy-projects/<slug>` */
  slug: string
  title: string
  description: string
  /** Link to the standalone GitHub repository */
  repo?: string
  /** Link to an external live demo, if any */
  demo?: string
  tags?: string[]
  /** The project itself, when it is integrated into this site. Loaded on demand. */
  component?: LazyExoticComponent<ComponentType>
}

// Add toy projects here as they are integrated into the homepage.
// Each integrated project lives in src/toys/<slug>/ with its CSS scoped under its own root class.
export const toyProjects: ToyProject[] = [
  {
    slug: 'torus-chess',
    title: 'Torus Chess',
    description:
      'Chess on a 14 × 8 board that wraps around in both directions. Play against a computer opponent at four difficulty levels, or with a friend on one screen.',
    repo: 'https://github.com/ytzka14/torus-chess',
    tags: ['React', 'TypeScript', 'Game AI'],
    component: lazy(() => import('./toys/torus-chess/TorusChess')),
  },
]

export const findToyProject = (slug: string) => toyProjects.find((p) => p.slug === slug)
