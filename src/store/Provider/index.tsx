import ThemeProvider from './ThemeProvider'

export const Provider = ({ children }: { children: React.ReactNode }) => {
  return <ThemeProvider>{children}</ThemeProvider>
}

export default Provider
