/// <reference types="svelte" />

// Side-effect CSS imports (theme, codicons) carry no types — declare the module
// so svelte-check/tsc don't flag `import './x.css'`.
declare module '*.css';
