export interface MenuItem {
  name: string
  label: string
  sublabel?: string
  icon: string
  activeIcon: string
  path?: string // Override the default /<name> path
}

const allMenuItems: MenuItem[] = [
  {
    name: 'portfolio',
    label: 'Portfolio',
    icon: 'portfolio-outline',
    activeIcon: 'portfolio-filled',
  },
  {
    name: 'explore',
    label: 'Explore',
    icon: 'nodes',
    activeIcon: 'nodes',
  },
  {
    name: 'earn',
    label: 'Earn',
    icon: 'earn-outline',
    activeIcon: 'earn-filled',
  },
  {
    name: 'lend',
    label: 'Lend',
    icon: 'lend-outline',
    activeIcon: 'lend-filled',
    // Direct link to USDT vault (single lending vault) — V2 deployment
    path: '/lend/0xf4940CdE23c164f8CA8D536f3567337349b3208F',
  },
  {
    name: 'borrow',
    label: 'Borrow',
    sublabel: 'Multiply',
    icon: 'borrow-outline',
    activeIcon: 'borrow-filled',
  },
]

export const getMenuItems = (enableEarnPage: boolean, enableLendPage: boolean, enableExplorePage: boolean, enableMultiply = true) => {
  return allMenuItems
    .filter((item) => {
      if (item.name === 'explore' && !enableExplorePage) return false
      if (item.name === 'lend' && !enableLendPage) return false
      if (item.name === 'earn' && !enableEarnPage) return false
      return true
    })
    .map((item) => {
      // Hide the "Multiply" sublabel on the Borrow item when multiply is disabled
      if (item.name === 'borrow' && !enableMultiply) {
        const { sublabel: _sublabel, ...rest } = item
        return rest
      }
      return item
    })
}

const preferredDefaultOrder = ['explore', 'earn', 'lend', 'borrow', 'portfolio'] as const

export const getDefaultPageRoute = (enableEarnPage: boolean, enableLendPage: boolean, enableExplorePage: boolean) => {
  const items = getMenuItems(enableEarnPage, enableLendPage, enableExplorePage)
  return preferredDefaultOrder.find(name =>
    items.some(item => item.name === name),
  ) ?? 'portfolio'
}
