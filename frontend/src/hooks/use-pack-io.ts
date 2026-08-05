import { useState, useCallback } from 'react'
import {
  autoImportPack,
  pickImportFile,
  exportModrinthMrpack,
  exportCurseforgeZip,
  ingestActiveInstance as apiIngestActiveInstance,
} from '../services/api'
import type { Project, ImportResult } from '../services/types'
import type { IngestResult } from '../services/quest-types'
import { errorMessage } from './app-state-utils'

export function usePackIo(projectState: {
  openProject: Project | null
  loadProjects: () => Promise<Project[]>
}) {
  const [showImport, setShowImport] = useState(false)
  const [importPath, setImportPath] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')

  const [showExport, setShowExport] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportPath, setExportPath] = useState('')

  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null)
  const [ingesting, setIngesting] = useState(false)
  const [ingestError, setIngestError] = useState('')

  const runIngestion = useCallback(async (instancePath: string) => {
    if (!instancePath) return
    setIngesting(true)
    setIngestError('')
    try {
      console.log('[Frontend] Starting ingestion for:', instancePath)
      const result = await apiIngestActiveInstance(instancePath)
      console.log('[Frontend] Ingestion result:', result)
      setIngestResult(result)
    } catch (e: any) {
      const msg = errorMessage(e)
      console.error('[Frontend] Ingestion failed:', msg)
      setIngestError(msg)
    } finally {
      setIngesting(false)
    }
  }, [])

  async function pickImportPath() {
    try {
      const path = await pickImportFile()
      if (path) setImportPath(path)
    } catch (e) {
      console.error('Failed to pick import path:', e)
    }
  }

  async function importPack() {
    if (!importPath) return
    setIsImporting(true)
    setImportError('')
    setImportResult(null)

    try {
      const result = await autoImportPack(importPath)
      setImportResult(result)
      await projectState.loadProjects()
    } catch (e: any) {
      setImportError(errorMessage(e))
    } finally {
      setIsImporting(false)
    }
  }

  async function exportMrpack() {
    if (!projectState.openProject) return
    setIsExporting(true)
    setExportError('')
    try {
      const path = await exportModrinthMrpack(projectState.openProject.id)
      setExportPath(path)
      setExportError('')
    } catch (e: any) {
      setExportError(errorMessage(e))
    } finally {
      setIsExporting(false)
    }
  }

  async function exportCurseforge() {
    if (!projectState.openProject) return
    setIsExporting(true)
    setExportError('')
    try {
      const path = await exportCurseforgeZip(projectState.openProject.id)
      setExportPath(path)
      setExportError('')
    } catch (e: any) {
      setExportError(errorMessage(e))
    } finally {
      setIsExporting(false)
    }
  }

  function resetImportState() {
    setImportPath('')
    setImportResult(null)
    setImportError('')
  }

  function handleCloseImport() {
    setShowImport(false)
    resetImportState()
  }

  function handleImportDone() {
    setShowImport(false)
    setImportPath('')
    setImportResult(null)
  }

  function handleCloseExport() {
    setShowExport(false)
    setExportPath('')
    setExportError('')
  }

  return {
    showImport, setShowImport,
    importPath, setImportPath,
    importResult,
    isImporting,
    importError,
    showExport, setShowExport,
    isExporting,
    exportError,
    exportPath,
    runIngestion,
    ingestResult,
    ingesting,
    ingestError,
    setIngestResult,
    setIngestError,
    setImportError,
    setImportResult,
    pickImportPath,
    importPack,
    exportMrpack,
    exportCurseforge,
    resetImportState,
    handleCloseImport,
    handleImportDone,
    handleCloseExport,
  }
}
