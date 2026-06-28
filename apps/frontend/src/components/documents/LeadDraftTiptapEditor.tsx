import { Badge, Box, Group, Text } from '@mantine/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BlockDocument } from '../../api/document-types';
import {
  blockDocumentToTiptapJson,
  tiptapJsonToBlockDocument,
} from '../../lib/blockDocumentTiptap';
import { isSuggestionPersisted } from '../../lib/draftSuggestionUtils.js';
import { withdrawLocalSuggestionInEditor } from '../../tiptap/withdrawLocalSuggestion.js';
import { AuthorSuggestionModeExtension } from '../../tiptap/authorSuggestionMode';
import { BlockIdExtension } from '../../tiptap/blockIdExtension';
import { SuggestionDeleteMark, SuggestionInsertMark } from '../../tiptap/suggestionMarks';
import {
  SuggestionHoverExtension,
  type SuggestionHoverTarget,
} from '../../tiptap/suggestionHoverExtension';
import { SuggestionMarkPopover } from './documentLeadDraft/SuggestionMarkPopover.js';
import { useDraftSuggestionMutations } from './documentLeadDraft/useDraftSuggestionMutations.js';
import { LeadDraftEditorToolbar } from './LeadDraftEditorToolbar.js';
import classes from './LeadDraftTiptapEditor.module.css';

export type LeadDraftTiptapEditorHandle = {
  getBlockDocument: () => BlockDocument;
  getCurrentBlockFingerprint: () => string;
};

export type LeadDraftEditorMode = 'lead' | 'author';

type Props = {
  /** Aktueller Server-Stand (wird bei neuem `contentFingerprint` in den Editor übernommen). */
  sourceDocument: BlockDocument;
  /** Z. B. `JSON.stringify(blocks)` – bei Änderung wird `setContent` ausgeführt. */
  contentFingerprint: string;
  /** Basis für Dirty-Erkennung (normalerweise letzter synchronisierter Serverstand). */
  baselineFingerprint: string;
  editable: boolean;
  editorMode?: LeadDraftEditorMode;
  authorId?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveShortcut?: () => void;
  onSubmitShortcut?: () => void;
  inlineSuggestionBar?: ReactNode;
  suggestionInteractions?: {
    documentId: string;
    draftRevision: number;
    persistedDocument: BlockDocument;
    canPublish: boolean;
    currentUserId?: string;
    authorNameById: Record<string, string>;
    onApplied: (revision: number, blocks: BlockDocument) => void;
    onLocalChange?: () => void;
  };
};

