import { Extension } from '@tiptap/core';

/**
 * Stabile `documentId`-nahe Block-IDs für Roundtrip (Suggestions referenzieren `blockId`).
 */
export const BlockIdExtension = Extension.create({
  name: 'blockId',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'codeBlock', 'bulletList', 'listItem'],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-block-id'),
            renderHTML: (attributes) => {
              const id = attributes.blockId as string | null | undefined;
              if (!id) return {};
              return { 'data-block-id': id };
            },
          },
        },
      },
    ];
  },
});
