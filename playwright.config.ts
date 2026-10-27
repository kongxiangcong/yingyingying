import { defineConfig } from '@playwright/test';
import path from 'node:path';
const python=process.env.SCENE_PYTHON || 'python';
const apiPort=process.env.SCENE_API_PORT || '8000';
const uiPort=process.env.SCENE_UI_PORT || '5173';
export default defineConfig({testDir:'tests',workers:1,use:{baseURL:`http://127.0.0.1:${uiPort}`,headless:true},webServer:[{command:`"${python}" -m uvicorn server.app:app --host 127.0.0.1 --port ${apiPort}`,port:Number(apiPort),env:{SCENE_DATA_DIR:process.env.SCENE_TEST_DATA_DIR || `.test-data/run-${process.pid}`,SCENE_ALIGNMENT_COMMAND:JSON.stringify([python,path.resolve('tests/fixtures/fixed_alignment.py')]),SCENE_MODEL_PROVIDER:'codex',SCENE_MODEL_MODEL:'fixture-codex-model',SCENE_CODEX_COMMAND:JSON.stringify([python,path.resolve('tests/fixtures/fixed_model.py')]),SCENE_CONTEXT_CHUNK_SIZE:'2',SCENE_MODEL_TIMEOUT:'1',SCENE_FAULT_CONTROL:path.resolve('.test-data/fault-control.json')}},{command:`npm run dev -- --port ${uiPort}`,port:Number(uiPort),env:{SCENE_API_URL:`http://127.0.0.1:${apiPort}`}}]});
