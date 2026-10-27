import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{host:'127.0.0.1',watch:{ignored:['**/.worktrees/**','**/.test-data/**','**/.test-fixtures/**']},proxy:{'/api':{target:process.env.SCENE_API_URL || 'http://127.0.0.1:8000'}}}});
