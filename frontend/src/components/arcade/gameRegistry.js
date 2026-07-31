import { lazy } from 'react'

const gameRegistry = {
  flappy: {
    slug: 'flappy',
    title: 'Flappy Bird',
    description: 'Tap to fly through pipes!',
    thumbnail: '/assets/arcade/flappy-thumb.webp',
    maxScore: 999,
    component: lazy(() => import('./games/FlappyGame')),
  },
  pacman: {
    slug: 'pacman',
    title: 'Maze Munch',
    description: 'Eat all dots and avoid the ghosts!',
    thumbnail: '/assets/arcade/pacman-thumb.webp',
    maxScore: 5000,
    component: lazy(() => import('./games/PacmanGame')),
  },
  stack: {
    slug: 'stack',
    title: 'Stack Tower',
    description: 'Tap to stack blocks and build tall!',
    thumbnail: '/assets/arcade/stack-thumb.webp',
    maxScore: 200,
    component: lazy(() => import('./games/StackGame')),
  },
  geodash: {
    slug: 'geodash',
    title: 'Geometry Dash',
    description: 'Jump and fly through obstacles!',
    thumbnail: '/assets/arcade/geodash-thumb.webp',
    maxScore: 9999,
    component: lazy(() => import('./games/GeodashGame')),
  },
  // Future games added here
  // Future games added here
}

export default gameRegistry
