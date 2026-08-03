// Directory picker: prefers the native Tauri dialog, falls back to a hidden
// webkitdirectory file input when the dialog plugin is unavailable.
export async function pickDir(label?: string): Promise<string | null> {
  try {
    const [{ open }, { homeDir }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/api/path'),
    ])
    const defaultPath = `${await homeDir()}/.local/share/PrismLauncher/instances`
    const selected = await open({
      directory: true,
      multiple: false,
      title: label || 'Select directory',
      defaultPath,
    })
    return (selected as string | null) || null
  } catch {
    return new Promise<string | null>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.setAttribute('webkitdirectory', '')
      input.style.display = 'none'
      let resolved = false
      const done = (result: string | null) => {
        if (resolved) return
        resolved = true
        document.body.removeChild(input)
        resolve(result)
      }
      input.addEventListener('change', () => {
        const file = input.files?.[0]
        if (file && 'path' in file) {
          done((file as any).path.replace(/\/[^/]+$/, ''))
        } else if (file && 'webkitRelativePath' in file) {
          const parts = (file as any).webkitRelativePath.split('/')
          done(parts.slice(0, -1).join('/'))
        } else {
          done(null)
        }
      })
      document.body.appendChild(input)
      input.click()
      setTimeout(() => done(null), 30000)
    })
  }
}
