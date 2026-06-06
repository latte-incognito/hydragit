import '$styles/vscode-theme.css';
import '@vscode/codicons/dist/codicon.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.body });
