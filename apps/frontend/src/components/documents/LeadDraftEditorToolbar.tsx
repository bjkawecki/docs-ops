import { Button, Group, Tooltip } from '@mantine/core';
import type { Editor } from '@tiptap/core';
import { authorSelectionTouchesCanon } from '../../tiptap/authorFormatGuards.js';

type Props = {
  editor: Editor;
  authorMode: boolean;
};

const AUTHOR_INLINE_DISABLED =
  'Inline formatting applies only to your suggested text, not existing content.';

export function LeadDraftEditorToolbar({ editor, authorMode }: Props) {
  const inlineDisabled = authorMode && authorSelectionTouchesCanon(editor);

  const inlineButton = (label: string, active: boolean, onClick: () => void, disabled: boolean) => {
    const button = (
      <Button
        size="compact-xs"
        variant={active ? 'filled' : 'light'}
        disabled={disabled}
        onClick={onClick}
      >
        {label}
      </Button>
    );
    if (!disabled) return button;
    return (
      <Tooltip label={AUTHOR_INLINE_DISABLED} withArrow>
        <span>{button}</span>
      </Tooltip>
    );
  };

  return (
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
      {!authorMode && (
        <>
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
            Code block
          </Button>
        </>
      )}
      {inlineButton(
        'Bold',
        editor.isActive('bold'),
        () => {
          editor.chain().focus().toggleBold().run();
        },
        inlineDisabled
      )}
      {inlineButton(
        'Italic',
        editor.isActive('italic'),
        () => {
          editor.chain().focus().toggleItalic().run();
        },
        inlineDisabled
      )}
      {inlineButton(
        'Inline code',
        editor.isActive('code'),
        () => {
          editor.chain().focus().toggleCode().run();
        },
        inlineDisabled
      )}
      <Button
        size="compact-xs"
        variant="subtle"
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        Paragraph
      </Button>
    </Group>
  );
}
