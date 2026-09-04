"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CodeLabTeachingPanel, type FileTeachingDetails } from "@/components/CodeLabTeachingPanel";
import { CodeLabLaunchBanner, CodeLabLaunchTeachingPanel } from "@/components/CodeLabLaunchWorkspace";
import { CodeViewer } from "@/components/CodeViewer";
import { IntegrationRecipeBuilder } from "@/components/IntegrationRecipeBuilder";
import { MockFileTree, type MockFileTreeFile } from "@/components/MockFileTree";
import {
  CODE_LAB_LANGUAGES,
  CODE_LAB_WORKFLOWS,
  getCodeLabWorkflow,
  type CodeLabFile,
  type CodeLabLanguage,
  type CodeLabWorkflowId,
} from "@/lib/code-lab-files";
import {
  ARCHITECTURE_OPTIONS,
  AUDIO_SOURCE_OPTIONS,
  CLIENT_TYPE_OPTIONS,
  DEEPGRAM_PRODUCT_OPTIONS,
  DEFAULT_INSERTION_PATTERNS,
  DEFAULT_INTEGRATION_RECIPE,
  OUTPUT_DESTINATION_OPTIONS,
  SECURITY_POSTURE_OPTIONS,
  findSnippetSecurityWarnings,
  generateIntegrationPlan,
  generateStarterFiles,
  getRecipeLabels,
  getSelectedInsertionPatterns,
  sanitizeRecipeSnippet,
  serializeRecipeJson,
  serializeRecipeMarkdown,
  type InsertionPattern,
  type IntegrationRecipe,
  type RecipePreset,
  type RecipeStarterFile,
} from "@/lib/code-lab-recipes";
import {
  detectLikelySecret,
  sanitizeSnippetWithReport,
} from "@/lib/code-lab-launch-context";
import {
  codeLabDraftKey,
  codeLabImportedDraftKey,
  looksLikeRealApiKey,
  readLocalJson,
  removeLocalValue,
  sanitizeSnippetForExport,
  writeLocalJson,
} from "@/lib/code-lab-storage";
import type { LabModuleId } from "@/lib/code-snippets";
import { buildInspectorRecord, createTimelineEvent, type InspectorRecord } from "@/lib/inspection";
import type {
  CodeLabLaunchContext,
  CodeLabLaunchFile,
  CodeLabLaunchMode,
  CodeLabLaunchSemanticRegion,
} from "@/types/code-lab-launch-context";

const RECIPE_STORAGE_KEY = "deepgram-code-lab:recipe:v1";
const CUSTOM_PATTERNS_STORAGE_KEY = "deepgram-code-lab:custom-patterns:v1";
const CUSTOM_FILES_STORAGE_KEY = "deepgram-code-lab:custom-files:v1";

type EditableMockFile = MockFileTreeFile & {
  templateSource?: "workflow" | "recipe" | "custom" | "launch";
  launchSourcePath?: string;
};

