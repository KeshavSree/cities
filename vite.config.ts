import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
  },
  build: {
    chunkSizeWarningLimit: 650,
    rolldownOptions: {output: {codeSplitting: {groups: [
      {name:'three-addons',test:/node_modules[\\/]three[\\/]examples[\\/]/,priority:20,includeDependenciesRecursively:false},
      {name:'three',test:/node_modules[\\/]three[\\/]/,priority:10,includeDependenciesRecursively:false},
    ]}}},
  },
});
