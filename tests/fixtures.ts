import path from 'node:path';
import fs from 'node:fs';
let root=process.cwd();
while(!fs.existsSync(path.join(root,'.local-tools')) && path.dirname(root)!==root)root=path.dirname(root);
export const fixture=path.join(root,'test-materials','peppa-pig-muddy-puddles');