export const LeadDraftTiptapEditor = forwardRef<LeadDraftTiptapEditorHandle, Props>(
  function LeadDraftTiptapEditor(
    {
      sourceDocument,
      contentFingerprint,
      baselineFingerprint,
      editable,
      editorMode = 'lead',
      authorId = '',
      onDirtyChange,
      onSaveShortcut,
      onSubmitShortcut,
      inlineSuggestionBar,
      suggestionInteractions,
    },
    ref
  ) {
    const [, bumpToolbar] = useReducer((n: number) => n + 1, 0);
    const dirtyRef = useRef(false);
    const onDirtyChangeRef = useRef(onDirtyChange);
    const onSaveShortcutRef = useRef(onSaveShortcut);
    const onSubmitShortcutRef = useRef(onSubmitShortcut);
    const authorMode = editorMode === 'author';
    const [hoverTarget, setHoverTarget] = useState<SuggestionHoverTarget | null>(null);
    const hoverCloseTimerRef = useRef<number | null>(null);
    const hoverCallbackRef = useRef<(target: SuggestionHoverTarget | null) => void>(() => {});
    const hoverLeaveCallbackRef = useRef<() => void>(() => {});

    const suggestionMutation = useDraftSuggestionMutations({
      documentId: suggestionInteractions?.documentId ?? '',
      draftRevision: suggestionInteractions?.draftRevision ?? 0,
      onApplied: suggestionInteractions?.onApplied ?? (() => {}),
    });

    const cancelHoverClose = useCallback(() => {
      if (hoverCloseTimerRef.current != null) {
        window.clearTimeout(hoverCloseTimerRef.current);
        hoverCloseTimerRef.current = null;
      }
    }, []);

    const scheduleHoverClose = useCallback(() => {
      cancelHoverClose();
      hoverCloseTimerRef.current = window.setTimeout(() => {
        setHoverTarget(null);
        hoverCloseTimerRef.current = null;
      }, 450);
    }, [cancelHoverClose]);

    useEffect(() => {
      hoverCallbackRef.current = (target) => {
        cancelHoverClose();
        setHoverTarget(target);
      };
      hoverLeaveCallbackRef.current = scheduleHoverClose;
    }, [cancelHoverClose, scheduleHoverClose]);

    const onHoverChange = useCallback((target: SuggestionHoverTarget) => {
      hoverCallbackRef.current(target);
    }, []);

    const onHoverLeave = useCallback(() => {
      hoverLeaveCallbackRef.current();
    }, []);

    useEffect(() => {
      onDirtyChangeRef.current = onDirtyChange;
    }, [onDirtyChange]);
    useEffect(() => {
      onSaveShortcutRef.current = onSaveShortcut;
    }, [onSaveShortcut]);
    useEffect(() => {
      onSubmitShortcutRef.current = onSubmitShortcut;
    }, [onSubmitShortcut]);

    const extensions = useMemo(
      () => [
        StarterKit.configure({
          orderedList: false,
          blockquote: false,
          horizontalRule: false,
          strike: false,
        }),
        BlockIdExtension,
        SuggestionInsertMark,
        SuggestionDeleteMark,
        AuthorSuggestionModeExtension.configure({
          authorId,
          enabled: authorMode && editable,
        }),
        ...(suggestionInteractions
          ? [
              SuggestionHoverExtension.configure({
                authorNameById: suggestionInteractions.authorNameById,
                onHoverChange,
                onHoverLeave,
              }),
            ]
          : []),
      ],
      [authorId, authorMode, editable, onHoverChange, onHoverLeave, suggestionInteractions]
    );

    const editor = useEditor({
      extensions,
      editable,
      content: blockDocumentToTiptapJson(sourceDocument),
      onUpdate: ({ editor: e }) => {
        const current = tiptapJsonToBlockDocument(e.getJSON());
        const dirty = JSON.stringify(current) !== baselineFingerprint;
        if (dirtyRef.current !== dirty) {
          dirtyRef.current = dirty;
          onDirtyChangeRef.current?.(dirty);
        }
      },
      editorProps: {
        attributes: {
          spellcheck: 'true',
        },
        handleKeyDown: (_view, event) => {
          const isMeta = event.metaKey || event.ctrlKey;
          if (!isMeta) return false;
          if (event.key.toLowerCase() === 's') {
            event.preventDefault();
            onSaveShortcutRef.current?.();
            return true;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            onSubmitShortcutRef.current?.();
            return true;
          }
          return false;
        },
      },
    });

    useEffect(() => {
      if (!editor) return;
      type AuthorOpts = { authorId: string; enabled: boolean };
      type HoverOpts = { authorNameById: Record<string, string> };
      const authorExt = editor.extensionManager.extensions.find(
        (ext) => ext.name === 'authorSuggestionMode'
      ) as { options: AuthorOpts } | undefined;
      if (authorExt) {
        authorExt.options.authorId = authorId;
        authorExt.options.enabled = authorMode && editable;
      }
      const hoverExt = editor.extensionManager.extensions.find(
        (ext) => ext.name === 'suggestionHover'
      ) as { options: HoverOpts } | undefined;
      if (hoverExt && suggestionInteractions) {
        hoverExt.options.authorNameById = suggestionInteractions.authorNameById;
        editor.view.dispatch(editor.state.tr.setMeta('suggestionHoverRefresh', true));
      }
    }, [authorId, authorMode, editable, editor, suggestionInteractions]);

    useImperativeHandle(
      ref,
      () => ({
        getBlockDocument: () => {
          if (!editor) return { schemaVersion: 0, blocks: [] };
          return tiptapJsonToBlockDocument(editor.getJSON());
        },
        getCurrentBlockFingerprint: () => {
          if (!editor) return JSON.stringify({ schemaVersion: 0, blocks: [] });
          return JSON.stringify(tiptapJsonToBlockDocument(editor.getJSON()));
        },
      }),
      [editor]
    );

    useEffect(() => {
      if (!editor) return;
      editor.setEditable(editable);
    }, [editor, editable]);

    useEffect(() => {
      if (!editor) return;
      editor.on('selectionUpdate', bumpToolbar);
      editor.on('transaction', bumpToolbar);
      return () => {
        editor.off('selectionUpdate', bumpToolbar);
        editor.off('transaction', bumpToolbar);
      };
    }, [editor]);

    useEffect(() => {
      if (!editor) return;
      const nextJson = blockDocumentToTiptapJson(sourceDocument);
      const cur = editor.getJSON();
      if (JSON.stringify(cur) === JSON.stringify(nextJson)) return;
      editor.commands.setContent(nextJson, false);
      dirtyRef.current = false;
      onDirtyChangeRef.current?.(false);
    }, [contentFingerprint, editor, sourceDocument]);

    if (!editor) {
      return (
        <Text size="sm" c="dimmed">
          Editor wird initialisiert…
        </Text>
      );
    }

    return (
      <Box>
        {inlineSuggestionBar != null && <Box mb="sm">{inlineSuggestionBar}</Box>}
        {!editable && (
          <Group gap="xs" mb="sm">
            <Badge size="sm" variant="filled" color="gray">
              Read only
            </Badge>
          </Group>
        )}
        {editable && <LeadDraftEditorToolbar editor={editor} authorMode={authorMode} />}
        <Box className={classes.editorShell}>
          <EditorContent editor={editor} />
        </Box>
        {suggestionInteractions && (
          <SuggestionMarkPopover
            target={hoverTarget}
            authorNameById={suggestionInteractions.authorNameById}
            canPublish={suggestionInteractions.canPublish}
            currentUserId={suggestionInteractions.currentUserId}
            isPending={suggestionMutation.isPending}
            onMouseEnter={cancelHoverClose}
            onMouseLeave={scheduleHoverClose}
            onAction={(action, suggestionId) => {
              cancelHoverClose();
              setHoverTarget(null);
              if (
                action === 'withdraw' &&
                editor &&
                !isSuggestionPersisted(suggestionInteractions.persistedDocument, suggestionId)
              ) {
                if (withdrawLocalSuggestionInEditor(editor, suggestionId)) {
                  suggestionInteractions.onLocalChange?.();
                }
                return;
              }
              suggestionMutation.mutate({ action, suggestionId });
            }}
          />
        )}
      </Box>
    );
  }
);

LeadDraftTiptapEditor.displayName = 'LeadDraftTiptapEditor';
