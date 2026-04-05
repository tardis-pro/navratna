import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { join, relative } from 'node:path'
import * as ts from 'typescript'
import type { AstExtractionResult, ImportInfo, SymbolInfo } from '@uaip/types'
import { logger } from '@uaip/utils'

const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', '.nx', '.git'])

function isSupportedSourceFile(filePath: string): boolean {
  const lowerCasePath = filePath.toLowerCase()
  for (const extension of SOURCE_FILE_EXTENSIONS) {
    if (lowerCasePath.endsWith(extension)) {
      return true
    }
  }

  return false
}

function walkSourceFiles(rootPath: string): string[] {
  const files: string[] = []

  const walk = (currentPath: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(currentPath, { withFileTypes: true })
    } catch (error) {
      logger.warn('Failed to read directory during AST extraction', {
        currentPath,
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }

    for (const entry of entries) {
      const nextPath = join(currentPath, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue
        }
        walk(nextPath)
        continue
      }

      if (entry.isFile() && isSupportedSourceFile(nextPath)) {
        files.push(nextPath)
      }
    }
  }

  walk(rootPath)
  return files
}

function getScriptKind(filePath: string): ts.ScriptKind {
  const lowerCasePath = filePath.toLowerCase()
  if (lowerCasePath.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (lowerCasePath.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (lowerCasePath.endsWith('.js')) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function getNodeLine(node: ts.Node, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false
  }

  const modifiers = ts.getModifiers(node)
  if (!modifiers) {
    return false
  }

  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
}

export class AstSymbolExtractor {
  async extractFromDirectory(rootPath: string): Promise<AstExtractionResult> {
    const sourceFiles = walkSourceFiles(rootPath)
    const symbols: SymbolInfo[] = []
    const imports: ImportInfo[] = []
    let exportCount = 0

    for (const filePath of sourceFiles) {
      let sourceText: string
      try {
        sourceText = readFileSync(filePath, 'utf-8')
      } catch (error) {
        logger.warn('Failed to read source file for AST extraction', {
          filePath,
          error: error instanceof Error ? error.message : String(error),
        })
        continue
      }

      let sourceFile: ts.SourceFile
      try {
        sourceFile = ts.createSourceFile(
          filePath,
          sourceText,
          ts.ScriptTarget.Latest,
          true,
          getScriptKind(filePath)
        )
      } catch (error) {
        logger.warn('Failed to parse source file for AST extraction', {
          filePath,
          error: error instanceof Error ? error.message : String(error),
        })
        continue
      }

      const fileRelativePath = relative(rootPath, filePath)
      const fileExportSymbols = new Set<string>()

      const visit = (node: ts.Node): void => {
        if (ts.isFunctionDeclaration(node) && node.name) {
          const startLine = getNodeLine(node, sourceFile)
          symbols.push({
            name: node.name.text,
            file: fileRelativePath,
            startLine,
            line: startLine,
            kind: 'function',
          })

          if (hasExportModifier(node)) {
            fileExportSymbols.add(node.name.text)
          }
        }

        if (ts.isClassDeclaration(node) && node.name) {
          const startLine = getNodeLine(node, sourceFile)
          symbols.push({
            name: node.name.text,
            file: fileRelativePath,
            startLine,
            line: startLine,
            kind: 'class',
          })

          if (hasExportModifier(node)) {
            fileExportSymbols.add(node.name.text)
          }
        }

        if (ts.isInterfaceDeclaration(node)) {
          const startLine = getNodeLine(node, sourceFile)
          symbols.push({
            name: node.name.text,
            file: fileRelativePath,
            startLine,
            line: startLine,
            kind: 'interface',
          })

          if (hasExportModifier(node)) {
            fileExportSymbols.add(node.name.text)
          }
        }

        if (ts.isTypeAliasDeclaration(node)) {
          const startLine = getNodeLine(node, sourceFile)
          symbols.push({
            name: node.name.text,
            file: fileRelativePath,
            startLine,
            line: startLine,
            kind: 'type',
          })

          if (hasExportModifier(node)) {
            fileExportSymbols.add(node.name.text)
          }
        }

        if (ts.isEnumDeclaration(node)) {
          const startLine = getNodeLine(node, sourceFile)
          symbols.push({
            name: node.name.text,
            file: fileRelativePath,
            startLine,
            line: startLine,
            kind: 'enum',
          })

          if (hasExportModifier(node)) {
            fileExportSymbols.add(node.name.text)
          }
        }

        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const importClause = node.importClause
          const importedSymbols: string[] = []

          if (importClause) {
            if (importClause.name) {
              importedSymbols.push(importClause.name.text)
            }

            const namedBindings = importClause.namedBindings
            if (namedBindings) {
              if (ts.isNamespaceImport(namedBindings)) {
                importedSymbols.push(`* as ${namedBindings.name.text}`)
              }

              if (ts.isNamedImports(namedBindings)) {
                for (const element of namedBindings.elements) {
                  importedSymbols.push(element.name.text)
                }
              }
            }
          }

          imports.push({
            file: fileRelativePath,
            source: node.moduleSpecifier.text,
            symbols: importedSymbols,
          })
        }

        if (ts.isExportDeclaration(node)) {
          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const element of node.exportClause.elements) {
              fileExportSymbols.add(element.name.text)
            }
          }

          if (!node.exportClause && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            fileExportSymbols.add(`* from ${node.moduleSpecifier.text}`)
          }
        }

        if (ts.isExportAssignment(node)) {
          fileExportSymbols.add('default')
        }

        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
      exportCount += fileExportSymbols.size
    }

    logger.info('AST symbol extraction completed', {
      rootPath,
      fileCount: sourceFiles.length,
      symbolCount: symbols.length,
      importCount: imports.length,
      exportCount,
    })

    return {
      symbols,
      imports,
      fileCount: sourceFiles.length,
    }
  }
}
