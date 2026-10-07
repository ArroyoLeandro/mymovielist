import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler, type User } from './api'

interface AuthValue {
  user: User | null
  ready: boolean
  login: (tag: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthValue>(null as unknown as AuthValue)
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setReady(true))
  }, [])

  const login = async (tag: string, password: string) => {
    setUser((await api.login(tag, password)).user)
  }
  const logout = async () => {
    await api.logout().catch(() => {})
    setUser(null)
  }

  return <Ctx.Provider value={{ user, ready, login, logout }}>{children}</Ctx.Provider>
}
