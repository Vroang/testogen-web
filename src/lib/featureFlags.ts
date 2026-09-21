const FLAG_STORAGE = 'use_new_document_parser'

export function isNewDocumentParserEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG_STORAGE) === '1'
  } catch {
    return false
  }
}

export function setNewDocumentParserEnabled(enabled: boolean) {
  try {
    localStorage.setItem(FLAG_STORAGE, enabled ? '1' : '0')
  } catch {
    // localStorage недоступен — флаг не сохранится
  }
}
