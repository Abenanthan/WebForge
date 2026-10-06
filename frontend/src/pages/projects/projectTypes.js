import { Atom, Code, Palette } from 'lucide-react';

/** Project types: how they are labelled and which lab opens them. */
export const PROJECT_TYPES = {
  web: { label: 'Web page', icon: Code, lab: 'Web Playground', open: (id) => `/lab/web-playground?project=${id}` },
  canvas: { label: 'Drawing', icon: Palette, lab: 'Canvas Studio', open: (id) => `/lab/canvas-studio?project=${id}` },
  jsx: { label: 'JSX', icon: Atom, lab: 'JSX Playground', open: (id) => `/lab/component-studio/jsx?project=${id}` },
};