export function CodeLab({
  workflowId,
  onWorkflowChange,
  onOpenModule,
  onCopy,
  copiedLabel,
  onInspectorChange,
  initialLanguage = "TypeScript",
  launchContext = null,
  launchMode = null,
  onClearLaunch,
  onReturnToQuestline,
  onOpenApiStudio,
}: {
  workflowId: CodeLabWorkflowId;
  onWorkflowChange: (workflowId: CodeLabWorkflowId) => void;
  onOpenModule: (moduleId: LabModuleId) => void;
  onCopy: (text: string) => void;
  copiedLabel?: string;
  onInspectorChange?: (record: InspectorRecord) => void;
  initialLanguage?: CodeLabLanguage;
  launchContext?: CodeLabLaunchContext | null;
  launchMode?: CodeLabLaunchMode | null;
  onClearLaunch?: () => void;
  onReturnToQuestline?: () => void;
  onOpenApiStudio?: (operationId: string) => void;
}) {
  const [language, setLanguage] = useState<CodeLabLanguage>(initialLanguage);
  const [recipe, setRecipe] = useState<IntegrationRecipe>(() => cloneRecipe(DEFAULT_INTEGRATION_RECIPE));
  const [customPatterns, setCustomPatterns] = useState<InsertionPattern[]>([]);
  const [customFiles, setCustomFiles] = useState<EditableMockFile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activePath, setActivePath] = useState("");
  const [editorMode, setEditorMode] = useState<"edit" | "view">("edit");
  const [savedLabel, setSavedLabel] = useState("");
  const [generationMessage, setGenerationMessage] = useState("");
  const [addFileOpen, setAddFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [newFileError, setNewFileError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [savedLaunchPaths, setSavedLaunchPaths] = useState<string[]>([]);
  const [activeRegion, setActiveRegion] = useState<CodeLabLaunchSemanticRegion | null>(null);
  const [highlightRevision, setHighlightRevision] = useState(0);
  const [inspectorStartedAt] = useState(() => new Date().toISOString());
  const savedTimerRef = useRef<number | null>(null);

  const workflow = useMemo(() => getCodeLabWorkflow(workflowId), [workflowId]);
  const recipeLabels = useMemo(() => getRecipeLabels(recipe), [recipe]);
  const recipeFiles = useMemo(() => generateStarterFiles(recipe, customPatterns), [customPatterns, recipe]);
  const plan = useMemo(() => generateIntegrationPlan(recipe, customPatterns), [customPatterns, recipe]);
  const selectedPatterns = useMemo(() => getSelectedInsertionPatterns(recipe, customPatterns), [customPatterns, recipe]);
  const allPatterns = useMemo(() => [...DEFAULT_INSERTION_PATTERNS, ...customPatterns], [customPatterns]);
  const recipeFileByPath = useMemo(() => new Map(recipeFiles.map((file) => [file.path, file])), [recipeFiles]);

  const persistentFiles = useMemo<EditableMockFile[]>(() => {
    const merged = new Map<string, EditableMockFile>();

    for (const file of workflow.filesByLanguage[language]) {
      merged.set(file.path, { ...file, templateSource: "workflow" });
    }

    for (const starter of recipeFiles) {
      if (!merged.has(starter.path)) {
        merged.set(starter.path, { ...recipeFileToCodeLabFile(starter, plan), templateSource: "recipe", removable: starter.deletable });
      }
    }

    for (const file of customFiles.filter((item) => item.language === language)) {
      if (!merged.has(file.path)) merged.set(file.path, file);
    }

    return Array.from(merged.values());
  }, [customFiles, language, plan, recipeFiles, workflow.filesByLanguage]);

  const importedFiles = useMemo<EditableMockFile[]>(
    () => launchContext ? launchContext.files.map((file) => launchFileToCodeLabFile(file, launchContext)) : [],
    [launchContext],
  );

  const files = useMemo<EditableMockFile[]>(() => {
    if (!launchContext) return persistentFiles;
    if (launchMode === "merge") return mergeTemporaryWorkspaceFiles(persistentFiles, importedFiles, launchContext.sourceId ?? launchContext.id);
    return importedFiles;
  }, [importedFiles, launchContext, launchMode, persistentFiles]);

  const recommendedLaunchPath = launchContext
    ? files.find(
        (file) =>
          file.templateSource === "launch" &&
          file.launchSourcePath === launchContext.files[0]?.path,
      )?.path
    : undefined;
  const activeFile =
    files.find((file) => file.path === activePath) ||
    files.find((file) => file.path === recommendedLaunchPath) ||
    files[0] ||
    createEmptyFile(language);
  const activeDraftKey = launchContext
    ? `memory:${launchContext.id}:${activeFile.language}:${activeFile.path}`
    : codeLabDraftKey(workflowId, activeFile.language, activeFile.path);
  const activeCode = drafts[activeDraftKey] ?? activeFile.code;
  const secretWarnings = useMemo(() => {
    const warnings = findSnippetSecurityWarnings(activeCode);
    if (detectLikelySecret(activeCode)) warnings.push("Possible credential detected. It remains in memory only and cannot be saved.");
    return Array.from(new Set(warnings));
  }, [activeCode]);
  const activeModified = activeCode !== activeFile.code;

  const filesWithModificationState = useMemo(
    () =>
      files.map((file) => ({
        ...file,
        modified: (drafts[launchContext ? `memory:${launchContext.id}:${file.language}:${file.path}` : codeLabDraftKey(workflowId, file.language, file.path)] ?? file.code) !== file.code,
      })),
    [drafts, files, launchContext, workflowId],
  );

  const activeRecipeFile = recipeFileByPath.get(activeFile.path);
  const teachingDetails = activeRecipeFile ? recipeTeachingDetails(activeRecipeFile) : undefined;

  const exportFiles = useMemo(
    () =>
      files.map((file) => {
        const key = launchContext ? `memory:${launchContext.id}:${file.language}:${file.path}` : codeLabDraftKey(workflowId, file.language, file.path);
        const code = drafts[key] ?? file.code;
        return codeLabFileToRecipeFile(file, sanitizeRecipeSnippet(sanitizeSnippetForExport(code)), recipeFileByPath.get(file.path));
      }),
    [drafts, files, launchContext, recipeFileByPath, workflowId],
  );

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const storedRecipe = readLocalJson<IntegrationRecipe | null>(RECIPE_STORAGE_KEY, null);
      const storedPatterns = readLocalJson<InsertionPattern[]>(CUSTOM_PATTERNS_STORAGE_KEY, []);
      const storedFiles = readLocalJson<EditableMockFile[]>(CUSTOM_FILES_STORAGE_KEY, []);

      if (isStoredRecipe(storedRecipe)) setRecipe(cloneRecipe(storedRecipe));
      setCustomPatterns(storedPatterns.filter(isStoredPattern).filter((pattern) => !looksLikeRealApiKey(JSON.stringify(pattern))));
      setCustomFiles(storedFiles.filter(isStoredFile));
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!hydrated || looksLikeRealApiKey(JSON.stringify(recipe))) return;
    writeLocalJson(RECIPE_STORAGE_KEY, recipe);
  }, [hydrated, recipe]);

  useEffect(() => {
    if (!hydrated || looksLikeRealApiKey(JSON.stringify(customPatterns))) return;
    writeLocalJson(CUSTOM_PATTERNS_STORAGE_KEY, customPatterns);
  }, [customPatterns, hydrated]);

  useEffect(() => {
    if (!hydrated || customFiles.some((file) => findSnippetSecurityWarnings(file.code).length > 0 || looksLikeRealApiKey(file.code))) return;
    writeLocalJson(CUSTOM_FILES_STORAGE_KEY, customFiles);
  }, [customFiles, hydrated]);

  useEffect(() => {
    if (launchContext || !hydrated || drafts[activeDraftKey] !== undefined) return;

    const stored = readLocalJson<string | null>(activeDraftKey, null);
    const safeStored = stored && !findSnippetSecurityWarnings(stored).length && !looksLikeRealApiKey(stored) ? stored : activeFile.code;
    if (stored && safeStored !== stored) removeLocalValue(activeDraftKey);
    const draftTimer = window.setTimeout(() => {
      setDrafts((current) => (current[activeDraftKey] === undefined ? { ...current, [activeDraftKey]: safeStored } : current));
    }, 0);

    return () => window.clearTimeout(draftTimer);
  }, [activeDraftKey, activeFile.code, drafts, hydrated, launchContext]);

  useEffect(() => {
    if (!launchContext || launchMode !== "merge" || !hydrated) return;
    const timer = window.setTimeout(() => {
      setDrafts((current) => {
        const next = { ...current };
        for (const file of persistentFiles) {
          const stored = readLocalJson<string | null>(codeLabDraftKey(workflowId, file.language, file.path), null);
          if (!stored || detectLikelySecret(stored) || findSnippetSecurityWarnings(stored).length > 0) continue;
          const memoryKey = `memory:${launchContext.id}:${file.language}:${file.path}`;
          if (next[memoryKey] === undefined) next[memoryKey] = stored;
        }
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrated, launchContext, launchMode, persistentFiles, workflowId]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  const codeLabInspector = useMemo(
    () =>
      buildInspectorRecord({
        id: `code-lab-${workflowId}-${language}-${encodeURIComponent(activeFile.path)}`,
        module: "Code Lab",
        startedAt: inspectorStartedAt,
        completedAt: inspectorStartedAt,
        request: {
          method: "LOCAL",
          endpoint: "https://local.voice-lab.invalid/code-lab/recipe",
          bodyPreview: {
            current_workflow: workflowId,
            selected_language: language,
            selected_architecture: recipeLabels.architecture,
            selected_file: activeFile.path,
          },
        },
        response: {
          status: 200,
          bodyPreview: {
            current_workflow: workflowId,
            selected_language: language,
            selected_architecture: recipeLabels.architecture,
            selected_file: activeFile.path,
            file_modified: activeModified,
            selected_insertion_patterns: selectedPatterns.map((pattern) => ({ id: pattern.id, name: pattern.name, layer: pattern.layer })),
            recipe,
            generated_flow: plan.flow.map((block) => ({ label: block.label, kind: block.kind })),
            security_warnings: [...plan.warnings, ...secretWarnings],
          },
        },
        timeline: [
          createTimelineEvent({
            at: inspectorStartedAt,
            type: "recipe_state",
            label: "Integration recipe modeled locally",
            detail: `${recipeLabels.architecture}; ${activeFile.path}`,
          }),
        ],
        notes: [
          "Code Lab files are editable local learning drafts and are never executed.",
          "The main Deepgram API key belongs only in trusted server or local runtime configuration.",
          `Generated flow: ${plan.flow.map((block) => block.label).join(" -> ")}`,
        ],
      }),
    [
      activeFile.path,
      activeModified,
      inspectorStartedAt,
      language,
      plan.flow,
      plan.warnings,
      recipe,
      recipeLabels.architecture,
      secretWarnings,
      selectedPatterns,
      workflowId,
    ],
  );

  useEffect(() => {
    onInspectorChange?.(codeLabInspector);
  }, [codeLabInspector, onInspectorChange]);

  function handleEditorChange(value: string) {
    setDrafts((current) => ({ ...current, [activeDraftKey]: value }));
    setSavedLabel("");
    if (launchContext) {
      setSavedLaunchPaths((current) => current.filter((path) => path !== activeFile.path));
      return;
    }
    const warnings = findSnippetSecurityWarnings(value);
    if (!warnings.length && !looksLikeRealApiKey(value)) {
      writeLocalJson(activeDraftKey, value);
    } else {
      removeLocalValue(activeDraftKey);
    }
  }

  function resetActiveFile() {
    setDrafts((current) => ({ ...current, [activeDraftKey]: activeFile.code }));
    if (launchContext) {
      setSavedLaunchPaths((current) => current.filter((path) => path !== activeFile.path));
      showSavedStatus("Starter restored.");
      return;
    }
    removeLocalValue(activeDraftKey);
    showSavedStatus("Template restored.");
  }

  function saveActiveFile() {
    if (launchContext) {
      const report = sanitizeSnippetWithReport(activeCode);
      if (detectLikelySecret(report.value)) {
        showSavedStatus("Secret blocked.");
        return;
      }
      if (report.replacements > 0) {
        setDrafts((current) => ({ ...current, [activeDraftKey]: report.value }));
        showSavedStatus("Redacted + saved.");
      }
      const storageKey = codeLabImportedDraftKey(launchContext.sourceId ?? launchContext.id, activeFile.language, activeFile.path);
      const saved = writeLocalJson(storageKey, report.value);
      if (saved) setSavedLaunchPaths((current) => addUnique(current, activeFile.path));
      if (report.replacements === 0) showSavedStatus(saved ? "Saved locally." : "Local save unavailable.");
      return;
    }
    if (secretWarnings.length) {
      showSavedStatus("Secret not saved.");
      return;
    }
    showSavedStatus(writeLocalJson(activeDraftKey, activeCode) ? "Saved locally." : "Local save unavailable.");
  }

  function showSavedStatus(message: string) {
    setSavedLabel(message);
    if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => setSavedLabel(""), 1800);
  }

  function handleRecipeChange(nextRecipe: IntegrationRecipe) {
    if (looksLikeRealApiKey(nextRecipe.customClientType || "")) {
      setRecipe({ ...nextRecipe, customClientType: "" });
      setGenerationMessage("Recipe not updated. Remove possible API keys or tokens from the custom client field.");
      return;
    }
    if (nextRecipe.architecture !== recipe.architecture) setLanguage(languageForArchitecture(nextRecipe.architecture));
    if (nextRecipe.deepgramProduct !== recipe.deepgramProduct || nextRecipe.audioSource !== recipe.audioSource) {
      onWorkflowChange(workflowForRecipe(nextRecipe));
    }
    setRecipe(cloneRecipe(nextRecipe));
    setGenerationMessage("");
  }

  function applyPreset(preset: RecipePreset) {
    const nextRecipe = cloneRecipe(preset.recipe);
    setRecipe(nextRecipe);
    setLanguage(languageForArchitecture(nextRecipe.architecture));
    onWorkflowChange(workflowForRecipe(nextRecipe));
    setActivePath("");
    setGenerationMessage(`${preset.name} loaded. Suggested files and flow updated.`);
  }

  function togglePattern(patternId: string) {
    const selected = recipe.selectedPatternIds.includes(patternId);
    setRecipe({
      ...recipe,
      selectedPatternIds: selected ? recipe.selectedPatternIds.filter((id) => id !== patternId) : [...recipe.selectedPatternIds, patternId],
    });
    setGenerationMessage("");
  }

  function addCustomPattern(pattern: InsertionPattern) {
    if (looksLikeRealApiKey(JSON.stringify(pattern))) {
      setGenerationMessage("Custom pattern not added. Remove possible API keys or tokens first.");
      return;
    }
    const nextPatterns = [...customPatterns, pattern];
    setCustomPatterns(nextPatterns);
    setRecipe({ ...recipe, selectedPatternIds: [...recipe.selectedPatternIds, pattern.id] });
  }

  function deleteCustomPattern(patternId: string) {
    setCustomPatterns(customPatterns.filter((pattern) => pattern.id !== patternId));
    setRecipe({ ...recipe, selectedPatternIds: recipe.selectedPatternIds.filter((id) => id !== patternId) });
  }

  function generateFilesInMockIde() {
    const nextDrafts = { ...drafts };
    for (const file of recipeFiles) {
      const key = codeLabDraftKey(workflowId, file.language, file.path);
      const stored = readLocalJson<string | null>(key, null);
      if (nextDrafts[key] === undefined) nextDrafts[key] = stored ?? file.code;
      if (stored === null && !findSnippetSecurityWarnings(file.code).length && !looksLikeRealApiKey(file.code)) writeLocalJson(key, file.code);
    }
    setDrafts(nextDrafts);
    if (recipeFiles[0]) setActivePath(recipeFiles[0].path);
    setGenerationMessage(`${recipeFiles.length} starter files created in the local mock IDE. No files were written to disk.`);
  }

  function addCustomFile() {
    const path = newFilePath.trim().replaceAll("\\", "/");
    if (!path || path.endsWith("/")) {
      setNewFileError("Enter a file path, including its file name.");
      return;
    }
    if (files.some((file) => file.path.toLowerCase() === path.toLowerCase())) {
      setNewFileError("That file already exists in this mock workspace.");
      return;
    }

    const customFile = createCustomFile(path, language);
    setCustomFiles([...customFiles, customFile]);
    setNewFilePath("");
    setNewFileError("");
    setAddFileOpen(false);
    setActivePath(path);
  }

  function deleteCustomFile(path: string) {
    const target = customFiles.find((file) => file.path === path);
    if (!target) return;
    setCustomFiles(customFiles.filter((file) => file.path !== path));
    const key = codeLabDraftKey(workflowId, target.language, target.path);
    const nextDrafts = { ...drafts };
    delete nextDrafts[key];
    setDrafts(nextDrafts);
    removeLocalValue(key);
    if (activeFile.path === path) setActivePath("");
  }

  function downloadRecipe(kind: "json" | "markdown") {
    const content =
      kind === "json"
        ? serializeRecipeJson(recipe, { customPatterns, files: exportFiles })
        : serializeRecipeMarkdown(recipe, { customPatterns, files: exportFiles });
    downloadTextFile(
      sanitizeSnippetForExport(content),
      `deepgram-${recipe.architecture}-recipe.${kind === "json" ? "json" : "md"}`,
      kind === "json" ? "application/json" : "text/markdown",
    );
  }

  function selectSemanticRegion(path: string, region: CodeLabLaunchSemanticRegion) {
    setActivePath(files.find((file) => file.path === path || file.launchSourcePath === path)?.path ?? path);
    setActiveRegion(region);
    setHighlightRevision((current) => current + 1);
    setEditorMode("edit");
  }

  return (
    <div className={launchContext ? "flex h-full min-h-0 flex-col overflow-hidden p-2" : "space-y-4 pb-5"}>
      <div className={launchContext ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#05080d] shadow-[0_24px_90px_rgba(0,0,0,0.35)]" : "overflow-hidden rounded-lg border border-white/10 bg-[#05080d] shadow-[0_24px_90px_rgba(0,0,0,0.35)]"}>
        {launchContext ? (
          <CodeLabLaunchBanner
            context={launchContext}
            modified={filesWithModificationState.some((file) => file.modified)}
            savedLocally={savedLaunchPaths.length > 0}
            secretWarning={secretWarnings.length > 0}
            onReturnToQuestline={() => onReturnToQuestline?.()}
            onOpenRelatedApi={launchContext.relatedApiStudioOperationId && onOpenApiStudio ? () => onOpenApiStudio(launchContext.relatedApiStudioOperationId!) : undefined}
            onDiscard={() => onClearLaunch?.()}
          />
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#071018] px-3 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">Interactive Mock IDE - educational, not executable</p>
            <h3 className="mt-1 truncate text-base font-semibold text-white">{launchContext?.workflow.title ?? workflow.title}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={workflowId}
              onChange={(event) => {
                onWorkflowChange(event.target.value as CodeLabWorkflowId);
                setActivePath("");
              }}
              aria-label="Code Lab workflow"
              disabled={Boolean(launchContext)}
              className="h-9 rounded-md border border-white/10 bg-black/30 px-2 text-xs font-semibold text-slate-200 outline-none focus:border-cyan-200/50"
            >
              {CODE_LAB_WORKFLOWS.map((item) => (
                <option key={item.id} value={item.id} className="bg-slate-950">{item.title}</option>
              ))}
            </select>
            {!launchContext && workflow.relatedModule ? (
              <button
                type="button"
                onClick={() => onOpenModule(workflow.relatedModule!)}
                className="h-9 rounded-md border border-cyan-200/25 bg-cyan-200/10 px-2.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-200 hover:text-slate-950"
              >
                Open related lab module
              </button>
            ) : null}
            {!launchContext && workflow.relatedModule !== "api-studio" ? (
              <button
                type="button"
                onClick={() => onOpenModule("api-studio")}
                className="h-9 rounded-md border border-violet-200/25 bg-violet-200/10 px-2.5 text-xs font-semibold text-violet-100 hover:bg-violet-200 hover:text-slate-950"
              >
                Open API Studio
              </button>
            ) : null}
            {!launchContext ? <button
              type="button"
              onClick={() => onOpenModule("applied-voice-systems")}
              className="h-9 rounded-md border border-emerald-200/20 bg-emerald-200/[0.07] px-2.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-200 hover:text-slate-950"
            >
              Open Applied Systems
            </button> : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 border-b border-white/10 bg-black/20 p-1 sm:grid-cols-5">
          {CODE_LAB_LANGUAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setLanguage(item.id); setActivePath(""); }}
              disabled={Boolean(launchContext)}
              aria-pressed={language === item.id}
              className={`h-9 rounded-md px-2 text-xs font-semibold transition ${
                language === item.id ? "bg-cyan-200 text-slate-950" : `text-slate-400 ${launchContext ? "cursor-not-allowed opacity-35" : "hover:bg-white/[0.06] hover:text-white"}`
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {!launchContext && addFileOpen ? (
          <div className="flex flex-wrap items-end gap-2 border-b border-cyan-200/15 bg-cyan-200/[0.035] px-3 py-3">
            <label className="min-w-64 flex-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">New mock file path</span>
              <input
                value={newFilePath}
                onChange={(event) => { setNewFilePath(event.target.value); setNewFileError(""); }}
                onKeyDown={(event) => { if (event.key === "Enter") addCustomFile(); }}
                placeholder="src/integrations/deepgram.ts"
                autoFocus
                className="mt-1.5 h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 font-mono text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-200/45"
              />
            </label>
            <button type="button" onClick={addCustomFile} className="h-10 rounded-md bg-cyan-200 px-3 text-xs font-semibold text-slate-950 hover:bg-white">Add File</button>
            <button type="button" onClick={() => { setAddFileOpen(false); setNewFileError(""); }} className="h-10 rounded-md border border-white/10 px-3 text-xs font-semibold text-slate-300 hover:bg-white/[0.06]">Cancel</button>
            {newFileError ? <p className="w-full text-xs text-rose-200" role="alert">{newFileError}</p> : null}
          </div>
        ) : null}

        <div className={launchContext ? "grid min-h-0 flex-1 grid-cols-[210px_minmax(0,1fr)_310px] overflow-hidden" : "grid min-h-[620px] lg:grid-cols-[240px_minmax(0,1fr)_360px]"} data-testid="code-lab-workspace">
          <MockFileTree
            files={filesWithModificationState}
            activePath={activeFile.path}
            onSelect={(path) => { setActivePath(path); setActiveRegion(null); }}
            onAddFile={launchContext ? undefined : () => setAddFileOpen(true)}
            onDeleteFile={launchContext ? undefined : deleteCustomFile}
            title={launchContext ? `${launchContext.source}:${launchContext.sourceId ?? launchContext.id}` : recipeLabels.architecture}
          />
          <CodeViewer
            file={activeFile}
            value={activeCode}
            onChange={handleEditorChange}
            mode={editorMode}
            onModeChange={setEditorMode}
            onReset={resetActiveFile}
            onSave={saveActiveFile}
            onCopy={onCopy}
            copiedLabel={copiedLabel}
            savedLabel={savedLabel}
            saveLabel={launchContext ? "Save as local draft" : "Save Draft"}
            modified={activeModified}
            secretWarning={secretWarnings[0]}
            highlightLines={activeRegion && activeFile.path === activePath ? { startLine: activeRegion.startLine, endLine: activeRegion.endLine, revision: highlightRevision } : undefined}
          />
          {launchContext ? (
            <CodeLabLaunchTeachingPanel
              context={launchContext}
              activePath={activeFile.path}
              activeRegionId={activeRegion?.id}
              onSelectRegion={selectSemanticRegion}
            />
          ) : (
            <CodeLabTeachingPanel workflow={workflow} file={activeFile} details={teachingDetails} flow={plan.flow.map((block) => block.label)} />
          )}
        </div>
      </div>

      {!launchContext ? <IntegrationRecipeBuilder
        recipe={recipe}
        patterns={allPatterns}
        plan={plan}
        generationMessage={generationMessage}
        onRecipeChange={handleRecipeChange}
        onPresetSelect={applyPreset}
        onTogglePattern={togglePattern}
        onAddCustomPattern={addCustomPattern}
        onDeleteCustomPattern={deleteCustomPattern}
        onGenerateStarterFiles={generateFilesInMockIde}
        onExportJson={() => downloadRecipe("json")}
        onDownloadMarkdown={() => downloadRecipe("markdown")}
      /> : null}
    </div>
  );
}

function launchFileToCodeLabFile(file: CodeLabLaunchFile, context: CodeLabLaunchContext): EditableMockFile {
  return {
    path: file.path,
    role: file.role,
    side: sideForLaunchLayer(file.layer),
    language: file.language,
    code: file.content,
    whereItFits: `Generated for ${context.workflow.title}. ${file.role}`,
    requestFlow: [context.workflow.transport ?? "Local learning flow", ...context.workflow.deepgramCapabilities],
    responsePaths: context.workflow.outputDestination ? [context.workflow.outputDestination] : [],
    environmentVariables: context.environmentVariables.map((variable) => variable.name),
    securityNotes: context.securityWarnings,
    templateSource: "launch",
    launchSourcePath: file.path,
  };
}

function mergeTemporaryWorkspaceFiles(
  existingFiles: EditableMockFile[],
  importedFiles: EditableMockFile[],
  sourceId: string,
) {
  const merged = new Map(existingFiles.map((file) => [file.path.toLowerCase(), file]));
  const importRoot = `.questline-imports/${slugPathSegment(sourceId)}`;

  for (const file of importedFiles) {
    let path = file.path;
    if (merged.has(path.toLowerCase())) path = uniqueImportedPath(`${importRoot}/${file.path}`, merged);
    merged.set(path.toLowerCase(), { ...file, path, launchSourcePath: file.launchSourcePath ?? file.path });
  }

  return [...merged.values()];
}

function uniqueImportedPath(candidate: string, files: Map<string, EditableMockFile>) {
  if (!files.has(candidate.toLowerCase())) return candidate;
  const dotIndex = candidate.lastIndexOf(".");
  const base = dotIndex > candidate.lastIndexOf("/") ? candidate.slice(0, dotIndex) : candidate;
  const extension = dotIndex > candidate.lastIndexOf("/") ? candidate.slice(dotIndex) : "";
  let suffix = 2;
  while (files.has(`${base}-${suffix}${extension}`.toLowerCase())) suffix += 1;
  return `${base}-${suffix}${extension}`;
}

function sideForLaunchLayer(layer: string): CodeLabFile["side"] {
  if (layer === "client") return "Client-side";
  if (layer === "server" || layer === "test") return "Server-side";
  if (layer === "config") return "Config";
  return "Shared";
}

function slugPathSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "questline";
}

function addUnique(values: string[], value: string) {
  return values.includes(value) ? values : [...values, value];
}

function recipeFileToCodeLabFile(file: RecipeStarterFile, plan: ReturnType<typeof generateIntegrationPlan>): CodeLabFile {
  return {
    path: file.path,
    role: file.fileRole,
    side: sideForRecipeFile(file),
    language: file.language,
    code: file.code,
    whereItFits: file.productionNotes.join(" "),
    requestFlow: plan.flow.map((block) => block.label),
    responsePaths: plan.payloadPaths,
    environmentVariables: file.canAccessDeepgramApiKey ? ["DEEPGRAM_API_KEY"] : [],
    securityNotes: [...file.commonMistakes, ...file.productionNotes],
  };
}

function codeLabFileToRecipeFile(file: CodeLabFile, code: string, source?: RecipeStarterFile): RecipeStarterFile {
  if (source) return { ...source, code, commonMistakes: [...source.commonMistakes], productionNotes: [...source.productionNotes], patternIds: [...source.patternIds] };
  const browser = file.side === "Client-side";
  const local = file.side === "CLI";
  return {
    path: file.path,
    language: file.language,
    code,
    source: "architecture",
    deletable: Boolean((file as EditableMockFile).removable),
    patternIds: [],
    fileRole: file.role,
    layer: file.side === "Config" ? "config" : file.side === "Shared" ? "shared" : browser ? "frontend" : local ? "cli" : "backend",
    runtime: file.side === "Config" ? "configuration" : browser ? "browser" : local ? "local" : "server",
    canAccessDeepgramApiKey: !browser,
    callsDeepgramDirectly: file.code.includes("api.deepgram.com"),
    receivesRawAudio: /audio|blob|mediarecorder|formdata/i.test(file.code),
    receivesTranscriptJson: file.responsePaths.some((path) => /transcript|results|channel/i.test(path)),
    commonMistakes: [...file.securityNotes],
    productionNotes: [file.whereItFits],
  };
}

function recipeTeachingDetails(file: RecipeStarterFile): FileTeachingDetails {
  return {
    layer: file.layer,
    runtime: file.runtime === "browser" ? "Browser" : file.runtime === "local" ? "Local runtime" : file.runtime === "configuration" ? "Runtime configuration" : "Server",
    canAccessApiKey: file.canAccessDeepgramApiKey ? "Yes, from environment configuration only." : "No. Use a local server route or a temporary browser token.",
    callsDeepgramDirectly: file.callsDeepgramDirectly ? "Yes" : "No",
    receivesRawAudio: file.receivesRawAudio ? "Yes" : "No",
    receivesTranscriptJson: file.receivesTranscriptJson ? "Yes" : "No",
    commonMistakes: file.commonMistakes,
    productionNotes: file.productionNotes,
  };
}

function sideForRecipeFile(file: RecipeStarterFile): CodeLabFile["side"] {
  if (file.runtime === "browser") return "Client-side";
  if (file.runtime === "configuration") return "Config";
  if (file.runtime === "local") return "CLI";
  if (file.layer === "shared") return "Shared";
  return "Server-side";
}

function createCustomFile(path: string, language: CodeLabLanguage): EditableMockFile {
  const comment = language === "Shell" || language === "Python" ? "#" : "//";
  return {
    path,
    role: "Custom integration file created in the local mock IDE.",
    side: "Shared",
    language,
    code: `${comment} Model this Deepgram integration file here.\n`,
    whereItFits: "A learner-created file. Decide whether it belongs in the browser, server, worker, CLI, database, or external integration layer.",
    requestFlow: ["Application", "Custom integration", "Deepgram or destination"],
    responsePaths: ["Choose the response fields this file should inspect."],
    environmentVariables: [],
    securityNotes: ["Do not paste real API keys into this file.", "Move provider calls behind a trusted boundary when this file runs in a browser."],
    custom: true,
    removable: true,
    templateSource: "custom",
  };
}

function createEmptyFile(language: CodeLabLanguage): EditableMockFile {
  return createCustomFile("untitled.txt", language);
}

function cloneRecipe(recipe: IntegrationRecipe): IntegrationRecipe {
  return { ...recipe, securityPostures: [...recipe.securityPostures], selectedPatternIds: [...recipe.selectedPatternIds] };
}

function languageForArchitecture(architecture: IntegrationRecipe["architecture"]): CodeLabLanguage {
  if (architecture === "python-fastapi" || architecture === "cli-batch") return "Python";
  if (architecture === "go-service") return "Go";
  if (architecture === "dotnet-api") return ".NET";
  return "TypeScript";
}

function workflowForRecipe(recipe: IntegrationRecipe): CodeLabWorkflowId {
  if (recipe.deepgramProduct === "text-to-speech") return "tts";
  if (recipe.deepgramProduct === "voice-agent-concept") return "voice-agent";
  if (recipe.deepgramProduct === "live-streaming-stt" || recipe.deepgramProduct === "temporary-token-auth" || recipe.audioSource === "browser-microphone" || recipe.audioSource === "live-websocket-stream") return "live-mic";
  if (recipe.audioSource === "file-upload" || recipe.audioSource === "call-recording") return "upload-audio";
  return "transcribe-url";
}

function isStoredRecipe(value: IntegrationRecipe | null): value is IntegrationRecipe {
  return Boolean(
    value &&
      CLIENT_TYPE_OPTIONS.some((option) => option.id === value.clientType) &&
      ARCHITECTURE_OPTIONS.some((option) => option.id === value.architecture) &&
      AUDIO_SOURCE_OPTIONS.some((option) => option.id === value.audioSource) &&
      DEEPGRAM_PRODUCT_OPTIONS.some((option) => option.id === value.deepgramProduct) &&
      OUTPUT_DESTINATION_OPTIONS.some((option) => option.id === value.outputDestination) &&
      (value.customClientType === undefined || typeof value.customClientType === "string") &&
      !looksLikeRealApiKey(value.customClientType || "") &&
      Array.isArray(value.securityPostures) &&
      value.securityPostures.every((id) => SECURITY_POSTURE_OPTIONS.some((option) => option.id === id)) &&
      Array.isArray(value.selectedPatternIds) &&
      value.selectedPatternIds.every((id) => typeof id === "string"),
  );
}

function isStoredPattern(value: InsertionPattern): value is InsertionPattern {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.name === "string" &&
      typeof value.purpose === "string" &&
      ["frontend", "backend", "api-route", "worker", "cli", "database", "external-system"].includes(value.layer) &&
      Array.isArray(value.risks) &&
      value.risks.every((risk) => typeof risk === "string") &&
      Array.isArray(value.filesTouched) &&
      value.filesTouched.every((path) => typeof path === "string") &&
      typeof value.codeSnippetReference === "string" &&
      typeof value.removable === "boolean",
  );
}

function isStoredFile(value: EditableMockFile): value is EditableMockFile {
  return Boolean(
    value &&
      value.custom &&
      typeof value.path === "string" &&
      typeof value.role === "string" &&
      ["Client-side", "Server-side", "Config", "Shared", "CLI"].includes(value.side) &&
      CODE_LAB_LANGUAGES.some((language) => language.id === value.language) &&
      typeof value.code === "string" &&
      typeof value.whereItFits === "string" &&
      Array.isArray(value.requestFlow) &&
      value.requestFlow.every((step) => typeof step === "string") &&
      Array.isArray(value.responsePaths) &&
      value.responsePaths.every((path) => typeof path === "string") &&
      Array.isArray(value.environmentVariables) &&
      value.environmentVariables.every((name) => typeof name === "string") &&
      Array.isArray(value.securityNotes) &&
      value.securityNotes.every((note) => typeof note === "string") &&
      !looksLikeRealApiKey(value.code),
  );
}

function downloadTextFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
