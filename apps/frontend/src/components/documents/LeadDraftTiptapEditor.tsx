import { Badge, Box, Button, Group, Text } from '@mantine/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type { BlockDocumentV0 } from '../../api/document-types';
import {
  blockDocumentToTiptapJson,
  tiptapJsonToBlockDocument,
} from '../../lib/blockDocumentTiptap';
import { BlockIdExtension } from '../../tiptap/blockIdExtension';
import classes from './LeadDraftTiptapEditor.module.css';

export type LeadDraftTiptapEditorHandle = {
  getBlockDocument: () => BlockDocumentV0;
  getCurrentBlockFingerprint: () => string;
};

type Props = {
  /** Aktueller Server-Stand (wird bei neuem `contentFingerprint` in den Editor übernommen). */
  sourceDocument: BlockDocumentV0;
  /** Z. B. `JSON.stringify(blocks)` – bei Änderung wird `setContent` ausgeführt. */
  contentFingerprint: string;
  /** Basis für Dirty-Erkennung (normalerweise letzter synchronisierter Serverstand). */
  baselineFingerprint: string;
  editable: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveShortcut?: () => void;
  onSubmitShortcut?: () => void;
  inlineSuggestionBar?: ReactNode;
};

export const LeadDraftTiptapEditor = forwardRef<LeadDraftTiptapEditorHandle, Props>(
  function LeadDraftTiptapEditor(
    {
      sourceDocument,
      contentFingerprint,
      baselineFingerprint,
      editable,
      onDirtyChange,
      onSaveShortcut,
      onSubmitShortcut,
      inlineSuggestionBar,
    },
    ref
  ) {
    const [, bumpToolbar] = useReducer((n: number) => n + 1, 0);
    const dirtyRef = useRef(false);
    const onDirtyChangeRef = useRef(onDirtyChange);
    const onSaveShortcutRef = useRef(onSaveShortcut);
    const onSubmitShortcutRef = useRef(onSubmitShortcut);

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
          bold: false,
          italic: false,
          strike: false,
          code: false,
        }),
        BlockIdExtension,
      ],
      []
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
            <Badge size="sm" variant="light" color="gray">
              Read only
            </Badge>
          </Group>
        )}
        {editable && (
          <Group gap="xs" mb="sm" wrap="wrap">
            <Button
              size="compact-xs"
              variant={editor.isActive('heading', { level: 1 }) ? 'filled' : 'light'}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              H1
            </Button>
            <Button
              size="compact-xs"
              variant={editor.isActive('heading', { level: 2 }) ? 'filled' : 'light'}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              H2
            </Button>
            <Button
              size="compact-xs"
              variant={editor.isActive('heading', { level: 3 }) ? 'filled' : 'light'}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              H3
            </Button>
            <Button
              size="compact-xs"
              variant={editor.isActive('bulletList') ? 'filled' : 'light'}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              List
            </Button>
            <Button
              size="compact-xs"
              variant={editor.isActive('codeBlock') ? 'filled' : 'light'}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            >
              Code
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => editor.chain().focus().setParagraph().run()}
            >
              Paragraph
            </Button>
          </Group>
        )}
        <Box className={classes.editorShell}>
          <EditorContent editor={editor} />
        </Box>
      </Box>
    );
  }
);

LeadDraftTiptapEditor.displayName = 'LeadDraftTiptapEditor';
